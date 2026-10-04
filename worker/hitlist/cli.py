"""Command line for the Hitlist worker.

    python -m hitlist check EXPORT.xlsx [--out results.json]   check one export file, no Google needed
    python -m hitlist setup --admin EMAIL --name "Rick"         create the sheet tabs, seed rules, add an admin
    python -m hitlist add-project NUMBER "NAME" --tech Rick    add a project (until the web app exists)
    python -m hitlist refresh NUMBER --by EMAIL                 queue a refresh
    python -m hitlist run                                       worker loop (what the mini PC runs)
    python -m hitlist run-once                                  handle queued refreshes, then stop
    python -m hitlist weekly-summary [--dry-run]                send the Monday summary emails
    python -m hitlist publish NUMBER                            re-send a project's last results to the website
    python -m hitlist update-rules TYPE_KEY [--statuses]        copy a type's sheet/column links (and names) from the bundled rules
    python -m hitlist dropbox-setup [--relink]                  connect the read-only Dropbox app (once), then test it
    python -m hitlist dropbox-test                              show what the server can see in Dropbox
    python -m hitlist docs NUMBER                               read a project's Dropbox documents now
    python -m hitlist values NUMBER                             re-send a project's BuildingStart values (last export) and check them
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path

from .engine import check_project, gap_check, missing_by_field
from .export_reader import read_export
from .rules import load_rules


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="hitlist")
    p.add_argument("--env", default=".env", help="settings file (default .env)")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="Check a BuildingStart export against the rules")
    c.add_argument("export", type=Path)
    c.add_argument("--rules", type=Path, help="rules JSON (default: bundled seed rules)")
    c.add_argument("--out", type=Path, help="write the results JSON here")
    c.add_argument("--previous", type=Path, help="previous results JSON, for the export gap check")
    s = sub.add_parser("setup", help="Create sheet tabs, seed rules, add an admin")
    s.add_argument("--admin", action="append", default=[], help="admin email (repeatable)")
    s.add_argument("--name", action="append", default=[], help="admin name, same order as --admin")
    a = sub.add_parser("add-project")
    a.add_argument("number")
    a.add_argument("name")
    a.add_argument("--tech", default="")
    a.add_argument("--address", default="")
    r = sub.add_parser("refresh")
    r.add_argument("number")
    r.add_argument("--by", required=True, help="email or name of the person asking")
    sub.add_parser("run")
    sub.add_parser("run-once")
    ur = sub.add_parser("update-rules", help="Copy a type's sheet and column links from the bundled rules")
    ur.add_argument("type_key", nargs="+", help="e.g. fcu edh_sub")
    ur.add_argument("--statuses", action="store_true", help="also reset required/optional/ignore to the bundled choice")
    pub = sub.add_parser("publish", help="Re-send a project's last results to the website")
    pub.add_argument("number")
    w = sub.add_parser("weekly-summary")
    w.add_argument("--dry-run", action="store_true", help="build the emails but don't send them")
    ds = sub.add_parser("dropbox-setup", help="Connect the read-only Dropbox app and test it")
    ds.add_argument("--relink", action="store_true", help="approve the app again (new refresh token)")
    sub.add_parser("dropbox-test", help="Show the technician and project folders the server can see")
    dc = sub.add_parser("docs", help="Read a project's Dropbox documents now and send them to the website")
    dc.add_argument("number")
    va = sub.add_parser("values", help="Re-send a project's BuildingStart values from its last export and check them")
    va.add_argument("number")
    args = p.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.cmd == "check":
        return _check(args)
    if args.cmd in ("dropbox-setup", "dropbox-test"):
        return _dropbox(args)

    from .config import Settings
    from .mailer import Mailer
    from .store import HitlistStore, SheetsBackend

    settings = Settings.from_env(args.env)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), _file_log()])
    if args.cmd == "publish":
        from .runner import app_url, publish
        f = settings.results_dir / f"{args.number}.json"
        if not f.exists():
            print(f"No results saved for {args.number} yet ({f}). Press Sync on the website first.")
            return 1
        print(f"Sending {f.name} ({f.stat().st_size // 1024} KB) to {app_url(settings) or '(APP_URL not set)'} ...")
        problem = publish(settings, args.number, f.read_text(encoding="utf-8"))
        print("Problem: " + problem if problem else "Done. The Equipment grid should show on the project page now.")
        return 1 if problem else 0
    if not settings.sheet_id or not settings.service_account_file:
        print("Set HITLIST_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_FILE in .env first.")
        return 2
    store = HitlistStore(SheetsBackend(settings.sheet_id, settings.service_account_file))
    mailer = Mailer(settings.gmail_address, settings.gmail_app_password, settings.sender_name)

    if args.cmd == "setup":
        created = store.setup()
        print(f"Tabs ready ({'created ' + ', '.join(created) if created else 'already there'}).")
        seeded = store.seed_rules(json.loads(json.dumps(_seed_dict())))
        print(f"Rules: {'seeded ' + str(seeded) + ' rows' if seeded else 'already there, left alone'}.")
        existing = {u["email"].lower() for u in store.rows("Users")}
        for i, email in enumerate(args.admin):
            if email.lower() not in existing:
                name = args.name[i] if i < len(args.name) else email.split("@")[0]
                store.append("Users", [{"email": email, "name": name, "role": "admin",
                                        "active": "yes", "added": date.today().isoformat()}])
                print(f"Added admin {email}.")
        return 0
    if args.cmd == "update-rules":
        for key in args.type_key:
            n = store.refresh_rule_mapping(_seed_dict(), key, statuses=args.statuses)
            print(f"{key}: {n} field(s) added or updated" if n else f"{key}: already up to date")
        return 0
    if args.cmd == "add-project":
        if store.project(args.number):
            print(f"Project {args.number} already exists.")
            return 1
        store.append("Projects", [{"project_number": args.number, "name": args.name, "tech": args.tech,
                                   "date": date.today().isoformat(), "address": args.address,
                                   "status": "active"}])
        print(f"Added {args.number} {args.name}.")
        return 0
    if args.cmd == "refresh":
        print(f"Queued refresh {store.request_refresh(args.number, args.by)}.")
        return 0

    from .runner import process_next, run_forever
    if args.cmd == "run":
        run_forever(store, settings, mailer)
        return 0
    if args.cmd == "run-once":
        n = 0
        while process_next(store, settings, mailer):
            n += 1
        print(f"Handled {n} refresh request(s).")
        return 0
    if args.cmd == "docs":
        from .runner import process_docs_job
        store.setup()                       # make sure the new Projects/Queue columns exist
        job_id = store.request_refresh(args.number, "server", kind="docs")
        job = next(j for j in store.rows("Queue") if j["id"] == job_id)
        process_docs_job(store, settings, job)
        p = store.project(args.number) or {}
        print(f"Folder: {p.get('dropbox_path', '(none)')}\nResult: {p.get('docs_status', '')}")
        return 0
    if args.cmd == "values":
        return _values(store, settings, args.number)
    if args.cmd == "weekly-summary":
        from .summary import send_weekly_summary
        sent = send_weekly_summary(store, settings, mailer, dry_run=args.dry_run)
        print(("Would send" if args.dry_run else "Sent") + f" {len(sent)} email(s): {sent}")
        return 0
    return 1


def _ask_token(label: str, current: str, relink: bool = False) -> str:
    """Ask for a key or secret (pasted). Rejects stray characters, e.g. a paste that didn't go in.
    On --relink, Enter keeps the one already saved."""
    if current and not relink:
        return current
    while True:
        v = input(f"{label}{' (Enter = keep the saved one)' if current else ''}: ").strip()
        if not v and current:
            return current
        if v and v.isalnum():
            return v
        print("  That doesn't look right (it should be letters and numbers only). Paste it again;"
              " in this window right-click also pastes.")


def _dropbox(args) -> int:
    """Connect the Dropbox app (the key goes into .env, never on screen) and list what it can see."""
    import webbrowser
    from .config import Settings, load_dotenv
    from .dropbox import Dropbox, DropboxError, authorize_url, connection_report, exchange_code, set_env_values

    load_dotenv(args.env)
    st = Settings.from_env(None)
    try:
        if args.cmd == "dropbox-setup" and (args.relink or not st.dropbox_refresh_token):
            # Plain input, not a hidden prompt: Windows' hidden prompt ignores Ctrl+V, so a pasted secret goes missing.
            key = _ask_token("Dropbox App key (Settings tab of the app)", st.dropbox_app_key, args.relink)
            secret = _ask_token("Dropbox App secret (same tab, click Show)", st.dropbox_app_secret, args.relink)
            url = authorize_url(key, fresh_sign_in=args.relink)
            print("\nOpening Dropbox. Sign in with the work (team) account, not a personal one,"
                  " click Continue, then Allow.")
            print(f"If no browser opens, copy this into one:\n  {url}\n")
            webbrowser.open(url)
            code = input("Paste the code Dropbox shows you, then press Enter: ").strip()
            token = exchange_code(key, secret, code)
            set_env_values(args.env, {"DROPBOX_APP_KEY": key, "DROPBOX_APP_SECRET": secret, "DROPBOX_REFRESH_TOKEN": token})
            print(f"Saved to {args.env}.\n")
            st.dropbox_app_key, st.dropbox_app_secret, st.dropbox_refresh_token = key, secret, token
        dbx = Dropbox(st.dropbox_app_key, st.dropbox_app_secret, st.dropbox_refresh_token)
        for line in connection_report(dbx, st.dropbox_tech_folder):
            print(line)
        return 0
    except DropboxError as e:
        print(f"Dropbox problem: {e}")
        return 1


def _seed_dict():
    from importlib import resources
    return json.loads(resources.files("hitlist.data").joinpath("rules_seed.json").read_text(encoding="utf-8"))


def _file_log() -> logging.Handler:
    Path("logs").mkdir(exist_ok=True)
    return logging.FileHandler(Path("logs") / "worker.log", encoding="utf-8")


def _check(args) -> int:
    results = check_project(read_export(args.export), load_rules(args.rules))
    if args.previous and args.previous.exists():
        results["gap_flags"] = gap_check(json.loads(args.previous.read_text(encoding="utf-8")), results)
    if args.out:
        args.out.write_text(json.dumps(results, ensure_ascii=False, default=str), encoding="utf-8")

    s = results["summary"]
    print(f"Project {results['project_number']}: {s['fields_pct']}% of required fields filled, "
          f"{s['units_complete']}/{s['units']} units complete")
    for t in results["types"]:
        ts = t["summary"]
        top = ", ".join(f"{k} ({v})" for k, v in list(missing_by_field(t).items())[:3])
        print(f"  {t['name']:<26} {ts['units']:>4} units  {ts['fields_pct']:>5}%  "
              f"{ts['units_complete']:>4} complete  {('most missing: ' + top) if top else ''}")
    d = results["deficiency_summary"]
    print(f"Deficiencies: {d['open']} open / {d['total']} total  by priority {d['open_by_priority']}")
    if results["untracked_sheets"]:
        print(f"Not tracked yet: {results['untracked_sheets']}")
    for w in results["warnings"]:
        print(f"  note: {w}")
    for g in results.get("gap_flags", []):
        print(f"  GAP: {g}")
    return 0


def _values(store, settings, number: str) -> int:
    """Send one project's BuildingStart values from its last downloaded export and show what the website confirmed."""
    from .runner import send_project_values
    from .store import now_iso
    from .values import pack_values
    store.setup()                           # make sure the values columns exist
    folder = settings.export_dir / number.replace("/", "_")
    files = sorted(folder.rglob("*.xlsx"), key=lambda f: f.stat().st_mtime) if folder.exists() else []
    if not files:
        print(f"No downloaded export for {number} in {folder}. Press Sync on the website first.")
        return 1
    print(f"Export: {files[-1]}")
    export = read_export(files[-1])
    counts = pack_values(export, number)["counts"]
    print(f"Sending: {counts['units']} units, {counts['values']} values")
    problem = send_project_values(store, settings, number, export, now_iso(), force=True)
    if problem:
        print(f"PROBLEM: {problem}")
        return 1
    p = store.project(number) or {}
    print(f"Website confirmed: {p.get('values_status', '')}")
    return 0
