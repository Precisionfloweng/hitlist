"""Apply the rules to an export and produce results, dashboard numbers and warnings."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from .export_reader import Export
from .matching import best_column
from .rules import IGNORE, OPTIONAL, REQUIRED, RuleSet, TypeRule

# Result codes stored per field (compact, so a big project's results file stays small).
PASS, MISSING_REQUIRED, MISSING_OPTIONAL, NOT_APPLICABLE = "P", "R", "O", "-"
SYMBOL = {PASS: "✓", MISSING_REQUIRED: "✖", MISSING_OPTIONAL: "⚠", NOT_APPLICABLE: ""}

CLOSED_DEFICIENCY = {"fixed", "closed", "resolved", "complete", "completed", "void", "cancelled"}


def is_missing(value: Any) -> bool:
    """Blank cells, and BuildingStart's "can't calculate" markers (?, ??, `), count as missing."""
    if value is None:
        return True
    if isinstance(value, bool):
        return False
    text = str(value).strip()
    return text == "" or set(text) <= {"?", "`"}


def _parent_path(full_path: str) -> str | None:
    parts = [p for p in str(full_path or "").split("/") if p != ""]
    return "/".join(parts[:-1]) if len(parts) > 1 else None


def _resolve_columns(type_rule: TypeRule, headers: list[str], warnings: list[str]) -> list[list[str] | None]:
    """Columns per field; fill in unmapped ones by fuzzy match against this export's headers."""
    header_set = set(headers)
    used = {c for f in type_rule.fields for c in (f.columns or [])}
    resolved: list[list[str] | None] = []
    for f in type_rule.fields:
        if f.columns:
            present = [c for c in f.columns if c in header_set]
            if not present:
                warnings.append(f"{type_rule.name}: column(s) {f.columns} for '{f.label}' not in export")
            resolved.append(present or None)
        else:
            col, score = best_column(f.label, headers, used)
            if col:
                used.add(col)
                warnings.append(f"{type_rule.name}: '{f.label}' auto-matched to column '{col}' "
                                f"({score:.2f}), please confirm in Rules")
                resolved.append([col])
            else:
                warnings.append(f"{type_rule.name}: no export column found for '{f.label}'")
                resolved.append(None)
    return resolved


def _resolve_conditions(type_rule: TypeRule, headers: list[str], warnings: list[str]) -> list[list[str | None]]:
    header_set = set(headers)
    out = []
    for f in type_rule.fields:
        cols = []
        for c in f.when:
            col = c.column if c.column in header_set else best_column(c.label, headers)[0]
            if col is None:
                warnings.append(f"{type_rule.name}: condition column '{c.label}' for '{f.label}' not found")
            elif col != c.column:
                warnings.append(f"{type_rule.name}: condition '{c.label}' auto-matched to column '{col}'")
            cols.append(col)
        out.append(cols)
    return out


def check_project(export: Export, rules: RuleSet, project_number: str | None = None) -> dict[str, Any]:
    warnings: list[str] = []
    path_sheet: dict[str, str] = {}
    for name, sheet in export.equipment_sheets().items():
        for row in sheet.rows:
            fp = str(row.get("Full Path") or "").strip()
            if fp:
                path_sheet[fp] = name

    types_out = []
    tracked_sheets = set()
    for type_rule in rules.types:
        sheet = export.sheets.get(type_rule.export_sheet)
        if sheet is None:
            continue
        tracked_sheets.add(sheet.name)
        columns = _resolve_columns(type_rule, sheet.headers, warnings)
        cond_columns = _resolve_conditions(type_rule, sheet.headers, warnings)
        fields_out = [{"label": f.label, "status": f.status} for f in type_rule.fields]
        units = []
        for row in sheet.rows:
            full_path = str(row.get("Full Path") or "").strip()
            name = str(row.get("Equipment Name") or full_path).strip()
            if not name:
                continue
            parent = _parent_path(full_path)
            parent_sheet = path_sheet.get(parent) if parent else None
            if not type_rule.accepts_parent(parent_sheet):
                continue
            codes = []
            req_total = req_filled = opt_total = opt_filled = 0
            for f, cols, ccols in zip(type_rule.fields, columns, cond_columns):
                if (f.status == IGNORE or cols is None
                        or not all(c.holds(row, cc) for c, cc in zip(f.when, ccols))):
                    codes.append(NOT_APPLICABLE)
                    continue
                filled = any(not is_missing(row.get(c)) for c in cols)
                if f.status == REQUIRED:
                    req_total += 1
                    req_filled += filled
                    codes.append(PASS if filled else MISSING_REQUIRED)
                else:
                    opt_total += 1
                    opt_filled += filled
                    codes.append(PASS if filled else MISSING_OPTIONAL)
            units.append({
                "name": name, "path": full_path, "parent": parent,
                "area": row.get("Area"), "zone": row.get("Zone"),
                "completed_box": bool(row.get("Completed")) if row.get("Completed") is not None else None,
                "codes": "".join(codes),
                "required": req_total, "required_filled": req_filled,
                "optional": opt_total, "optional_filled": opt_filled,
            })
        if units:
            types_out.append({
                "key": type_rule.key, "name": type_rule.name, "export_sheet": type_rule.export_sheet,
                "fields": fields_out, "units": units, "summary": _summarize(units),
            })

    untracked = {n: len(s.rows) for n, s in export.equipment_sheets().items()
                 if n not in tracked_sheets and s.rows}
    deficiencies = [_clean_deficiency(d) for d in export.deficiencies]
    return {
        "schema": 1,
        "project_number": project_number or str(export.project.get("Number") or "").strip() or None,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rules_version": rules.version,
        "summary": _summarize([u for t in types_out for u in t["units"]]),
        "types": types_out,
        "untracked_sheets": untracked,
        "deficiencies": deficiencies,
        "deficiency_summary": summarize_deficiencies(deficiencies),
        "warnings": warnings,
    }


