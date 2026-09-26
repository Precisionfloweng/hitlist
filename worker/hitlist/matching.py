"""Fuzzy matching between rule labels and BuildingStart export column headers.

Used when a rule has no confirmed export column yet (for example an equipment
type that wasn't in the sample export the rules were seeded from).
"""

from __future__ import annotations

import difflib
import re

_EXPAND = {
    "eat": "entering air temperature", "lat": "leaving air temperature",
    "ewt": "entering water temperature", "lwt": "leaving water temperature",
    "des": "design", "dsgn": "design", "act": "actual", "oa": "outside air",
    "ra": "return air", "sp": "static pressure", "esp": "external static pressure",
    "tsp": "total static pressure", "mfg": "manufacturer", "make": "manufacturer",
    "mfr": "manufacturer", "evap": "evaporator", "evaperator": "evaporator",
    "cond": "condenser", "ent": "entering", "lvg": "leaving", "leav": "leaving",
    "temp": "temperature", "h2o": "water", "hp": "horse power", "eff": "efficiency",
    "nom": "nominal", "pf": "power factor", "sf": "service factor", "fl": "full load",
    "dia": "diameter", "diam": "diameter", "stpt": "setpoint", "diff": "difference",
    "dp": "pressure difference", "press": "pressure", "pos": "position",
    "qty": "quantity", "voltage": "volts", "hz": "hertz", "cfm": "airflow",
    "mbh": "capacity", "serves": "area served",
}
_STOP = {"unit", "of", "the", "number", "final", "s1"}


def _tokens(text: str) -> set[str]:
    text = (text or "").lower().replace(".", "").replace("#", "number ")
    out: list[str] = []
    for tok in re.split(r"[^a-z0-9%]+", text):
        if tok:
            out.extend(_EXPAND.get(tok, tok).split())
    kept = {t for t in out if t not in _STOP}
    return kept or set(out)


def similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    jaccard = len(ta & tb) / len(ta | tb) if ta and tb else 0.0
    compact = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())  # noqa: E731
    ratio = difflib.SequenceMatcher(None, compact(a), compact(b)).ratio()
    return max(jaccard, ratio * 0.9)


def best_column(label: str, headers: list[str], used: set[str] | None = None,
                threshold: float = 0.45) -> tuple[str | None, float]:
    used = used or set()
    best, score = None, 0.0
    for h in headers:
        if h in used or h in ("Full Path", "Equipment Name"):
            continue
        s = similarity(label, h)
        if s > score:
            best, score = h, s
    return (best, score) if score >= threshold else (None, score)
