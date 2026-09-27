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
from .store import DONE, FAILED, RUNNING, HitlistStore, apply_overrides, now_iso

log = logging.getLogger("hitlist")

# export_fn(project) or export_fn(project, step) -> path of the downloaded xlsx
ExportFn = Callable[..., Path]
StepFn = Callable[[str], None]


def default_export_fn(settings: Settings) -> ExportFn:
    if settings.export_command:
        def command(project: str, step: StepFn = lambda m: None, **_: Any) -> Path:
            step("Downloading export")
            return run_export(settings.export_command, project, settings.export_dir,
                              settings.export_timeout_minutes)
        return command

    def builtin(project: str, step: StepFn = lambda m: None, name: str = "", folder: str = "") -> Path:
        from .buildingstart import download_project_xlsx

        def status(m: str) -> None:
            log.info("[BuildingStart] %s", m)
            step(m)
        try:
            return download_project_xlsx(project, settings.export_dir / (folder or project),
                                         settings.buildingstart_username, settings.buildingstart_password,
                                         settings.browser_session_dir,
                                         download_timeout_minutes=settings.export_timeout_minutes,
                                         status=status, project_name=name)
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
    store.set_job(job, status=RUNNING, started_at=now_iso(), message="Starting")
    log.info("Refreshing %s (requested by %s)", number, job["requested_by"])
    project = store.project(number)
    step = _stepper(store, job)
    try:
        if project is None:
            raise ExportError(f"Project {number} is not on the Projects list")
        results = _refresh(store, settings, number, export_fn, step, project)
    except Exception as exc:  # noqa: BLE001 - any failure is reported, the loop keeps going
        log.exception("Refresh of %s failed", number)
        message = friendly_error(exc, job.get("message", ""))[:500]
        store.set_job(job, status=FAILED, finished_at=now_iso(), message=message)
        if project is not None:
            store.update_project(number, last_sync_status=f"failed: {message[:100]}")
        _email_failure(store, settings, mailer, job, project, message,
                       detail=f"{type(exc).__name__}: {exc}"[:500])
        return True

    store.set_job(job, status=DONE, finished_at=now_iso(), message="ok")
    if results.get("website_problem"):
        _email_website_problem(settings, mailer, job, project, results["website_problem"])
    return True


def friendly_error(exc: BaseException, step: str = "") -> str:
    """Turn an exception into a message people can act on. The technical detail stays in the log."""
    text = str(exc).strip()
    name = type(exc).__name__
    where = f" while {step[0].lower() + step[1:]}" if step and step not in ("ok", "Starting") else ""
    low = text.lower()
    if isinstance(exc, ExportError) and ("not found in buildingstart" in low or "not on the projects list" in low):
        return text                                             # already plain English
    if "not found in buildingstart" in low:
        return text
    if "timeout" in name.lower() or "timed out" in low or "timeout" in low:
        return f"BuildingStart took too long to respond{where}. Try again; if it keeps happening, check that BuildingStart is up."
    if "login" in low or "password" in low or "buildingstart_username" in low:
        return "Couldn't log in to BuildingStart. Check the BuildingStart username and password in the server's .env file."
    if "net::" in low or "connection" in low or "name resolution" in low or "getaddrinfo" in low:
        return f"The server couldn't reach the internet{where}. Check its network connection and try again."
    if "google sheets error" in low or "sheets.googleapis" in low:
        return "The server couldn't update the Google Sheet. Try again in a few minutes."
    if step in ("Reading export", "Checking rules") or name in ("BadZipFile", "InvalidFileException", "KeyError", "ValueError"):
        return (f"The BuildingStart export couldn't be read{where} (it may contain a value the checker "
                "doesn't understand). Rick has been sent the details.")
    if isinstance(exc, ExportError):
        return f"The BuildingStart export failed{where}: {text}"
    return f"Something went wrong{where}. Rick has been sent the details."


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


def _call_export(export_fn: ExportFn, number: str, step: StepFn, name: str = "", folder: str = "") -> Path:
    try:
        params = inspect.signature(export_fn).parameters
    except (TypeError, ValueError):
        params = {}
    has_kw = any(p.kind == p.VAR_KEYWORD for p in params.values())
    kwargs = {k: v for k, v in (("name", name), ("folder", folder)) if has_kw or k in params}
    return export_fn(number, step, **kwargs) if len(params) >= 2 else export_fn(number)


def _refresh(store: HitlistStore, settings: Settings, number: str, export_fn: ExportFn,
             step: StepFn = lambda m: None, project: dict[str, str] | None = None) -> dict[str, Any]:
    # `number` is the project's key (usually its number). BuildingStart is searched by the real
    # project number, and by name when two projects share a number.
    bs_number = (project or {}).get("project_number") or number
    bs_name = (project or {}).get("name", "")
    try:
        path = _call_export(export_fn, bs_number, step, name=bs_name, folder=number)
    except ExportError as exc:
        log.warning("Export failed once for %s, retrying", number)
        step("Export failed, trying again")
        path = _call_export(export_fn, bs_number, step, name=bs_name, folder=number)

    step("Reading export")
    export = read_export(path)
    step("Checking rules")
    rules_dict = store.load_rules_dict()
    if rules_dict is None:
        rules_dict = json.loads((Path(__file__).parent / "data" / "rules_seed.json").read_text(encoding="utf-8"))
    rules = load_rules(apply_overrides(rules_dict, store.project_rule_overrides(number)))
    results = check_project(export, rules, project_number=number)

    settings.results_dir.mkdir(parents=True, exist_ok=True)
    result_file = settings.results_dir / f"{number}.json"
    previous = json.loads(result_file.read_text(encoding="utf-8")) if result_file.exists() else None
    results["gap_flags"] = gap_check(previous, results)
    result_file.write_text(json.dumps(results, ensure_ascii=False, default=str), encoding="utf-8")
    step("Saving results")
    website_problem = _publish(settings, number, results)

    step("Updating dashboard")

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
    if website_problem:
        results["website_problem"] = website_problem
    return results


