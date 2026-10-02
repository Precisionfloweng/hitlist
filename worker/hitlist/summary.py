"""Monday weekly summary: days since each project's last sync, per tech."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import Settings
from .mailer import BRAND, FONT, MUTED, Mailer, esc
from .runner import admin_emails
from .store import HitlistStore, project_key


def days_since(stamp: str, now: datetime | None = None) -> int | None:
    if not stamp:
        return None
    try:
        when = datetime.fromisoformat(stamp)
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    # Calendar days in the server's own time zone (Central), so last night's sync is 1 day, not 0.
    return ((now or datetime.now(timezone.utc)).astimezone().date() - when.astimezone().date()).days


def active_projects(store: HitlistStore, now: datetime | None = None) -> list[dict[str, Any]]:
    out = []
    for p in store.rows("Projects"):
        if p.get("status", "").lower() in ("archived", "deleted"):
            continue
        out.append({**p, "days": days_since(p.get("last_sync", ""), now)})
    # Never-synced first, then the stalest.
    return sorted(out, key=lambda p: (p["days"] is not None, -(p["days"] or 0)))


def when_text(days: int | None) -> str:
    if days is None:
        return "Never synced"
    return "Today" if days == 0 else "Yesterday" if days == 1 else f"{days} days ago"


def _pct(p: dict[str, Any]) -> str:
    try:
        return f"{round(float(p.get('fields_pct')))}%"
    except (TypeError, ValueError):
        return "–"


def _link(app_url: str, p: dict[str, Any]) -> str:
    return f"{app_url.rstrip('/')}/projects/{project_key(p)}" if app_url else ""


def _table(projects: list[dict[str, Any]], app_url: str, show_tech: bool) -> str:
    def th(i: int) -> str:     # Project left-aligned, every other column centered
        align = "left" if i == 0 else "center"
        return (f'align="{align}" style="text-align:{align};padding:8px 10px;background:{BRAND};color:#ffffff;'
                f'font-family:{FONT};font-size:13px;font-weight:bold"')
    cols = ["Project", *(["Tech"] if show_tech else []), "Last sync", "Complete", "Open deficiencies"]
    head = "<tr>" + "".join(f"<th {th(i)}>{c}</th>" for i, c in enumerate(cols)) + "</tr>"
    rows = []
    for i, p in enumerate(projects):
        bg = "#f1f4f8" if i % 2 else "#ffffff"

        def td(n: int) -> str:
            align = "left" if n == 0 else "center"
            return (f'align="{align}" style="text-align:{align};padding:8px 10px;border-bottom:1px solid #e3e6eb;'
                    f'font-family:{FONT};font-size:14px;background:{bg}"')
        stale = p["days"] is None or p["days"] >= 7
        url = _link(app_url, p)
        name = f"{esc(p['project_number'])} {esc(p['name'])}"
        name = f'<a href="{esc(url)}" style="color:{BRAND};font-weight:bold;text-decoration:none">{name}</a>' if url else f"<b>{name}</b>"
        when = when_text(p["days"])
        when = f'<span style="color:#b42318;font-weight:bold">{when}</span>' if stale else when
        cells = [name, *([esc(p.get("tech"))] if show_tech else []), when, _pct(p), esc(p.get("open_deficiencies") or 0)]
        rows.append("<tr>" + "".join(f"<td {td(n)}>{c}</td>" for n, c in enumerate(cells)) + "</tr>")
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'style="border-collapse:collapse;border:1px solid #e3e6eb">' + head + "".join(rows) + "</table>")


def _text(projects: list[dict[str, Any]], app_url: str, show_tech: bool) -> str:
    out = []
    for p in projects:
        tech = f" ({p.get('tech')})" if show_tech and p.get("tech") else ""
        out.append(f"{p['project_number']} {p['name']}{tech}\n"
                   f"   Last sync: {when_text(p['days'])} | Complete: {_pct(p)} | "
                   f"Open deficiencies: {p.get('open_deficiencies') or 0}"
                   + (f"\n   {_link(app_url, p)}" if app_url else ""))
    return "\n\n".join(out)


def _body(intro: str, projects: list[dict[str, Any]], app_url: str, show_tech: bool) -> tuple[str, str]:
    html = (f"<p style=\"margin:0 0 14px\">{intro}</p>" + _table(projects, app_url, show_tech)
            + f'<p style="margin:14px 0 0;font-size:12px;color:{MUTED}">Red means 7 or more days since the last sync.</p>')
    return html, intro + "\n\n" + _text(projects, app_url, show_tech)


log = logging.getLogger(__name__)
WHATS_NEW_DAYS = 30
_LOCAL_WHATS_NEW = Path(__file__).resolve().parents[2] / "web" / "content" / "whats-new.json"


def load_whats_new(settings: Settings) -> list[dict[str, str]]:
    """The "What's new" list, from the website (always current) or else this server's copy of the repo."""
    if settings.app_url and settings.worker_secret:
        try:
            import requests
            r = requests.get(f"{settings.app_url.rstrip('/')}/api/worker/whats-new", timeout=20,
                             headers={"x-worker-secret": settings.worker_secret})
            if r.ok:
                return list(r.json().get("entries", []))
        except Exception:  # noqa: BLE001 - fall back to the local copy
            log.warning("Could not fetch What's new from the website", exc_info=True)
    try:
        return json.loads(_LOCAL_WHATS_NEW.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return []


def whats_new_block(entries: list[dict[str, str]], admin: bool, now: datetime | None = None) -> tuple[str, str]:
    """HTML and text for "New in Hitlist" (last 30 days), or ("", "") when there's nothing new."""
    since = ((now or datetime.now(timezone.utc)).astimezone() - timedelta(days=WHATS_NEW_DAYS)).date().isoformat()
    items = sorted((e for e in entries if e.get("date", "") >= since and (admin or e.get("audience") == "all")),
                   key=lambda e: e.get("date", ""), reverse=True)
    if not items:
        return "", ""
    lis = "".join(
        f'<li style="margin:0 0 6px"><b>{esc(e.get("title"))}</b>{" (admins)" if e.get("audience") == "admins" else ""}: '
        f'{esc(e.get("text"))}</li>' for e in items)
    html = (f'<div style="background:#f4f0fb;border:1px solid #d9cff0;border-radius:8px;padding:12px 16px;margin:0 0 18px">'
            f'<div style="font-family:{FONT};font-size:15px;font-weight:bold;color:#4b3591;margin:0 0 6px">'
            f'New in Hitlist (last 30 days)</div>'
            f'<ul style="margin:0;padding-left:20px;font-family:{FONT};font-size:14px;line-height:1.45">{lis}</ul></div>')
    text = "NEW IN HITLIST (last 30 days)\n" + "\n".join(f"- {e.get('title')}: {e.get('text')}" for e in items) + "\n\n"
    return html, text


def send_weekly_summary(store: HitlistStore, settings: Settings, mailer: Mailer,
                        now: datetime | None = None, dry_run: bool = False,
                        whats_new: list[dict[str, str]] | None = None) -> dict[str, int]:
    entries = load_whats_new(settings) if whats_new is None else whats_new
    new_tech, new_tech_text = whats_new_block(entries, admin=False, now=now)
    new_admin, new_admin_text = whats_new_block(entries, admin=True, now=now)
    projects = active_projects(store, now)
    by_email: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in projects:
        email = store.email_for(p.get("tech", ""))
        if email:
            by_email[email].append(p)
    sent = {}
    intro = "Here are your projects and when each was last synced. Click a project to open it, and press Sync on any you've worked on this week."
    for email, mine in by_email.items():
        html, text = _body(intro, mine, settings.app_url, show_tech=False)
        mailer.send([email], "Weekly Hitlist summary", new_tech + html, dry_run, text=new_tech_text + text)
        sent[email] = len(mine)
    for email in admin_emails(store, settings):
        html, text = _body("All active projects, the longest since a sync first.", projects, settings.app_url, show_tech=True)
        mailer.send([email], "Weekly Hitlist summary: all projects", new_admin + html, dry_run, text=new_admin_text + text)
        sent[email] = len(projects)
    return sent
