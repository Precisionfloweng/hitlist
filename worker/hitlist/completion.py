"""The job's overall % complete by work per unit (Admin -> Completion weights on the website).

Each equipment type has one number: how much work one unit is (points or minutes; Settings work_<type>, default 1;
work_unit = "points" | "minutes" is only a label). Job % = sum(work x unit %) / sum(work) over every unit on the job,
so the job's mix comes from its own equipment and nothing is set per project. A unit's % is its weighted % when
its type has item weights, else its required fields filled. Units with nothing required (and no weights) are left
out. The website (web/lib/completion.ts) does the same sum. The category list is only used for headings.
"""
from __future__ import annotations

import json
from importlib import resources
from typing import Any

CATEGORIES: list[dict[str, Any]] = json.loads(
    resources.files("hitlist.data").joinpath("completion_categories.json").read_text(encoding="utf-8"))["categories"]
DEFAULT_WORK = 1.0


def work_from_settings(settings: dict[str, str]) -> dict[str, float]:
    """Work per unit for every type that has a number on the Settings tab (others count DEFAULT_WORK)."""
    out: dict[str, float] = {}
    for k, v in settings.items():
        if k.startswith("work_") and k != "work_unit":
            try:
                n = float(str(v).strip())
            except ValueError:
                continue
            if n >= 0:
                out[k[5:]] = n
    return out


def unit_pct(u: dict[str, Any]) -> float | None:
    if u.get("weighted_pct") is not None:
        return float(u["weighted_pct"])
    return 100.0 * u["required_filled"] / u["required"] if u.get("required") else None


def job_progress(types: list[dict[str, Any]], work: dict[str, float]) -> tuple[float, float]:
    """(work done, total work) over every unit on the job."""
    done = total = 0.0
    for t in types:
        w = work.get(t["key"], DEFAULT_WORK)
        for u in t["units"]:
            p = unit_pct(u)
            if p is None or w <= 0:
                continue
            total += w
            done += w * p / 100.0
    return done, total


def complete_pct(results: dict[str, Any], work: dict[str, float]) -> float:
    done, total = job_progress(results.get("types", []), work)
    if not total:
        return float(results.get("summary", {}).get("fields_pct", 100.0))
    return round(100.0 * done / total, 1)
