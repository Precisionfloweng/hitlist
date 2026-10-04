"""BuildingStart values sent to the website for Search the Documents (invented data only)."""

import gzip
import json

import pytest

from hitlist.export_reader import read_export
from hitlist.runner import send_project_values
from hitlist.values import ValuesError, pack_values, send_values

from test_worker import make_store, settings


def _website(received: list):
    """A stand-in website: unpacks the body and counts what it got, like /api/worker/values does."""
    def upload(body: bytes):
        data = json.loads(gzip.decompress(body))
        received.append(data)
        units = sum(len(s["units"]) for s in data["sheets"])
        values = sum(len(u["v"]) for s in data["sheets"] for u in s["units"])
        return {"units": units, "values": values}
    return upload


def test_pack_keeps_every_reading_and_leaves_blanks_out(sample_export):
    packed = pack_values(read_export(sample_export), "99-001")
    sheets = {s["sheet"]: s for s in packed["sheets"]}
    assert set(sheets) == {"Air Handling Unit", "Terminal Unit", "Electric Coil", "Supply Outlet"}   # no Project/Deficiency/Note
    ahu1 = next(u for u in sheets["Air Handling Unit"]["units"] if u["name"] == "AHU-1")
    assert ahu1["path"] == "AHU-1"
    assert ahu1["v"]["Design Airflow"] == 10000 and ahu1["v"]["Actual Airflow"] == 9800
    assert ahu1["v"]["Drive Type"] == "Belt Drive" and ahu1["v"]["Area"] == "Level 1"
    assert "Motor Sheave MFG" not in ahu1["v"] and "Equipment Name" not in ahu1["v"]   # blank / kept as name
    ahu2 = next(u for u in sheets["Air Handling Unit"]["units"] if u["name"] == "AHU-2")
    assert ahu2["v"]["% Final Diff."] == "?"                     # "can't calculate yet" markers are kept as typed
    assert packed["counts"]["units"] == 3 + 2 + 2 + 1
    assert packed["counts"]["values"] == sum(len(u["v"]) for s in packed["sheets"] for u in s["units"])


def test_send_skips_when_unchanged_and_resends_when_forced(sample_export, tmp_path):
    export, got = read_export(sample_export), []
    first = send_values(export, "99-001", "2026-01-05T10:00:00+00:00", tmp_path, _website(got))
    assert first["sent"] and len(got) == 1 and got[0]["synced_at"] == "2026-01-05T10:00:00+00:00"
    again = send_values(export, "99-001", "2026-01-06T10:00:00+00:00", tmp_path, _website(got))
    assert not again["sent"] and len(got) == 1                   # same values: nothing sent
    forced = send_values(export, "99-001", "2026-01-06T10:00:00+00:00", tmp_path, _website(got), force=True)
    assert forced["sent"] and len(got) == 2


def test_counts_must_match_or_it_retries_next_time(sample_export, tmp_path):
    export = read_export(sample_export)
    with pytest.raises(ValuesError, match="received 1 units"):
        send_values(export, "99-001", "t", tmp_path, lambda body: {"units": 1, "values": 2})
    got = []
    assert send_values(export, "99-001", "t", tmp_path, _website(got))["sent"]   # nothing was remembered: sent again


def test_sync_notes_the_result_on_the_projects_tab(sample_export, tmp_path):
    store, s, got = make_store(), settings(tmp_path), []
    export = read_export(sample_export)
    assert send_project_values(store, s, "99-001", export, "2026-01-05T10:00:00+00:00", upload=_website(got)) == ""
    p = store.project("99-001")
    assert p["values_updated"] == "2026-01-05T10:00:00+00:00" and p["values_status"].startswith("ok: 8 units")
    assert send_project_values(store, s, "99-001", export, "2026-01-06T10:00:00+00:00", upload=_website(got)) == ""
    assert store.project("99-001")["values_status"].endswith("(unchanged)") and len(got) == 1
    problem = send_project_values(store, s, "99-001", export, "x", force=True, upload=lambda b: {"units": 0, "values": 0})
    assert "received 0 units" in problem
    p = store.project("99-001")
    assert p["values_status"].startswith("failed:") and p["values_updated"] == "2026-01-06T10:00:00+00:00"


def test_sync_without_website_reports_the_values_problem(sample_export, tmp_path):
    from hitlist.mailer import Mailer
    from hitlist.runner import process_next
    store, s, mail = make_store(), settings(tmp_path), Mailer("app@example.com", "")
    store.request_refresh("99-001", "tech@example.com")
    process_next(store, s, mail, export_fn=lambda n: sample_export)
    assert store.project("99-001")["values_status"].startswith("failed: APP_URL")
    assert len(mail.sent) == 1                                     # one email to Rick, not two
