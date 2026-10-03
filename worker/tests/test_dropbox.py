import json

from hitlist.dropbox import Dropbox, connection_report, find_folder, set_env_values


class Resp:
    def __init__(self, data, status=200):
        self.status_code, self._data, self.text = status, data, json.dumps(data)

    def json(self):
        return self._data


class FakeDropbox:
    """Answers like Dropbox's API for a team with one technicians folder (invented names)."""
    def __init__(self):
        self.calls = []
        self.tree = {
            "": ["Company Files", "Techs"],
            "/techs": ["Alex Tech", "Sam Tech"],
            "/techs/alex tech": ["99-001 Sample Tower", "99-002 Test Clinic"],
            "/techs/sam tech": ["99-003 Demo School"],
        }

    def post(self, url, headers=None, data=None, auth=None, timeout=None):
        self.calls.append((url, headers or {}, data))
        if url.endswith("/oauth2/token"):
            return Resp({"access_token": "tok", "expires_in": 14400})
        if url.endswith("users/get_current_account"):
            return Resp({"name": {"display_name": "Test User"},
                         "root_info": {".tag": "team", "root_namespace_id": "100", "home_namespace_id": "200"}})
        body = json.loads(data)
        if url.endswith("list_folder/continue"):
            return Resp({"entries": [{".tag": "file", "name": "readme.pdf"}], "has_more": False})
        path = body["path"]
        names = self.tree.get(path, [])
        entries = [{".tag": "folder", "name": n, "path_lower": f"{path}/{n}".lower(), "id": f"id:{n}"} for n in names]
        return Resp({"entries": entries, "has_more": path == "", "cursor": "c1"})


def test_report_lists_tech_and_project_folders_from_team_root():
    fake = FakeDropbox()
    lines = connection_report(Dropbox("k", "s", "r", session=fake), "techs")
    assert lines[0] == "Connected to Dropbox as Test User (team account)."
    assert "Found 'Techs' with 2 technician folder(s):" in lines
    assert "  Alex Tech: 2 folder(s)" in lines and "  Sam Tech: 1 folder(s)" in lines
    assert "3 project folder(s) in all." in lines[-1]
    # folder listings use the team's top level, the account call doesn't
    lists = [h for u, h, _ in fake.calls if "list_folder" in u]
    assert lists and all(json.loads(h["Dropbox-API-Path-Root"])["root"] == "100" for h in lists)
    acct = [h for u, h, _ in fake.calls if "get_current_account" in u][0]
    assert "Dropbox-API-Path-Root" not in acct


def test_report_when_tech_folder_missing():
    lines = connection_report(Dropbox("k", "s", "r", session=FakeDropbox()), "Nope")
    assert "Couldn't find a folder named 'Nope'" in lines[-1] and "Company Files" in lines[-1]


def test_find_folder_ignores_case_and_spaces():
    entries = [{".tag": "folder", "name": "PFE  -  Tech"}, {".tag": "file", "name": "x"}]
    assert find_folder(entries, "pfe - tech")["name"] == "PFE  -  Tech"


def test_set_env_values_replaces_and_appends(tmp_path):
    env = tmp_path / ".env"
    env.write_text("# comment\nA=1\nDROPBOX_APP_KEY=old\n", encoding="utf-8")
    set_env_values(env, {"DROPBOX_APP_KEY": "new", "DROPBOX_REFRESH_TOKEN": "t"})
    assert env.read_text(encoding="utf-8") == "# comment\nA=1\nDROPBOX_APP_KEY=new\nDROPBOX_REFRESH_TOKEN=t\n"
