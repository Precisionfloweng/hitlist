"""The worker loop: take the next refresh request, export, check, save, email."""

from __future__ import annotations

import inspect
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

from .config import Settings
from .engine import check_project, dashboard_rows, gap_check
from .export_reader import read_export
from .exporter import ExportError, run_export
from .mailer import Mailer, esc
from .rules import load_rules
from .store import DONE, FAILED, RUNNING, HitlistStore, now_iso

log = logging.getLogger("hitlist")

# export_fn(project) or export_fn(project, step) -> path of the downloaded xlsx
ExportFn = Callable[..., Path]
StepFn = Callable[[str], None]


def default_export_fn(settings: Settings) -> ExportFn:
    if settings.export_command:
        def command(project: str, step: StepFn = lambda m: None) -> Path:
            step("Running the export script (large projects take 5-10 min)")
            return run_export(settings.export_command, project, settings.export_dir,
                              settings.export_timeout_minutes)
        return command

    def builtin(project: str, step: StepFn = lambda m: None) -> Path:
        from .buildingstart import download_project_xlsx

        def status(m: str) -> None:
            log.info("[BuildingStart] %s", m)
            step(m)
        try:
            return download_project_xlsx(project, settings.export_dir / project,
                                         settings.buildingstart_username, settings.buildingstart_password,
                                         settings.browser_session_dir,
                                         download_timeout_minutes=settings.export_timeout_minutes,
                                         status=status)
        except Exception as exc:  # noqa: BLE001 - surface as an export failure (retried once)
            raise ExportError(str(exc)) from exc
    return builtin


def process_next(store: HitlistStore, settings: Settings, mailer: Mailer,
                 export_fn: ExportFn | None = None) -> bool:
    """Handle one queued refresh. Returns False when the queue is empty."""
    job = store.next_job()
    if job is None:
        return False
    export_fn = export_fn or default_export_fn(settings)
    number = job["project_number"]
    store.set_job(job, status=RUNNING, started_at=now_iso(), message="Picked up by the mini PC")
    log.info("Refreshing %s (requested by %s)", number, job["requested_by"])
    project = store.project(number)
    step = _stepper(store, job)
    try:
        if project is None:
            raise ExportError(f"Project {number} is not on the Projects list")
        results = _refresh(store, settings, number, export_fn, step)
    except Exception as exc:  # noqa: BLE001 - any failure is reported, the loop keeps going
        log.exception("Refresh of %s failed", number)
        message = str(exc)[:500]
        store.set_job(job, status=FAILED, finished_at=now_iso(), message=message)
        if project is not None:
            store.update_project(number, last_sync_status=f"failed: {message[:100]}")
        _email_failure(store, settings, mailer, job, project, message)
        return True

    step("Sending the sync-complete email")
    store.set_job(job, status=DONE, finished_at=now_iso(), message="ok")
    _email_success(store, settings, mailer, job, project, results)
    return True


def _stepper(store: HitlistStore, job: dict[str, str]) -> StepFn:
    """Write what the worker is doing to the job's message so the website can show it."""
    def step(message: str) -> None:
        if job.get("message") == message:
            return
        try:
            store.set_job(job, message=message)
        except Exception:  # noqa: BLE001 - a status update must never break the sync
            log.warning("Could not update the job status to %r", message)
    return step


def _call_export(export_fn: ExportFn, number: str, step: StepFn) -> Path:
    try:
        takes_step = len(inspect.signature(export_fn).parameters) >= 2
    except (TypeError, ValueError):
        takes_step = False
    return export_fn(number, step) if takes_step else export_fn(number)


