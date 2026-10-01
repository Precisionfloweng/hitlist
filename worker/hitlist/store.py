"""The Google Sheet "PFE Hitlist Data" as a small database.

Each tab is a table: row 1 holds the column names, every other row is a record.
People don't edit this sheet by hand; the web app and this worker do.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.parse import quote

# Tab name -> columns. Adding a column at the end is safe; don't reorder.
SCHEMA: dict[str, list[str]] = {
    "Projects": ["project_number", "name", "tech", "date", "address", "status", "buildingstart_url",
                 "last_sync", "last_sync_status", "fields_pct", "units_pct", "units",
                 "open_deficiencies", "open_high", "gap_flags", "project_id"],
    # projects: for role "customer", the project keys they may see (" | " separated)
    "Users": ["email", "name", "role", "active", "added", "password_hash", "projects", "last_seen"],
    "Rules": ["type_key", "type_name", "export_sheet", "sheet_confirmed", "parent_types",
              "order", "field", "columns", "status", "when"],
    "RuleHistory": ["changed_at", "changed_by", "type_key", "field", "old_status", "new_status",
                    "project_number"],
    # One project's differences from the default rules (status only). Blank status = use the default.
    "ProjectRules": ["project_number", "type_key", "field", "status", "changed_by", "changed_at"],
    "Queue": ["id", "project_number", "requested_by", "requested_at", "status",
              "started_at", "finished_at", "message"],
    "Dashboard": ["project_number", "type", "units", "units_complete", "required_fields",
                  "required_filled", "missing_required", "missing_optional", "fields_pct",
                  "units_pct", "updated_at"],
    "Deficiencies": ["project_number", "group", "value", "count", "updated_at"],
    "History": ["project_number", "synced_at", "fields_pct", "units_pct", "units",
                "open_deficiencies", "open_high"],
    # Written by the website: one row per sign-in (time in Central).
    "SignIns": ["signed_in_at", "email", "name", "role", "method", "device"],
}

QUEUED, RUNNING, DONE, FAILED = "queued", "running", "done", "failed"


def project_key(p: dict[str, Any]) -> str:
    return (p.get("project_id") or "").strip() or p["project_number"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Backend(Protocol):
    def tabs(self) -> list[str]: ...
    def add_tab(self, name: str) -> None: ...
    def read(self, tab: str) -> list[list[str]]: ...
    def write(self, tab: str, start_row: int, rows: list[list[Any]]) -> None: ...
    def append(self, tab: str, rows: list[list[Any]]) -> None: ...
    def clear(self, tab: str) -> None: ...


class MemoryBackend:
    """In-memory stand-in for the Google Sheet (used by tests)."""

    def __init__(self) -> None:
        self.data: dict[str, list[list[str]]] = {}

    def tabs(self) -> list[str]:
        return list(self.data)

    def add_tab(self, name: str) -> None:
        self.data.setdefault(name, [])

    def read(self, tab: str) -> list[list[str]]:
        return [list(r) for r in self.data[tab]]

    def write(self, tab: str, start_row: int, rows: list[list[Any]]) -> None:
        t = self.data[tab]
        for i, r in enumerate(rows):
            idx = start_row - 1 + i
            while len(t) <= idx:
                t.append([])
            t[idx] = ["" if v is None else str(v) for v in r]

    def append(self, tab: str, rows: list[list[Any]]) -> None:
        self.data[tab].extend(["" if v is None else str(v) for v in r] for r in rows)

    def clear(self, tab: str) -> None:
        self.data[tab] = []


class SheetsBackend:
    """Google Sheets API v4 through a service account."""

    API = "https://sheets.googleapis.com/v4/spreadsheets/"

    def __init__(self, sheet_id: str, service_account_file: str) -> None:
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_file(
            service_account_file, scopes=["https://www.googleapis.com/auth/spreadsheets"])
        self.http = AuthorizedSession(creds)
        self.base = self.API + sheet_id

    def _ok(self, resp):
        if resp.status_code >= 400:
            raise RuntimeError(f"Google Sheets error {resp.status_code}: {resp.text[:300]}")
        return resp.json() if resp.content else {}

    @staticmethod
    def _range(tab: str, a1: str = "") -> str:
        return quote(f"'{tab}'" + (f"!{a1}" if a1 else ""), safe="")

    def tabs(self) -> list[str]:
        meta = self._ok(self.http.get(self.base, params={"fields": "sheets.properties.title"}))
        return [s["properties"]["title"] for s in meta.get("sheets", [])]

    def add_tab(self, name: str) -> None:
        self._ok(self.http.post(self.base + ":batchUpdate",
                                json={"requests": [{"addSheet": {"properties": {"title": name}}}]}))

    def read(self, tab: str) -> list[list[str]]:
        data = self._ok(self.http.get(f"{self.base}/values/{self._range(tab)}"))
        return data.get("values", [])

    def write(self, tab: str, start_row: int, rows: list[list[Any]]) -> None:
        if rows:
            self._ok(self.http.put(f"{self.base}/values/{self._range(tab, f'A{start_row}')}",
                                   params={"valueInputOption": "RAW"}, json={"values": _cells(rows)}))

    def append(self, tab: str, rows: list[list[Any]]) -> None:
        if rows:
            self._ok(self.http.post(f"{self.base}/values/{self._range(tab, 'A1')}:append",
                                    params={"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"},
                                    json={"values": _cells(rows)}))

    def clear(self, tab: str) -> None:
        self._ok(self.http.post(f"{self.base}/values/{self._range(tab)}:clear", json={}))


def _cells(rows: list[list[Any]]) -> list[list[Any]]:
    return [["" if v is None else v for v in r] for r in rows]


class HitlistStore:
    def __init__(self, backend: Backend) -> None:
        self.b = backend

    # ---- generic table helpers -------------------------------------------------
    def setup(self) -> list[str]:
        """Create any missing tabs and header rows. Returns the tabs created."""
        existing = set(self.b.tabs())
        created = []
        for tab, cols in SCHEMA.items():
            if tab not in existing:
                self.b.add_tab(tab)
                created.append(tab)
            rows = self.b.read(tab)
            if not rows or rows[0][: len(cols)] != cols:
                self.b.write(tab, 1, [cols])
        return created

    def rows(self, tab: str) -> list[dict[str, str]]:
        data = self.b.read(tab)
        if not data:
            return []
        head = data[0]
        out = []
        for i, r in enumerate(data[1:], start=2):
            rec = {h: (r[j] if j < len(r) else "") for j, h in enumerate(head)}
            if any(v != "" for v in rec.values()):
                rec["_row"] = i
                out.append(rec)
        return out

    def _to_row(self, tab: str, rec: dict[str, Any]) -> list[Any]:
        return [rec.get(c, "") for c in SCHEMA[tab]]

    def append(self, tab: str, records: list[dict[str, Any]]) -> None:
        self.b.append(tab, [self._to_row(tab, r) for r in records])

    def update(self, tab: str, row_number: int, rec: dict[str, Any]) -> None:
        self.b.write(tab, row_number, [self._to_row(tab, rec)])

    def replace_for_project(self, tab: str, project_number: str, records: list[dict[str, Any]]) -> None:
        """Swap out one project's rows in a tab only the worker writes (Dashboard, Deficiencies)."""
        keep = [r for r in self.rows(tab) if r.get("project_number") != project_number]
        rows = [SCHEMA[tab]] + [self._to_row(tab, r) for r in keep] + [self._to_row(tab, r) for r in records]
        self.b.clear(tab)
        self.b.write(tab, 1, rows)

    # ---- projects ---------------------------------------------------------------
    # A project's key is its project_id; blank means "same as the project number". Two sites under
    # one contract can share a number, so the second gets e.g. "26-083-2". Everything the web app
    # and worker store per project (Queue, Dashboard, results files...) uses this key.
    def project(self, key: str) -> dict[str, str] | None:
        return next((p for p in self.rows("Projects") if project_key(p) == key), None)

    def update_project(self, number: str, **changes: Any) -> None:
        p = self.project(number)
        if p is None:
            raise KeyError(f"Project {number} not found")
        p.update({k: v for k, v in changes.items()})
        self.update("Projects", p["_row"], p)

    # ---- queue ------------------------------------------------------------------
    def request_refresh(self, project_number: str, requested_by: str) -> str:
        job_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        self.append("Queue", [{"id": job_id, "project_number": project_number,
                               "requested_by": requested_by, "requested_at": now_iso(),
                               "status": QUEUED}])
        return job_id

    def next_job(self) -> dict[str, str] | None:
        queued = [j for j in self.rows("Queue") if j["status"] == QUEUED]
        return min(queued, key=lambda j: j["requested_at"]) if queued else None

    def set_job(self, job: dict[str, str], **changes: Any) -> None:
        # Re-read so the row number is current, then update that one row.
        fresh = next((j for j in self.rows("Queue") if j["id"] == job["id"]), job)
        fresh.update(changes)
        job.update(changes)
        self.update("Queue", fresh["_row"], fresh)

    # ---- users ------------------------------------------------------------------
    def users(self) -> list[dict[str, str]]:
        return [u for u in self.rows("Users") if u.get("active", "").lower() not in ("false", "no", "0")]

    def email_for(self, name_or_email: str) -> str | None:
        key = (name_or_email or "").strip().lower()
        if "@" in key:
            return key
        for u in self.users():
            if u.get("role", "").lower() == "customer":
                continue                     # never mistake a customer for a project's tech
            if u["name"].strip().lower() == key or u["name"].strip().lower().split(" ")[0] == key:
                return u["email"]
        return None

    # ---- rules ------------------------------------------------------------------
    def load_rules_dict(self) -> dict[str, Any] | None:
        rows = self.rows("Rules")
        if not rows:
            return None
        return rows_to_rules(rows)

    def project_rule_overrides(self, project_number: str) -> dict[tuple[str, str], str]:
        """{(type_key, field): status} for one project. Missing tab = no overrides."""
        try:
            rows = self.rows("ProjectRules")
        except Exception:  # noqa: BLE001 - tab not created yet
            return {}
        return {(r["type_key"], r["field"]): r["status"] for r in rows
                if r.get("project_number") == project_number and r.get("status")}

    def refresh_rule_mapping(self, rules: dict[str, Any], type_key: str, by: str = "server",
                             statuses: bool = False) -> int:
        """Copy one type's name, export sheet, parent filter, field names, columns and conditions from `rules`
        (the bundled defaults) into the Rules tab. Required/optional/ignore choices are kept unless
        `statuses` is set. Returns rows changed."""
        src = next((t for t in rules["types"] if t["key"] == type_key), None)
        if src is None:
            raise KeyError(f"No equipment type '{type_key}' in the bundled rules")
        new_rows = rules_to_rows({"types": [src]})
        mine = sorted((r for r in self.rows("Rules") if r["type_key"] == type_key),
                      key=lambda r: int(r.get("order") or 0))
        if not mine:
            self.append("Rules", new_rows)          # a type added since setup: add it whole
            self.append("RuleHistory", [{"changed_at": now_iso(), "changed_by": by, "type_key": type_key,
                                         "field": "(new equipment type)", "old_status": "",
                                         "new_status": f"added from bundled rules ({len(new_rows)} fields)"}])
            return len(new_rows)
        # Same number of fields: pair them by position, so renamed fields follow.
        # More fields in the bundled rules and --statuses: rewrite the type to match them exactly.
        # Otherwise pair by name, and add any bundled field the tab doesn't have.
        same = len(mine) == len(new_rows)
        rewrite = statuses and len(new_rows) > len(mine)
        extra: list[dict[str, Any]] = []
        if same or rewrite:
            pairs = list(zip(mine, new_rows))
            extra = new_rows[len(mine):]
        else:
            by_label: dict[str, list[dict[str, Any]]] = {}
            for n in new_rows:
                by_label.setdefault(n["field"], []).append(n)
            pairs = [(row, by_label[row["field"]].pop(0)) for row in mine if by_label.get(row["field"])]
            have = {r["field"] for r in mine}
            last = max(int(r.get("order") or 0) for r in mine)
            extra = [{**n, "order": last + i + 1} for i, n in enumerate(x for x in new_rows if x["field"] not in have)]
        keys = ["type_name", "export_sheet", "sheet_confirmed", "parent_types", "field", "columns", "when"]
        if statuses:
            keys.append("status")
        if rewrite:
            keys.append("order")
        changed, renamed = 0, {}
        for row, new in pairs:
            upd = {**row, **{k: new[k] for k in keys}}
            if any(str(upd[k]) != str(row.get(k, "")) for k in keys):
                self.update("Rules", row["_row"], upd)
                changed += 1
                if upd["field"] != row["field"]:
                    renamed[row["field"]] = upd["field"]
        if extra:
            self.append("Rules", extra)
            changed += len(extra)
        if renamed and same:                        # keep each project's changes on the renamed fields
            try:
                overrides = self.rows("ProjectRules")
            except Exception:  # noqa: BLE001 - tab not created yet
                overrides = []
            for o in overrides:
                if o["type_key"] == type_key and o["field"] in renamed:
                    self.update("ProjectRules", o["_row"], {**o, "field": renamed[o["field"]]})
        if changed:
            self.append("RuleHistory", [{"changed_at": now_iso(), "changed_by": by, "type_key": type_key,
                                         "field": "(sheet and columns)", "old_status": "",
                                         "new_status": f"updated from bundled rules ({changed} fields)"}])
        return changed

    def seed_rules(self, rules: dict[str, Any]) -> int:
        if self.rows("Rules"):
            return 0
        rows = rules_to_rows(rules)
        self.append("Rules", rows)
        return len(rows)