def _summarize(units: list[dict[str, Any]]) -> dict[str, Any]:
    req = sum(u["required"] for u in units)
    filled = sum(u["required_filled"] for u in units)
    complete = sum(1 for u in units if u["required"] == u["required_filled"])
    return {
        "units": len(units),
        "units_complete": complete,
        "required_fields": req,
        "required_filled": filled,
        "missing_required": req - filled,
        "missing_optional": sum(u["optional"] - u["optional_filled"] for u in units),
        "fields_pct": round(100 * filled / req, 1) if req else 100.0,
        "units_pct": round(100 * complete / len(units), 1) if units else 100.0,
    }


def _clean_deficiency(d: dict[str, Any]) -> dict[str, Any]:
    g = lambda k: (str(d.get(k)).strip() if d.get(k) not in (None, "") else "")  # noqa: E731
    status = g("Deficiency Status") or "Open"
    return {
        "equipment": g("Equipment Name"), "path": g("Full Path"), "item_type": g("Item Type"),
        "number": g("No."), "text": g("Deficiency"), "status": status,
        "priority": g("Deficiency Priority") or "Unset",
        "role": g("Assigned Role") or "Unassigned", "contact": g("Assigned Contact") or "Unassigned",
        "date_due": g("Date due"), "date_completed": g("Date Completed"), "comments": g("Comments"),
        "open": status.lower() not in CLOSED_DEFICIENCY,
    }


def summarize_deficiencies(items: list[dict[str, Any]]) -> dict[str, Any]:
    open_items = [d for d in items if d["open"]]
    by = lambda key, rows: dict(Counter(r[key] for r in rows).most_common())  # noqa: E731
    return {
        "total": len(items), "open": len(open_items), "closed": len(items) - len(open_items),
        "by_status": by("status", items),
        "open_by_priority": by("priority", open_items),
        "open_by_role": by("role", open_items),
        "open_by_contact": by("contact", open_items),
        "open_by_item_type": by("item_type", open_items),
    }


def gap_check(previous: dict[str, Any] | None, current: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag possible export gaps: data that was there last sync but is blank now,
    and units whose Completed box is ticked while required fields are empty."""
    flags: list[dict[str, Any]] = []
    prev_codes: dict[tuple[str, str], tuple[list[dict[str, Any]], str]] = {}
    if previous:
        for t in previous.get("types", []):
            for u in t["units"]:
                prev_codes[(t["key"], u["path"] or u["name"])] = (t["fields"], u["codes"])
    for t in current["types"]:
        labels = [f["label"] for f in t["fields"]]
        for u in t["units"]:
            key = (t["key"], u["path"] or u["name"])
            if key in prev_codes:
                p_fields, p_codes = prev_codes[key]
                p_map = {f["label"]: c for f, c in zip(p_fields, p_codes)}
                lost = [lab for lab, c in zip(labels, u["codes"])
                        if c in (MISSING_REQUIRED, MISSING_OPTIONAL) and p_map.get(lab) == PASS]
                if lost:
                    flags.append({"type": t["name"], "unit": u["name"], "kind": "data_disappeared", "fields": lost})
            if u.get("completed_box") and u["required_filled"] < u["required"]:
                missing = [lab for lab, c in zip(labels, u["codes"]) if c == MISSING_REQUIRED]
                flags.append({"type": t["name"], "unit": u["name"], "kind": "completed_but_missing", "fields": missing})
    return flags


def dashboard_rows(results: dict[str, Any]) -> list[dict[str, Any]]:
    """One row per equipment type, for the Dashboard tab of the Google Sheet."""
    rows = []
    for t in results["types"]:
        s = t["summary"]
        rows.append({"project_number": results["project_number"], "type": t["name"], **s})
    return rows


def missing_by_field(type_result: dict[str, Any]) -> dict[str, int]:
    """How many units are missing each required field (helps techs see what to chase)."""
    counts: dict[str, int] = defaultdict(int)
    for u in type_result["units"]:
        for f, c in zip(type_result["fields"], u["codes"]):
            if c == MISSING_REQUIRED:
                counts[f["label"]] += 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))
