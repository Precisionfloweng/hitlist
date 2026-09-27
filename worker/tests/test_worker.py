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
    return Settings(results_dir=tmp_path / "results", admin_emails=["rick@example.com"])


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
    assert mail.sent[-1]["To"] == "tech@example.com"
    assert "no errors" in mail.sent[-1].get_body(("html",)).get_content()


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
    assert job["status"] == "failed" and "login failed" in job["message"]
    assert store.project("99-001")["last_sync_status"].startswith("failed")
    assert set(mail.sent[-1]["To"].split(", ")) == {"tech@example.com", "boss@example.com", "rick@example.com"}


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
    assert "never synced" in body and "9 days" in body
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
    assert seen[0] == "Picked up by the mini PC"
    assert "Logging in to BuildingStart" in seen
    assert "Checking every unit against the rules" in seen
    assert seen[-1] == "ok"
