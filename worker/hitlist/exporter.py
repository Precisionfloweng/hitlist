"""Runs Rick's BuildingStart export script for one project and finds the file it saved.

The script is configured with EXPORT_COMMAND, where {project} is replaced by the
project number and {out_dir} by the folder the export should be saved in, e.g.

    EXPORT_COMMAND=python C:\\Hitlist\\buildingstart_export.py {project} "{out_dir}"
"""

from __future__ import annotations

import shlex
import subprocess
import time
from pathlib import Path


class ExportError(RuntimeError):
    pass


def run_export(command_template: str, project_number: str, out_dir: Path,
               timeout_minutes: int = 30) -> Path:
    if not command_template:
        raise ExportError("EXPORT_COMMAND is not set")
    out_dir = out_dir.resolve() / project_number
    out_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()
    command = command_template.format(project=project_number, out_dir=str(out_dir))
    try:
        proc = subprocess.run(command if _is_windows() else shlex.split(command),
                              shell=False, capture_output=True, text=True,
                              timeout=timeout_minutes * 60)
    except subprocess.TimeoutExpired as exc:
        raise ExportError(f"Export timed out after {timeout_minutes} min") from exc
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
        raise ExportError(f"Export script failed (exit {proc.returncode}): " + " | ".join(tail))
    return newest_export(out_dir, since=started)


def newest_export(folder: Path, since: float = 0.0) -> Path:
    files = [p for p in folder.glob("*.xlsx") if not p.name.startswith("~$") and p.stat().st_mtime >= since - 1]
    if not files:
        raise ExportError(f"The export script finished but no new .xlsx appeared in {folder}")
    return max(files, key=lambda p: p.stat().st_mtime)


def _is_windows() -> bool:
    import os
    return os.name == "nt"
