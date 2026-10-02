import copy
import json

from hitlist import check_project, gap_check, load_rules, read_export
from hitlist.cli import main
from hitlist.engine import design_partners, is_missing, is_na
from hitlist.export_reader import Export, Sheet


def _type(results, key):
    return next(t for t in results["types"] if t["key"] == key)


def _unit(type_result, name):
    return next(u for u in type_result["units"] if u["name"] == name)


def test_missing_values():
    assert is_missing(None) and is_missing("") and is_missing("  ")
    assert is_missing("?") and is_missing("??") and is_missing("`")
    assert not is_missing(0) and not is_missing("0") and not is_missing("-")
    assert is_missing(False) and not is_missing(True)      # the Completed checkbox: unticked = not filled


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
    assert _unit(ahu, "AHU-3")["codes"] == "R---PR"   # design + actual airflow both blank -> skipped
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
    assert ("AHU-2", "data_disappeared") not in kinds   # no longer flagged
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


def test_na_entries():
    for v in ["-", "--", "—", "–", "na", "NA", "N/A", "n/a", " N / A ", "N.A.", "nd", "ND", "N/D", "n.d.", "None"]:
        assert is_na(v), v
    for v in ["", None, "?", "0", 0, "no", "Belt Drive", "-5"]:
        assert not is_na(v), v


def _pair_export(rows):
    headers = ["Full Path", "Equipment Name", "Design O/A", "Actual O/A", "Actual Volts"]
    return Export(project={"Number": "99-009"}, sheets={"Air Handling Unit": Sheet(
        "Air Handling Unit", headers, [dict(zip(headers, [n, n, *r])) for n, r in rows])})


PAIR_RULES = {"version": 1, "types": [{"key": "ahu", "name": "AHUs", "export_sheet": "Air Handling Unit",
    "fields": [{"label": "Design O/A", "columns": ["Design O/A"], "status": "required"},
               {"label": "Actual O/A", "columns": ["Actual O/A"], "status": "required"},
               {"label": "Actual Volts", "columns": ["Actual Volts"], "status": "required"}]}]}


def test_design_actual_pairs():
    assert design_partners(load_rules(PAIR_RULES).types[0]) == {1: 0}
    r = check_project(_pair_export([
        ("A1", [1200, None, 480]),     # design, no reading     -> actual missing
        ("A2", ["-", None, 480]),      # "-" design             -> actual still needed
        ("A3", ["-", 1150, 480]),      # "-" design + reading   -> fine
        ("A4", [None, None, 480]),     # no design at all       -> both skipped
        ("A5", [None, 900, 480]),      # no design, has reading -> reading counts, design skipped
        ("A6", ["N/A", "n/a", None]),  # marked N/A             -> answered; volts still missing
        ("A7", ["?", None, 480]),      # "can't calculate"      -> still missing
    ]), load_rules(PAIR_RULES))
    codes = {u["name"]: u["codes"] for u in r["types"][0]["units"]}
    assert codes == {"A1": "PRP", "A2": "NRP", "A3": "NPP", "A4": "--P", "A5": "-PP", "A6": "NNR", "A7": "RRP"}
    a6 = next(u for u in r["types"][0]["units"] if u["name"] == "A6")
    assert (a6["required"], a6["required_filled"]) == (1, 0)   # N/A entries are left out of the counts


def test_sheet_name_match_ignores_spaces_and_case(sample_rules):
    rules = copy.deepcopy(PAIR_RULES)
    rules["types"][0]["export_sheet"] = "air handling unit "
    r = check_project(_pair_export([("A1", [1200, 1100, 480])]), load_rules(rules))
    assert r["types"][0]["units"][0]["codes"] == "PPP"
    rules["types"][0]["export_sheet"] = "Chiller Test"          # project simply has none: no warning
    r = check_project(_pair_export([("A1", [1200, 1100, 480])]), load_rules(rules))
    assert r["types"] == [] and r["warnings"] == []
    rules["types"][0]["export_sheet"] = "Air Handling Units"    # near-miss name: warn with the real one
    r = check_project(_pair_export([("A1", [1200, 1100, 480])]), load_rules(rules))
    assert any("the export has 'Air Handling Unit'" in w for w in r["warnings"])


def test_no_false_warning_for_sheets_other_rules_use():
    rules = copy.deepcopy(PAIR_RULES)
    other = copy.deepcopy(rules["types"][0]); other["key"] = "ahu2"; other["export_sheet"] = "Air Handling Units"
    rules["types"].append(other)     # 'Air Handling Units' missing, but 'Air Handling Unit' belongs to a rule
    r = check_project(_pair_export([("A1", [1200, 1100, 480])]), load_rules(rules))
    assert r["warnings"] == []


def test_velocity_only_when_face_area_filled():
    rules = {"version": 1, "types": [{"key": "coil", "name": "Coils", "export_sheet": "Air Handling Unit",
        "fields": [{"label": "Face Area Sq.Ft.", "columns": ["Design O/A"], "status": "optional"},
                   {"label": "Air Velocity Actual", "columns": ["Actual O/A"], "status": "required",
                    "when": [{"column": "Design O/A", "label": "Airside Face Area", "filled": True}]}]}]}
    r = check_project(_pair_export([("C1", [12.5, None, 1]),     # face area in -> velocity required
                                    ("C2", [None, None, 1]),     # no face area -> velocity n/a
                                    ("C3", ["-", None, 1])]),    # face area marked N/A -> velocity n/a
                      load_rules(rules))
    codes = {u["name"]: u["codes"] for u in r["types"][0]["units"]}
    assert codes == {"C1": "PR", "C2": "O-", "C3": "N-"}


def test_notes_come_through(sample_export, sample_rules):
    notes = check_project(read_export(sample_export), load_rules(sample_rules))["notes"]
    assert [n["text"] for n in notes] == ["General note for the whole job", "Access panel blocked by duct"]  # blank dropped
    assert notes[0]["path"] == "" and notes[1]["path"] == "AHU-1/VAV-1"


def test_accepted_deficiency_counts_as_closed():
    from hitlist.engine import _clean_deficiency
    assert _clean_deficiency({"Deficiency": "x", "Deficiency Status": "Accepted"})["open"] is False
    assert _clean_deficiency({"Deficiency": "x", "Deficiency Status": "Open"})["open"] is True
