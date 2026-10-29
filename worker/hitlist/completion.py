"""The job's overall % complete, weighted by equipment category (Admin -> Completion weights on the website).

Each category's own % is required fields filled / required fields across its types (same as the type cards).
Job % = sum(share x category %) / sum(share) over the categories the job has, so a missing category's share is
spread over the rest. Shares come from the Settings tab (weight_<category>), else the bundled defaults.
The website (web/lib/completion.ts) does the same sum; both read the same category list.
"""
from __future__ import annotations

import json
from importlib import resources
from typing import Any

CATEGORIES: list[dict[str, Any]] = json.loads(
    resources.files("hitlist.data").joinpath("completion_categories.json").read_text(encoding="utf-8"))["categories"]
TYPE_CATEGORY = {t: c["key"] for c in CATEGORIES for t in c["types"]}


def weights_from_settings(settings: dict[str, str]) -> dict[str, float]:
    out = {}
    for c in CATEGORIES:
        try:
            v = float(str(settings.get(f"weight_{c['key']}", "")).strip())
            out[c["key"]] = v if v >= 0 else float(c["default"])
        except ValueError:
            out[c["key"]] = float(c["default"])
    return out


def category_pcts(types: list[dict[str, Any]]) -> dict[str, float]:
    """Each category the job has (with required fields): its % of required fields filled."""
    req: dict[str, int] = {}
    filled: dict[str, int] = {}
    for t in types:
        c = TYPE_CATEGORY.get(t["key"], "other")
        n = sum(u["required"] for u in t["units"])
        wp = (t.get("summary") or {}).get("weighted_pct")
        req[c] = req.get(c, 0) + n
        # a type with completion weights counts by its weighted % (same size in the category as before)
        filled[c] = filled.get(c, 0) + (n * wp / 100.0 if wp is not None else sum(u["required_filled"] for u in t["units"]))
    return {c: 100.0 * filled[c] / n for c, n in req.items() if n > 0}


def complete_pct(results: dict[str, Any], weights: dict[str, float]) -> float:
    pcts = category_pcts(results.get("types", []))
    total = sum(weights.get(c, 0.0) for c in pcts)
    if not total:
        return float(results.get("summary", {}).get("fields_pct", 100.0))
    return round(sum(weights.get(c, 0.0) * p for c, p in pcts.items()) / total, 1)
