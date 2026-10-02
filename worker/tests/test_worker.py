import json
from datetime import datetime, timedelta, timezone

from hitlist.config import Settings
from hitlist.mailer import Mailer
from hitlist.runner import process_next
from hitlist.store import HitlistStore, MemoryBackend, rows_to_rules, rules_to_rows
from hitlist.summary import send_weekly_summary

from conftest import SAMPLE_RULES


def make_store():
    store = HitlistStore(MemoryBackend())
    store.setup()
    store.seed_rules(SAMPLE_RULES)
    store.append("Users", [
        {"email": "boss@example.com", "name": "Boss Person", "role": "admin", "active": "yes"},
        {"email": "tech@example.com", "name": "Taylor Tech", "role": "tech", "active": "yes"}])
    store.append("Projects", [{"project_number": "99-001", "name": "Sample Building",
                               "tech": "Taylor", "status": "active"}])
    return store


def settings(tmp_path):
    return Settings(results_dir=tmp_path / "results", admin_emails=["rick@example.com"],
                    failure_emails=["rick@example.com"])


def test_setup_is_idempotent():
    store = make_store()
    assert store.setup() == []
    assert store.seed_rules(SAMPLE_RULES) == 0


def test_rules_round_trip():
    back = rows_to_rules([{k: str(v) for k, v in r.items()} for r in rules_to_rows(SAMPLE_RULES)])
    by_key = {t["key"]: t for t in back["types"]}
    assert [f["label"] for f in by_key["ahu"]["fields"]] == [f["label"] for f in SAMPLE_RULES["types"][0]["fields"]]
    assert by_key["vav_eh"]["parent_types"] == ["Terminal Unit"]
    assert by_key["vav"]["fields"][1]["when"] == [{"column": "Design Fan Airflow", "gt": 0.5}]


