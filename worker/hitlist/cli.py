"""Command line for the Hitlist worker.

    python -m hitlist check EXPORT.xlsx [--out results.json]   check one export file, no Google needed
    python -m hitlist setup --admin EMAIL --name "Rick"         create the sheet tabs, seed rules, add an admin
    python -m hitlist add-project NUMBER "NAME" --tech Rick    add a project (until the web app exists)
    python -m hitlist refresh NUMBER --by EMAIL                 queue a refresh
    python -m hitlist run                                       worker loop (what the mini PC runs)
    python -m hitlist run-once                                  handle queued refreshes, then stop
    python -m hitlist weekly-summary [--dry-run]                send the Monday summary emails
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
    w = sub.add_parser("weekly-summary")
    w.add_argument("--dry-run", action="store_true", help="build the emails but don't send them")
    args = p.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.cmd == "check":
        return _check(args)

    from .config import Settings
    from .mailer import Mailer
    from .store import HitlistStore, SheetsBackend

    settings = Settings.from_env(args.env)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), _file_log()])
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
    if args.cmd == "weekly-summary":
        from .summary import send_weekly_summary
        sent = send_weekly_summary(store, settings, mailer, dry_run=args.dry_run)
        print(("Would send" if args.dry_run else "Sent") + f" {len(sent)} email(s): {sent}")
        return 0
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
