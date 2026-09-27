"""Monday weekly summary: days since each project's last sync, per tech."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from .config import Settings
from .mailer import Mailer, esc
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
    return ((now or datetime.now(timezone.utc)) - when).days


def active_projects(store: HitlistStore, now: datetime | None = None) -> list[dict[str, Any]]:
    out = []
    for p in store.rows("Projects"):
        if p.get("status", "").lower() in ("archived", "deleted"):
            continue
        out.append({**p, "days": days_since(p.get("last_sync", ""), now)})
    # Never-synced first, then the stalest.
    return sorted(out, key=lambda p: (p["days"] is not None, -(p["days"] or 0)))


def _table(projects: list[dict[str, Any]], app_url: str) -> str:
    rows = []
    for p in projects:
        days = "never synced" if p["days"] is None else f"{p['days']} day{'s' if p['days'] != 1 else ''}"
        stale = p["days"] is None or p["days"] >= 7
        pct = f"{p['fields_pct']}%" if p.get("fields_pct") else "–"
        link = (f'<a href="{esc(app_url)}/projects/{esc(project_key(p))}">Refresh</a>' if app_url else "")
        rows.append(
            f"<tr><td>{esc(p['project_number'])}</td><td>{esc(p['name'])}</td><td>{esc(p.get('tech'))}</td>"
            f"<td style=\"{'color:#b42318;font-weight:bold' if stale else ''}\">{days}</td>"
            f"<td>{pct}</td><td>{esc(p.get('open_high') or 0)}</td><td>{link}</td></tr>")
    head = ("<tr style=\"background:#eee\"><th align=left>Project #</th><th align=left>Project</th>"
            "<th align=left>Tech</th><th align=left>Since last sync</th><th align=left>Complete</th>"
            "<th align=left>Open high</th><th></th></tr>")
    return ("<table cellpadding=6 style=\"border-collapse:collapse;border:1px solid #ddd\">"
            + head + "".join(rows) + "</table>")


def send_weekly_summary(store: HitlistStore, settings: Settings, mailer: Mailer,
                        now: datetime | None = None, dry_run: bool = False) -> dict[str, int]:
    projects = active_projects(store, now)
    by_email: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in projects:
        email = store.email_for(p.get("tech", ""))
        if email:
            by_email[email].append(p)
    sent = {}
    intro = ("<p>Here are your projects and how long since each was last synced. "
             "Press <b>Refresh</b> on any project you've worked on this week.</p>")
    for email, mine in by_email.items():
        mailer.send([email], "Weekly Hitlist summary", intro + _table(mine, settings.app_url), dry_run)
        sent[email] = len(mine)
    for email in admin_emails(store, settings):
        mailer.send([email], "Weekly Hitlist summary: all projects",
                    "<p>All active projects, stalest first.</p>" + _table(projects, settings.app_url), dry_run)
        sent[email] = len(projects)
    return sent
