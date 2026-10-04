"""The BuildingStart values (every reading on every unit) for the website's Search the Documents.

After each sync the whole export's equipment values are packed into one gzipped JSON file and sent to
the website (stored privately in Vercel Blob). The website answers with what it received (units and
values counted); both counts must match or the send counts as failed. A small fingerprint file per
project (results/values/<key>.json) lets the next sync skip the send when nothing changed.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Callable

from .export_reader import Export

SCHEMA = 1
# Columns kept as the unit's own fields rather than readings.
NAME, PATH = "Equipment Name", "Full Path"


class ValuesError(Exception):
    pass


def _value(v: Any) -> Any:
    """A cell as JSON: numbers stay numbers, dates become text, blanks are None (left out)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return str(v) if isinstance(v, float) and not math.isfinite(v) else v
    if isinstance(v, (datetime, date, time)):
        return v.isoformat()
    text = str(v).strip()
    return text or None


def pack_values(export: Export, project: str) -> dict[str, Any]:
    """Every equipment sheet: one entry per unit with its non-blank values. Counts are included so the
    website can confirm it got everything."""
    sheets, n_units, n_values = [], 0, 0
    for name, sheet in export.equipment_sheets().items():
        units = []
        for row in sheet.rows:
            path = str(row.get(PATH) or "").strip()
            unit = str(row.get(NAME) or path).strip()
            if not unit:
                continue
            vals = {h: x for h, v in row.items() if h not in (NAME, PATH) and (x := _value(v)) is not None}
            units.append({"name": unit, "path": path, "v": vals})
            n_values += len(vals)
        if units:
            sheets.append({"sheet": name, "headers": [h for h in sheet.headers if h not in (NAME, PATH)],
                           "units": units})
            n_units += len(units)
    return {"schema": SCHEMA, "project": project, "sheets": sheets,
            "counts": {"units": n_units, "values": n_values}}


def fingerprint(packed: dict[str, Any]) -> str:
    body = json.dumps({k: v for k, v in packed.items() if k != "synced_at"}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def encode(packed: dict[str, Any]) -> bytes:
    return gzip.compress(json.dumps(packed, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def _state_file(folder: Path, key: str) -> Path:
    return folder / f"{key.replace('/', '_')}.json"


def last_sent(folder: Path, key: str) -> dict[str, Any] | None:
    f = _state_file(folder, key)
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    except (OSError, ValueError):
        return None


Upload = Callable[[bytes], dict[str, Any]]


def send_values(export: Export, key: str, synced_at: str, folder: Path, upload: Upload,
                force: bool = False) -> dict[str, Any]:
    """Pack and send the values unless they're the same as the last confirmed send.

    Returns {"sent": bool, "units": n, "values": n}. Raises ValuesError when the website didn't confirm
    the same counts (the fingerprint is only saved after a confirmed send, so a failure is retried next sync).
    """
    packed = pack_values(export, key)
    counts = packed["counts"]
    fp = fingerprint(packed)
    prev = last_sent(folder, key)
    if not force and prev and prev.get("hash") == fp:
        return {"sent": False, **counts}
    packed["synced_at"] = synced_at
    reply = upload(encode(packed))
    got = {"units": reply.get("units"), "values": reply.get("values")}
    if got != counts:
        raise ValuesError(f"the website received {got.get('units')} units / {got.get('values')} values, "
                          f"but {counts['units']} units / {counts['values']} values were sent")
    folder.mkdir(parents=True, exist_ok=True)
    _state_file(folder, key).write_text(json.dumps({"hash": fp, "sent_at": synced_at, **counts}), encoding="utf-8")
    return {"sent": True, **counts}


def status_text(result: dict[str, Any]) -> str:
    return f"ok: {result['units']} units, {result['values']} values" + ("" if result["sent"] else " (unchanged)")
