"""Write docs/RULES.md from the rules JSON so the rules are easy to review."""

import json
import sys
from pathlib import Path

src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parents[1] / "hitlist/data/rules_seed.json"
dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parents[2] / "docs/RULES.md"
data = json.loads(src.read_text(encoding="utf-8"))
MARK = {"required": "✖ Required", "optional": "⚠ Optional", "ignore": "Ignore"}
out = ["# Hitlist rules", "",
       "Which BuildingStart fields each equipment type needs. ✖ Required fields count toward completion %; "
       "⚠ Optional fields show as warnings only. Seeded from the Macro Scheduler scripts; "
       "these will be editable in the web app.", "",
       f"Source: {data.get('source', '')}", ""]
for t in data["types"]:
    sheet = t["export_sheet"] + ("" if t.get("export_sheet_confirmed", True) else " *(sheet name not yet confirmed)*")
    out += [f"## {t['name']}", "", f"Export sheet: **{sheet}**" +
            (f" · only units under: {', '.join(t['parent_types'])}" if t.get("parent_types") else ""), "",
            "| Field | Status | Export column(s) | Only when |", "| --- | --- | --- | --- |"]
    for f in t["fields"]:
        cols = " / ".join(f["columns"]) if f.get("columns") else "*(matched automatically)*"
        when = "; ".join(f"{c.get('column') or c.get('label')} {'= ' + c['equals'] if 'equals' in c else '> ' + str(c['gt'])}"
                         for c in (f.get("when") or []))
        out.append(f"| {f['label']} | {MARK[f['status']]} | {cols} | {when} |")
    out.append("")
dst.write_text("\n".join(out), encoding="utf-8")
print(f"wrote {dst}")
