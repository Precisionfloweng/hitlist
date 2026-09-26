import copy
import json

from hitlist import check_project, gap_check, load_rules, read_export
from hitlist.cli import main
from hitlist.engine import is_missing


def _type(results, key):
    return next(t for t in results["types"] if t["key"] == key)


def _unit(type_result, name):
    return next(u for u in type_result["units"] if u["name"] == name)


def test_missing_values():
    assert is_missing(None) and is_missing("") and is_missing("  ")
    assert is_missing("?") and is_missing("??") and is_missing("`")
    assert not is_missing(0) and not is_missing("0") and not is_missing(False) and not is_missing("-")


def test_reads_project_and_sheets(sample_export):
    e = read_export(sample_export)
    assert e.project["Number"] == "99-001"
    assert "Air Handling Unit" in e.equipment_sheets()
    assert "Deficiency" not in e.equipment_sheets()
    # header whitespace is cleaned up
    assert "Design Fan Airflow" in e.sheets["Terminal Unit"].headers


def test_codes_per_unit(sample_export, sample_rules):
    r = check_project(read_export(sample_export), load_rules(sample_rules))
    ahu = _type(r, "ahu")
    # fields: Manufacturer, Design Airflow, Actual Airflow, %Diff(ignored), Sheave MFG (belt only), Volts (any phase)
    assert _unit(ahu, "AHU-1")["codes"] == "PPP-RP"   # belt drive, sheave missing -> required missing
    assert _unit(ahu, "AHU-2")["codes"] == "PPR--P"   # direct drive -> sheave n/a; volts on T2-T3 counts
    assert _unit(ahu, "AHU-3")["codes"] == "ROR-PR"
    assert ahu["summary"]["units"] == 3
    assert ahu["summary"]["units_complete"] == 0


def test_conditions_and_parents(sample_export, sample_rules):
    r = check_project(read_export(sample_export), load_rules(sample_rules))
    vav = _type(r, "vav")
    assert _unit(vav, "VAV-1")["codes"] == "PR"   # has design fan airflow -> actual required
    assert _unit(vav, "VAV-2")["codes"] == "P-"   # no fan -> n/a
    assert [u["name"] for u in _type(r, "vav_eh")["units"]] == ["EC-1"]
    assert [u["name"] for u in _type(r, "edh_sub")["units"]] == ["EC-9"]


def test_summary_and_deficiencies(sample_export, sample_rules):
    r = check_project(read_export(sample_export), load_rules(sample_rules))
    assert r["project_number"] == "99-001"
    assert r["rules_version"] == 7
    d = r["deficiency_summary"]
    assert d["total"] == 3 and d["open"] == 2
    assert d["open_by_priority"] == {"High": 1, "Medium": 1}
    assert d["open_by_contact"]["Unassigned"] == 1
    assert r["untracked_sheets"] == {"Supply Outlet": 1}
    s = _type(r, "vav")["summary"]
    assert (s["required_fields"], s["required_filled"]) == (3, 2)
    assert s["fields_pct"] == 66.7


def test_gap_check(sample_export, sample_rules):
    rules = load_rules(sample_rules)
    current = check_project(read_export(sample_export), rules)
    previous = copy.deepcopy(current)
    unit = _unit(_type(previous, "ahu"), "AHU-2")
    unit["codes"] = "PPP--P"   # Actual Airflow was filled last time
    flags = gap_check(previous, current)
    kinds = {(f["unit"], f["kind"]) for f in flags}
    assert ("AHU-2", "data_disappeared") in kinds
    assert ("AHU-2", "completed_but_missing") in kinds   # Completed ticked, required field empty


def test_unmapped_field_is_auto_matched(sample_export, sample_rules):
    rules = copy.deepcopy(sample_rules)
    rules["types"][0]["fields"][0]["columns"] = None      # Manufacturer, no column given
    r = check_project(read_export(sample_export), load_rules(rules))
    assert _unit(_type(r, "ahu"), "AHU-1")["codes"][0] == "P"
    assert any("auto-matched" in w for w in r["warnings"])


def test_bundled_seed_rules_load():
    rules = load_rules()
    keys = {t.key for t in rules.types}
    assert {"ahu", "rtu", "vav", "pump", "chiller"} <= keys
    for t in rules.types:
        for f in t.fields:
            assert f.status in ("required", "optional", "ignore")


def test_cli_writes_results(sample_export, tmp_path, capsys):
    out = tmp_path / "results.json"
    assert main(["check", str(sample_export), "--out", str(out)]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["project_number"] == "99-001"
    assert "required fields filled" in capsys.readouterr().out
