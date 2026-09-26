"""Read a BuildingStart full-project export (.xlsx) into plain Python data."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import openpyxl

# Sheets in the export that are not equipment.
NON_EQUIPMENT_SHEETS = {"Project", "Deficiency", "Note"}


@dataclass
class Sheet:
    name: str
    headers: list[str]
    rows: list[dict[str, Any]]


@dataclass
class Export:
    project: dict[str, Any] = field(default_factory=dict)
    sheets: dict[str, Sheet] = field(default_factory=dict)
    deficiencies: list[dict[str, Any]] = field(default_factory=list)
    notes: list[dict[str, Any]] = field(default_factory=list)

    def equipment_sheets(self) -> dict[str, Sheet]:
        return {n: s for n, s in self.sheets.items() if n not in NON_EQUIPMENT_SHEETS}


def _clean_header(value: Any) -> str:
    # Some headers carry stray spaces or line breaks, e.g. "Model " or "Des. Ent. h\n".
    return " ".join(str(value or "").split())


def read_export(path: str | Path) -> Export:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    export = Export()
    try:
        for ws in wb.worksheets:
            rows = ws.iter_rows(values_only=True)
            try:
                raw_headers = next(rows)
            except StopIteration:
                continue
            headers = [_clean_header(h) for h in raw_headers]
            data = []
            for raw in rows:
                if raw is None or all(v in (None, "") for v in raw):
                    continue
                data.append({h: raw[i] if i < len(raw) else None for i, h in enumerate(headers) if h})
            export.sheets[ws.title] = Sheet(ws.title, [h for h in headers if h], data)
    finally:
        wb.close()

    if "Project" in export.sheets:
        for row in export.sheets["Project"].rows:
            values = list(row.values())
            if values and values[0]:
                key = str(values[0]).strip().rstrip(":")
                export.project[key] = values[1] if len(values) > 1 else None
    if "Deficiency" in export.sheets:
        export.deficiencies = export.sheets["Deficiency"].rows
    if "Note" in export.sheets:
        export.notes = export.sheets["Note"].rows
    return export