def test_refresh_success(sample_export, tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.request_refresh("99-001", "tech@example.com")
    assert process_next(store, s, mail, export_fn=lambda n: sample_export) is True
    assert process_next(store, s, mail, export_fn=lambda n: sample_export) is False   # queue empty

    job = store.rows("Queue")[0]
    assert job["status"] == "done" and job["message"] == "ok"
    p = store.project("99-001")
    assert p["last_sync_status"] == "ok" and p["units"] == "7" and p["open_deficiencies"] == "2"
    assert {r["type"] for r in store.rows("Dashboard")} == {"AHUs", "VAVs", "VAV Electric Heat",
                                                            "Electric Heat (sub-item)"}
    assert len(store.rows("History")) == 1
    assert (tmp_path / "results" / "99-001.json").exists()
    # A successful sync emails nobody but Rick, and only because the website hand-off failed (no APP_URL in tests).
    assert len(mail.sent) == 1 and mail.sent[0]["To"] == "rick@example.com"
    assert "APP_URL is not set" in mail.sent[0].get_body(("html",)).get_content()


def test_second_refresh_replaces_dashboard_rows(sample_export, tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    for _ in range(2):
        store.request_refresh("99-001", "Taylor")
        process_next(store, s, mail, export_fn=lambda n: sample_export)
    assert len(store.rows("Dashboard")) == 4
    assert len(store.rows("History")) == 2


def test_refresh_failure_emails_requester_and_admins(tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.request_refresh("99-001", "tech@example.com")

    def broken(_):
        raise RuntimeError("BuildingStart login failed")
    process_next(store, s, mail, export_fn=broken)
    job = store.rows("Queue")[0]
    assert job["status"] == "failed" and "Couldn't log in to BuildingStart" in job["message"]
    assert store.project("99-001")["last_sync_status"].startswith("failed")
    assert set(mail.sent[-1]["To"].split(", ")) == {"tech@example.com", "rick@example.com"}   # not the owner


def test_unknown_project_fails_cleanly(tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.request_refresh("00-000", "tech@example.com")
    process_next(store, s, mail, export_fn=lambda n: None)
    assert store.rows("Queue")[0]["status"] == "failed"


def test_weekly_summary(tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    now = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
    store.update_project("99-001", last_sync=(now - timedelta(days=9)).isoformat())
    store.append("Projects", [{"project_number": "99-002", "name": "Other Site", "tech": "Taylor",
                               "status": "active"},
                              {"project_number": "99-003", "name": "Old Job", "tech": "Taylor",
                               "status": "archived"}])
    sent = send_weekly_summary(store, s, mail, now=now, dry_run=True)
    assert sent["tech@example.com"] == 2          # archived project left out
    assert sent["boss@example.com"] == 2 and sent["rick@example.com"] == 2
    body = mail.sent[0].get_body(("html",)).get_content()
    assert "Never synced" in body and "9 days ago" in body
    text = mail.sent[0].get_body(("plain",)).get_content()
    assert "99-001 Sample Building" in text and "Last sync: 9 days ago" in text and "<" not in text
    assert body.index("99-002") < body.index("99-001")   # never-synced listed first


def test_refresh_reports_each_step(sample_export, tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.request_refresh("99-001", "tech@example.com")
    seen = []
    original = store.set_job

    def spy(job, **changes):
        if "message" in changes:
            seen.append(changes["message"])
        original(job, **changes)
    store.set_job = spy

    def export(n, step):
        step("Logging in to BuildingStart")
        return sample_export
    process_next(store, s, mail, export_fn=export)
    assert seen[0] == "Starting"
    assert "Logging in to BuildingStart" in seen
    assert "Checking rules" in seen
    assert seen[-1] == "ok"


class _Resp:
    def __init__(self, code, text=""):
        self.status_code, self.text, self.ok = code, text, code < 400


def test_publish_explains_problems(monkeypatch, tmp_path):
    import requests
    from hitlist.runner import publish
    s = Settings(results_dir=tmp_path, app_url="hitlist.example.com/", worker_secret="x" * 32)
    calls = []

    def fake_post(url, **kw):
        calls.append(url)
        return _Resp(401)
    monkeypatch.setattr(requests, "post", fake_post)
    assert "WORKER_SECRET" in publish(s, "99-001", {"a": 1})
    assert calls == ["https://hitlist.example.com/api/worker/results/99-001"]
    monkeypatch.setattr(requests, "post", lambda url, **kw: _Resp(200))
    assert publish(s, "99-001", {"a": 1}) == ""


def test_project_rule_overrides_apply_to_that_project_only(sample_export, tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.append("Projects", [{"project_number": "99-002", "name": "Other Site", "status": "active"}])
    # On 99-001 only, Sheave MFG (AHU field 5) doesn't count.
    store.append("ProjectRules", [{"project_number": "99-001", "type_key": "ahu", "field": "Sheave MFG",
                                   "status": "ignore"}])
    for n in ("99-001", "99-002"):
        store.request_refresh(n, "tech@example.com")
        process_next(store, s, mail, export_fn=lambda _: sample_export)
    one = json.loads((tmp_path / "results" / "99-001.json").read_text(encoding="utf-8"))
    two = json.loads((tmp_path / "results" / "99-002.json").read_text(encoding="utf-8"))
    ahu1 = next(t for t in one["types"] if t["key"] == "ahu")
    ahu2 = next(t for t in two["types"] if t["key"] == "ahu")
    assert next(u for u in ahu1["units"] if u["name"] == "AHU-1")["codes"][4] == "-"
    assert next(u for u in ahu2["units"] if u["name"] == "AHU-1")["codes"][4] == "R"


def test_friendly_errors():
    from hitlist.exporter import ExportError
    from hitlist.runner import friendly_error
    assert "couldn't be read" in friendly_error(ValueError("invalid literal for int() with base 10: 'Infinity'"), "Reading export")
    assert "took too long" in friendly_error(TimeoutError("Timeout 30000ms exceeded"), "Opening export tool")
    assert friendly_error(ExportError("Project 99-9 was not found in BuildingStart")) == "Project 99-9 was not found in BuildingStart"


def test_export_with_infinity_is_readable(tmp_path):
    import openpyxl, zipfile, re
    from hitlist import read_export
    f = tmp_path / "inf.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Air Handling Unit"
    ws.append(["Full Path", "Equipment Name", "% Diff"]); ws.append(["AHU-1", "AHU-1", 12345])
    wb.save(f)
    # Rewrite the saved number as BuildingStart does after a divide-by-zero.
    with zipfile.ZipFile(f) as z:
        files = {n: z.read(n) for n in z.namelist()}
    name = next(n for n in files if n.startswith("xl/worksheets/sheet"))
    files[name] = files[name].replace(b"<v>12345</v>", b"<v>Infinity</v>")
    with zipfile.ZipFile(f, "w") as z:
        for n, b in files.items():
            z.writestr(n, b)
    e = read_export(f)
    assert e.sheets["Air Handling Unit"].rows[0]["% Diff"] == float("inf")


def test_pick_project_row_by_name():
    from hitlist.buildingstart import pick_project_row
    rows = ["NISD Maple Elementary", "NISD Cedar Point ES"]
    assert pick_project_row(rows, "99-083", "99-083 NISD Maple ES") == 0
    assert pick_project_row(rows, "99-083", "Cedar Point") == 1
    assert pick_project_row(["Only One"], "99-083", "anything") == 0
    import pytest
    with pytest.raises(RuntimeError, match="2 BuildingStart projects are numbered 99-083"):
        pick_project_row(rows, "99-083", "NISD")          # matches both equally
    with pytest.raises(RuntimeError):
        pick_project_row(rows, "99-083", "Somewhere Else")


def test_projects_sharing_a_number(sample_export, tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.append("Projects", [{"project_number": "99-001", "name": "Second Site", "status": "active",
                               "project_id": "99-001-2"}])
    calls = []

    def export(n, step, name="", folder=""):
        calls.append((n, name, folder))
        return sample_export
    store.request_refresh("99-001-2", "tech@example.com")
    process_next(store, s, mail, export_fn=export)
    assert calls == [("99-001", "Second Site", "99-001-2")]      # BuildingStart searched by real number + name
    assert store.project("99-001-2")["last_sync_status"] == "ok"
    assert store.project("99-001")["last_sync_status"] == ""       # the other site is untouched
    assert (tmp_path / "results" / "99-001-2.json").exists()
    assert "99-001 Second Site" in mail.sent[-1]["Subject"]


def test_update_rules_keeps_status():
    store = make_store()
    rows = store.rows("Rules")
    ahu = next(r for r in rows if r["type_key"] == "ahu" and r["field"] == "Manufacturer")
    store.update("Rules", ahu["_row"], {**ahu, "status": "optional", "columns": "Wrong Column", "export_sheet": "Old"})
    import copy
    rules = copy.deepcopy(SAMPLE_RULES)
    assert store.refresh_rule_mapping(rules, "ahu") >= 1
    ahu = next(r for r in store.rows("Rules") if r["type_key"] == "ahu" and r["field"] == "Manufacturer")
    assert ahu["columns"] == "Unit Manufacturer" and ahu["export_sheet"] == "Air Handling Unit"
    assert ahu["status"] == "optional"                   # the user's choice is kept
    assert store.refresh_rule_mapping(rules, "ahu") == 0  # nothing left to change


def test_update_rules_renames_fields_and_keeps_project_changes():
    import copy
    store = make_store()
    rules = copy.deepcopy(SAMPLE_RULES)
    ahu = next(t for t in rules["types"] if t["key"] == "ahu")
    old = ahu["fields"][0]["label"]
    store.append("ProjectRules", [{"project_number": "99-001", "type_key": "ahu", "field": old, "status": "ignore"}])
    ahu["fields"][0]["label"] = "Renamed Field"
    ahu["fields"][0]["status"] = "ignore"
    assert store.refresh_rule_mapping(rules, "ahu") == 1
    row = next(r for r in store.rows("Rules") if r["type_key"] == "ahu" and r["order"] in ("1", 1))
    assert row["field"] == "Renamed Field" and row["status"] != "ignore"      # status kept by default
    assert store.project_rule_overrides("99-001") == {("ahu", "Renamed Field"): "ignore"}
    assert store.refresh_rule_mapping(rules, "ahu", statuses=True) == 1
    row = next(r for r in store.rows("Rules") if r["type_key"] == "ahu" and r["order"] in ("1", 1))
    assert row["status"] == "ignore"


def test_update_rules_adds_new_fields():
    import copy
    store = make_store()
    rules = copy.deepcopy(SAMPLE_RULES)
    ahu = next(t for t in rules["types"] if t["key"] == "ahu")
    ahu["fields"].insert(1, {"label": "Brand New", "columns": ["Brand New"], "status": "optional"})
    count = lambda: len([r for r in store.rows("Rules") if r["type_key"] == "ahu"])
    before = count()
    assert store.refresh_rule_mapping(rules, "ahu") >= 1                       # by name: added at the end
    assert count() == before + 1
    store2 = make_store()
    store2.refresh_rule_mapping(rules, "ahu", statuses=True)                  # rewrite: same order as bundled
    rows = sorted((r for r in store2.rows("Rules") if r["type_key"] == "ahu"), key=lambda r: int(r["order"]))
    assert [r["field"] for r in rows] == [f["label"] for f in ahu["fields"]]


def test_update_rules_adds_a_new_type():
    import copy
    store = make_store()
    rules = copy.deepcopy(SAMPLE_RULES)
    rules["types"].append({"key": "newtype", "name": "New Things", "export_sheet": "New Thing",
                           "fields": [{"label": "Serial", "columns": ["Serial"], "status": "required"}]})
    assert store.refresh_rule_mapping(rules, "newtype") == 1
    assert any(r["type_key"] == "newtype" for r in store.rows("Rules"))
    assert store.refresh_rule_mapping(rules, "newtype") == 0


def test_never_emails_the_sending_gmail():
    m = Mailer("sender@example.com", "")
    m.send(["sender@example.com", "Sender@Example.com", "rick@example.com"], "x", "<p>x</p>")
    assert m.sent[-1]["To"] == "rick@example.com"
    m.send(["sender@example.com"], "x", "<p>x</p>")
    assert len(m.sent) == 1          # nothing left to send to


def test_interrupted_syncs_are_closed_on_startup():
    from hitlist.runner import recover_interrupted
    store = make_store()
    store.request_refresh("99-001", "tech@example.com")
    store.request_refresh("99-001", "tech@example.com")
    a, b = store.rows("Queue")
    store.set_job(a, status="running", message="Sending email")
    store.set_job(b, status="running", message="Downloading export")
    assert recover_interrupted(store) == 2
    a, b = store.rows("Queue")
    assert (a["status"], a["message"]) == ("done", "ok")
    assert b["status"] == "failed" and "restarted" in b["message"]


def test_pick_project_row_prefers_the_exact_or_closest_name():
    from hitlist.buildingstart import pick_project_row
    rows = ["99-127 Acme", "99-127 Acme Holdings Corp"]
    assert pick_project_row(rows, "99-127", "99-127 Acme") == 0             # exact
    assert pick_project_row(rows, "99-127", "Acme Holdings") == 1           # closest
    assert pick_project_row(rows, "99-127", "acme") == 0                    # case / number ignored


def test_customers_are_never_emailed_as_a_tech():
    store = make_store()
    store.append("Users", [{"email": "cust@example.com", "name": "Taylor Customer", "role": "customer", "active": "yes"}])
    assert store.email_for("Taylor") != "cust@example.com"


def test_heartbeat_records_server_time():
    store = make_store()
    store.heartbeat()
    store.heartbeat()                        # updates the same row, doesn't add another
    rows = [r for r in store.rows("Status") if r["name"] == "server_last_seen"]
    assert len(rows) == 1 and rows[0]["value"]


def test_weekly_summary_whats_new(tmp_path):
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    now = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
    entries = [{"date": "2026-10-01", "audience": "all", "title": "New tab", "text": "Does a thing."},
               {"date": "2026-10-02", "audience": "admins", "title": "Admin bit", "text": "Only admins."},
               {"date": "2026-08-01", "audience": "all", "title": "Old news", "text": "Too old."}]
    send_weekly_summary(store, s, mail, now=now, dry_run=True, whats_new=entries)
    tech = next(m for m in mail.sent if m["To"] == "tech@example.com").get_body(("html",)).get_content()
    boss = next(m for m in mail.sent if m["To"] == "boss@example.com").get_body(("html",)).get_content()
    assert "New tab" in tech and "Admin bit" not in tech and "Old news" not in tech
    assert "New tab" in boss and "Admin bit" in boss
    mail2 = Mailer("app@example.com", "")
    send_weekly_summary(store, s, mail2, now=now, dry_run=True, whats_new=[])
    assert "New in Hitlist" not in mail2.sent[0].get_body(("html",)).get_content()