def apply_overrides(rules: dict[str, Any], overrides: dict[tuple[str, str], str]) -> dict[str, Any]:
    """Copy of the rules with one project's required/optional/ignore changes applied."""
    if not overrides:
        return rules
    out = json.loads(json.dumps(rules))
    for t in out["types"]:
        for f in t["fields"]:
            status = overrides.get((t["key"], f["label"]))
            if status in ("required", "optional", "ignore"):
                f["status"] = status
    return out


def rules_to_rows(rules: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for t in rules["types"]:
        for i, f in enumerate(t["fields"]):
            rows.append({
                "type_key": t["key"], "type_name": t["name"], "export_sheet": t["export_sheet"],
                "sheet_confirmed": "yes" if t.get("export_sheet_confirmed", True) else "no",
                "parent_types": " | ".join(t.get("parent_types") or []),
                "order": i + 1, "field": f["label"],
                "columns": " | ".join(f.get("columns") or []),
                "status": f["status"],
                "when": json.dumps(f["when"]) if f.get("when") else "",
            })
    return rows


def rows_to_rules(rows: list[dict[str, str]]) -> dict[str, Any]:
    types: dict[str, dict[str, Any]] = {}
    for r in sorted(rows, key=lambda r: (r["type_key"], int(r.get("order") or 0))):
        t = types.setdefault(r["type_key"], {
            "key": r["type_key"], "name": r["type_name"], "export_sheet": r["export_sheet"],
            "export_sheet_confirmed": r.get("sheet_confirmed", "yes") != "no",
            "parent_types": [p.strip() for p in r["parent_types"].split("|") if p.strip()] or None,
            "fields": []})
        t["fields"].append({
            "label": r["field"],
            "columns": [c.strip() for c in r["columns"].split("|") if c.strip()] or None,
            "status": r["status"] or "required",
            "when": json.loads(r["when"]) if r.get("when") else None,
        })
    return {"version": len(rows), "types": list(types.values())}
