"""Builds a small, made-up BuildingStart-style export for the tests.

All names and values here are invented. Never put real project data in this repo.
"""

import openpyxl
import pytest


def _sheet(wb, title, headers, rows):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for r in rows:
        ws.append(r)


@pytest.fixture
def sample_export(tmp_path):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    _sheet(wb, "Project", ["Project Setting", "Value"], [["Number:", "99-001"], ["Name:", "Sample Building"]])
    _sheet(wb, "Deficiency",
           ["Full Path", "Equipment Name", "Item Type", "No.", "Deficiency", "Deficiency Status",
            "Deficiency Priority", "Assigned Role", "Assigned Contact", "Date Completed", "Date due"],
           [["AHU-1", "AHU-1", "Air Handling Unit", "0001", "Fan belt loose", "Open", "High",
             "Mechanical Contractor", "Pat Example", "", ""],
            ["AHU-2", "AHU-2", "Air Handling Unit", "0002", "Filter missing", "Fixed", "Medium",
             "Mechanical Contractor", "Pat Example", "01/01/2026", ""],
            ["VAV-1", "VAV-1", "Terminal Unit", "0003", "Sensor reads 999", "Open", "Medium",
             "Controls Contractor", " ", "", ""]])
    _sheet(wb, "Note",
           ["Full Path", "Equipment Name", "Item Type", "Category", "No.", "Field details", "Reading", "Units", "Comments"],
           [["", "", "", "", "0", "General note for the whole job", "", "", ""],
            ["AHU-1/VAV-1", "VAV-1", "Terminal Unit", "", "0", "Access panel blocked by duct", "", "", ""],
            ["AHU-2", "AHU-2", "Air Handling Unit", "", "0", "", "", "", ""]])
    _sheet(wb, "Air Handling Unit",
           ["Full Path", "Equipment Name", "Area", "Zone", "Unit Manufacturer", "Design Airflow",
            "Actual Airflow", "% Final Diff. ", "Drive Type", "Motor Sheave MFG",
            "Motor Volts T1-T2", "Motor Volts T2-T3", "Completed"],
           [["AHU-1", "AHU-1", "Level 1", "", "Acme", 10000, 9800, 98, "Belt Drive", "", 460, "", False],
            ["AHU-2", "AHU-2", "Level 2", "", "Acme", 5000, "", "?", "Direct Drive", "", "", 461, True],
            ["AHU-3", "AHU-3", "Level 3", "", "", "", "", "??", "Belt Drive", "Browning", "", "", False]])
    _sheet(wb, "Terminal Unit",
           ["Full Path", "Equipment Name", "Area", "Zone", "Manufacturer", "Design Fan Airflow ",
            "Actual Fan Airflow ", "Completed"],
           [["AHU-1/VAV-1", "VAV-1", "Room 101", "", "BoxCo", 400, "", False],
            ["AHU-1/VAV-2", "VAV-2", "Room 102", "", "BoxCo", "", "", False]])
    _sheet(wb, "Electric Coil",
           ["Full Path", "Equipment Name", "Area", "Zone", "EDH Actual KW", "Completed"],
           [["AHU-1/VAV-1/EC-1", "EC-1", "", "", 1.5, False],
            ["AHU-1/EC-9", "EC-9", "", "", "", False]])
    _sheet(wb, "Supply Outlet", ["Full Path", "Equipment Name", "Design Airflow"],
           [["AHU-1/VAV-1/S-1", "S-1", 200]])
    path = tmp_path / "sample_export.xlsx"
    wb.save(path)
    return path


SAMPLE_RULES = {
    "version": 7,
    "types": [
        {"key": "ahu", "name": "AHUs", "export_sheet": "Air Handling Unit", "fields": [
            {"label": "Manufacturer", "columns": ["Unit Manufacturer"], "status": "required"},
            {"label": "Design Airflow", "columns": ["Design Airflow"], "status": "optional"},
            {"label": "Actual Airflow", "columns": ["Actual Airflow"], "status": "required"},
            {"label": "% Diff", "columns": ["% Final Diff."], "status": "ignore"},
            {"label": "Sheave MFG", "columns": ["Motor Sheave MFG"], "status": "required",
             "when": [{"column": "Drive Type", "equals": "BeltDrive"}]},
            {"label": "Actual Volts", "columns": ["Motor Volts T1-T2", "Motor Volts T2-T3"],
             "status": "required"},
        ]},
        {"key": "vav", "name": "VAVs", "export_sheet": "Terminal Unit", "fields": [
            {"label": "Manufacturer", "columns": ["Manufacturer"], "status": "required"},
            {"label": "Actual Fan Airflow", "columns": ["Actual Fan Airflow"], "status": "required",
             "when": [{"column": "Design Fan Airflow", "gt": 0.5}]},
        ]},
        {"key": "vav_eh", "name": "VAV Electric Heat", "export_sheet": "Electric Coil",
         "parent_types": ["Terminal Unit"], "fields": [
            {"label": "Actual KW", "columns": ["EDH Actual KW"], "status": "required"}]},
        {"key": "edh_sub", "name": "Electric Heat (sub-item)", "export_sheet": "Electric Coil",
         "parent_types": ["!Terminal Unit"], "fields": [
            {"label": "Actual KW", "columns": ["EDH Actual KW"], "status": "required"}]},
    ],
}


@pytest.fixture
def sample_rules():
    return SAMPLE_RULES