def _refresh(store: HitlistStore, settings: Settings, number: str, export_fn: ExportFn,
             step: StepFn = lambda m: None) -> dict[str, Any]:
    step("Starting the BuildingStart export")
    try:
        path = _call_export(export_fn, number, step)
    except ExportError as exc:
        log.warning("Export failed once for %s, retrying", number)
        step(f"Export failed ({str(exc)[:80]}); trying again")
        path = _call_export(export_fn, number, step)

    step("Reading the export")
    export = read_export(path)
    step("Checking every unit against the rules")
    rules_dict = store.load_rules_dict()
    rules = load_rules(rules_dict) if rules_dict else load_rules()
    results = check_project(export, rules, project_number=number)

    settings.results_dir.mkdir(parents=True, exist_ok=True)
    result_file = settings.results_dir / f"{number}.json"
    previous = json.loads(result_file.read_text(encoding="utf-8")) if result_file.exists() else None
    results["gap_flags"] = gap_check(previous, results)
    result_file.write_text(json.dumps(results, ensure_ascii=False, default=str), encoding="utf-8")
    step("Sending results to the website")
    _publish(settings, number, results)

    step("Updating the dashboard")

    stamp = now_iso()
    store.replace_for_project("Dashboard", number,
                              [{**r, "updated_at": stamp} for r in dashboard_rows(results)])
    d = results["deficiency_summary"]
    groups = [("status", d["by_status"]), ("open_priority", d["open_by_priority"]),
              ("open_role", d["open_by_role"]), ("open_contact", d["open_by_contact"])]
    store.replace_for_project("Deficiencies", number, [
        {"project_number": number, "group": g, "value": v, "count": c, "updated_at": stamp}
        for g, counts in groups for v, c in counts.items()])
    s = results["summary"]
    open_high = d["open_by_priority"].get("High", 0)
    store.append("History", [{"project_number": number, "synced_at": stamp, "fields_pct": s["fields_pct"],
                              "units_pct": s["units_pct"], "units": s["units"],
                              "open_deficiencies": d["open"], "open_high": open_high}])
    store.update_project(number, last_sync=stamp, last_sync_status="ok", fields_pct=s["fields_pct"],
                         units_pct=s["units_pct"], units=s["units"], open_deficiencies=d["open"],
                         open_high=open_high, gap_flags=len(results["gap_flags"]))
    return results


def _publish(settings: Settings, number: str, results: dict[str, Any]) -> None:
    """Hand the results file to the web app (which stores it in Vercel Blob)."""
    if not settings.app_url:
        return
    import requests
    try:
        r = requests.post(f"{settings.app_url}/api/worker/results/{number}", json=results,
                          headers={"x-worker-secret": settings.worker_secret}, timeout=60)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not send results for %s to the web app: %s", number, exc)


def _link(settings: Settings, number: str) -> str:
    return f'<p><a href="{esc(settings.app_url)}/projects/{esc(number)}">Open the project</a></p>' \
        if settings.app_url else ""


def _email_success(store, settings, mailer, job, project, results) -> None:
    to = store.email_for(job["requested_by"])
    if not to:
        return
    s, d = results["summary"], results["deficiency_summary"]
    gaps = results.get("gap_flags") or []
    gap_line = (f"<p><b>{len(gaps)} possible export gap(s)</b> were flagged: data that was there last "
                "sync is blank now. Check the project page.</p>") if gaps else ""
    body = (f"<p>The sync for <b>{esc(job['project_number'])} {esc(project.get('name'))}</b> finished "
            "with no errors.</p>"
            f"<p>{s['fields_pct']}% of required fields filled · {s['units_complete']} of {s['units']} units "
            f"complete · {d['open']} open deficiencies ({d['open_by_priority'].get('High', 0)} high)</p>"
            + gap_line + _link(settings, job["project_number"]))
    mailer.send([to], f"Sync complete: {job['project_number']} {project.get('name', '')}", body)


def _email_failure(store, settings, mailer, job, project, message) -> None:
    admins = admin_emails(store, settings)
    requester = store.email_for(job["requested_by"])
    name = project.get("name", "") if project else ""
    body = (f"<p>The sync for <b>{esc(job['project_number'])} {esc(name)}</b> failed.</p>"
            f"<p>Reason: {esc(message)}</p><p>Rick has been notified.</p>")
    mailer.send([e for e in [requester, *admins] if e], f"Sync failed: {job['project_number']} {name}", body)


def admin_emails(store: HitlistStore, settings: Settings) -> list[str]:
    return sorted({*settings.admin_emails,
                   *(u["email"] for u in store.users() if u.get("role", "").lower() == "admin")})


def run_forever(store: HitlistStore, settings: Settings, mailer: Mailer) -> None:
    log.info("Worker started; checking the queue every %ss", settings.poll_seconds)
    while True:
        try:
            while process_next(store, settings, mailer):
                pass
        except Exception:  # noqa: BLE001 - e.g. Google briefly unreachable; try again next poll
            log.exception("Queue check failed")
        time.sleep(settings.poll_seconds)
