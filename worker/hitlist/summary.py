"""Monday weekly summary: days since each project's last sync, per tech."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
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


def send_weekly_summary(store: HitlistStore, settings: Settings, mailer: Mailer,
                        now: datetime | None = None, dry_run: bool = False) -> dict[str, int]:
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
        mailer.send([email], "Weekly Hitlist summary", html, dry_run, text=text)
        sent[email] = len(mine)
    for email in admin_emails(store, settings):
        html, text = _body("All active projects, the longest since a sync first.", projects, settings.app_url, show_tech=True)
        mailer.send([email], "Weekly Hitlist summary: all projects", html, dry_run, text=text)
        sent[email] = len(projects)
    return sent
