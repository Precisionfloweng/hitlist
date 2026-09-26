"""Command line: python -m hitlist check EXPORT.xlsx [--rules rules.json] [--out results.json]"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .engine import check_project, gap_check, missing_by_field
from .export_reader import read_export
from .rules import load_rules


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="hitlist")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="Check a BuildingStart export against the rules")
    c.add_argument("export", type=Path)
    c.add_argument("--rules", type=Path, help="rules JSON (default: bundled seed rules)")
    c.add_argument("--out", type=Path, help="write the results JSON here")
    c.add_argument("--previous", type=Path, help="previous results JSON, for the export gap check")
    args = p.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
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