def app_url(settings: Settings) -> str:
    url = (settings.app_url or "").strip().rstrip("/")
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def publish(settings: Settings, number: str, results: dict[str, Any] | str) -> str:
    """Hand the results file to the web app (which stores it in Vercel Blob).

    Returns "" on success, otherwise a plain-English reason (the sync itself still counts as done).
    """
    url = app_url(settings)
    if not url:
        return "APP_URL is not set in the server's .env file"
    if not settings.worker_secret:
        return "WORKER_SECRET is not set in the server's .env file"
    import requests
    body = results if isinstance(results, str) else json.dumps(results, ensure_ascii=False, default=str)
    target = f"{url}/api/worker/results/{number}"
    try:
        r = requests.post(target, data=body.encode("utf-8"), timeout=120,
                          headers={"x-worker-secret": settings.worker_secret,
                                   "content-type": "application/json"})
    except Exception as exc:  # noqa: BLE001
        return f"could not reach {url} ({exc.__class__.__name__}: {str(exc)[:150]})"
    if r.ok:
        return ""
    detail = r.text[:200].strip()
    if r.status_code == 401:
        return ("the website rejected the WORKER_SECRET: the one in the server's .env must match "
                "WORKER_SECRET in Vercel exactly")
    if r.status_code == 404:
        return f"{target} was not found (404): check APP_URL in the server's .env"
    return f"the website returned {r.status_code}: {detail}"


def _publish(settings: Settings, number: str, results: dict[str, Any]) -> str:
    problem = publish(settings, number, results)
    if problem:
        log.warning("Could not send results for %s to the website: %s", number, problem)
    return problem


def _link(settings: Settings, number: str) -> str:
    return f'<p><a href="{esc(settings.app_url)}/projects/{esc(number)}">Open the project</a></p>' \
        if settings.app_url else ""


def _email_website_problem(settings, mailer, job, project, problem) -> None:
    """The sync worked but the results didn't reach the website: only Rick needs to know."""
    to = [e for e in settings.failure_emails if e]
    if not to:
        return
    shown = project.get("project_number") or job["project_number"]
    body = (f"<p>The sync for <b>{esc(shown)} {esc(project.get('name'))}</b> finished, but the equipment "
            f"details did not reach the website, so the Equipment checklist won't show this sync.</p>"
            f"<p>Reason: {esc(problem)}</p>" + _link(settings, job["project_number"]))
    mailer.send(to, f"Results not on website: {shown} {project.get('name', '')}", body)


def _email_failure(store, settings, mailer, job, project, message, detail: str = "") -> None:
    requester = store.email_for(job["requested_by"])
    tech = store.email_for((project or {}).get("tech", ""))
    name = project.get("name", "") if project else ""
    shown = (project or {}).get("project_number") or job["project_number"]
    body = (f"<p>The sync for <b>{esc(shown)} {esc(name)}</b> failed.</p>"
            f"<p>Reason: {esc(message)}</p><p>Rick has been notified.</p>"
            + (f'<p style="color:#888;font-size:12px">Technical detail: {esc(detail)}</p>' if detail else ""))
    to = list(dict.fromkeys(e for e in [requester, tech, *settings.failure_emails] if e))   # no Cody, no repeats
    mailer.send(to, f"Sync failed: {shown} {name}", body)


def admin_emails(store: HitlistStore, settings: Settings) -> list[str]:
    return sorted({*settings.admin_emails,
                   *(u["email"] for u in store.users() if u.get("role", "").lower() == "admin")})


def recover_interrupted(store: HitlistStore) -> int:
    """On startup, close off syncs that were 'running' when the worker stopped (e.g. a restart),
    so they don't sit on 'Syncing' until the website's 90-minute cutoff. Returns how many."""
    n = 0
    for job in [j for j in store.rows("Queue") if j.get("status") == RUNNING]:
        if job.get("message") == "Sending email":      # old last step: everything was already saved
            store.set_job(job, status=DONE, finished_at=now_iso(), message="ok")
        else:
            store.set_job(job, status=FAILED, finished_at=now_iso(),
                          message="The server restarted during this sync. Press Refresh to try again.")
        n += 1
    return n


def run_forever(store: HitlistStore, settings: Settings, mailer: Mailer) -> None:
    log.info("Worker started; checking the queue every %ss", settings.poll_seconds)
    try:
        if (n := recover_interrupted(store)):
            log.info("Closed %s sync(s) interrupted by the last restart", n)
    except Exception:  # noqa: BLE001
        log.exception("Could not check for interrupted syncs")
    while True:
        try:
            while process_next(store, settings, mailer):
                pass
        except Exception:  # noqa: BLE001 - e.g. Google briefly unreachable; try again next poll
            log.exception("Queue check failed")
        time.sleep(settings.poll_seconds)
