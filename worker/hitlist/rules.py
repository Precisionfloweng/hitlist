"""Rules: which fields each equipment type must (or should) have filled in.

A rule set is plain JSON so it can live in the Google Sheet later and be edited
from the web app. Shape:

    {"version": 1, "types": [
        {"key": "ahu", "name": "AHUs", "export_sheet": "Air Handling Unit",
         "export_sheet_confirmed": true,
         "parent_types": null,          # or ["Terminal Unit"] / ["!Terminal Unit"]
         "fields": [
            {"label": "Actual Airflow", "columns": ["Actual Airflow"],
             "status": "required",      # required | optional | ignore
             "when": null}   # or [{"column": "Drive Type", "equals": "Belt Drive"}]
                             # or [{"column": "Design Fan Airflow", "gt": 0.5}]
         ]}
    ]}

"columns" is a list: the field counts as filled when ANY listed column has a
value (used for three-phase readings like Volts T1-T2 / T2-T3 / T1-T3).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

REQUIRED, OPTIONAL, IGNORE = "required", "optional", "ignore"


def norm_header(value: Any) -> str:
    return " ".join(str(value or "").split())


def _compact(value: Any) -> str:
    return "".join(str(value or "").split()).lower()


def _number(value: Any) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


@dataclass
class Condition:
    """A field only applies when this holds, e.g. Drive Type = Belt Drive,
    or Design Fan Airflow > 0.5 (the box has a fan)."""

    column: str | None
    label: str
    equals: str | None = None
    gt: float | None = None

    def holds(self, row: dict[str, Any], column: str | None = None) -> bool:
        col = column or self.column
        if col is None:
            return False
        value = row.get(col)
        if self.equals is not None:
            # Spaces ignored: the old scripts compared against both "Belt Drive" and "BeltDrive".
            return _compact(value) == _compact(self.equals)
        if self.gt is not None:
            n = _number(value)
            return n is not None and n > self.gt
        return True


@dataclass
class FieldRule:
    label: str
    columns: list[str] | None
    status: str
    when: list[Condition] = field(default_factory=list)


@dataclass
class TypeRule:
    key: str
    name: str
    export_sheet: str
    export_sheet_confirmed: bool
    parent_types: list[str] | None
    fields: list[FieldRule]

    def accepts_parent(self, parent_sheet: str | None) -> bool:
        if not self.parent_types:
            return True
        for p in self.parent_types:
            if p.startswith("!"):
                if parent_sheet == p[1:]:
                    return False
            elif parent_sheet == p:
                return True
        return all(p.startswith("!") for p in self.parent_types)


@dataclass
class RuleSet:
    version: int
    types: list[TypeRule]

    def for_sheet(self, sheet: str) -> list[TypeRule]:
        return [t for t in self.types if t.export_sheet == sheet]


def _parse(data: dict[str, Any]) -> RuleSet:
    types = []
    for t in data["types"]:
        fields = []
        for f in t["fields"]:
            cols = [norm_header(c) for c in f["columns"]] if f.get("columns") else None
            when = [Condition(norm_header(c["column"]) if c.get("column") else None,
                              c.get("label") or c.get("column") or "",
                              c.get("equals"), c.get("gt"))
                    for c in (f.get("when") or [])]
            fields.append(FieldRule(f["label"], cols, f.get("status", REQUIRED), when))
        types.append(TypeRule(t["key"], t["name"], t["export_sheet"],
                              bool(t.get("export_sheet_confirmed", True)),
                              t.get("parent_types"), fields))
    return RuleSet(int(data.get("version", 1)), types)


def load_rules(source: str | Path | dict[str, Any] | None = None) -> RuleSet:
    """Load rules from a dict, a JSON file path, or the bundled seed rules."""
    if isinstance(source, dict):
        return _parse(source)
    if source is None:
        text = resources.files("hitlist.data").joinpath("rules_seed.json").read_text(encoding="utf-8")
        return _parse(json.loads(text))
    return _parse(json.loads(Path(source).read_text(encoding="utf-8")))
