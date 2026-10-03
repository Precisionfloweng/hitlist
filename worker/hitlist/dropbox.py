"""Read-only access to the company Dropbox (project documents), through Dropbox's API.

The app is a "Scoped access / Full Dropbox" app with only the files.metadata.read and files.content.read
permissions. Its key, secret and refresh token live in the server's .env (never in GitHub):
DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN. Set up once with `python -m hitlist dropbox-setup`.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

AUTH_URL = "https://www.dropbox.com/oauth2/authorize"
TOKEN_URL = "https://api.dropboxapi.com/oauth2/token"
API = "https://api.dropboxapi.com/2"


class DropboxError(RuntimeError):
    pass


def authorize_url(app_key: str, fresh_sign_in: bool = False) -> str:
    """The page where the account owner clicks Allow; Dropbox then shows a code to paste back.
    fresh_sign_in makes Dropbox ask for the sign-in again, so the right account (work, not personal) is used."""
    url = f"{AUTH_URL}?client_id={app_key}&response_type=code&token_access_type=offline"
    return url + "&force_reauthentication=true" if fresh_sign_in else url


def exchange_code(app_key: str, app_secret: str, code: str, session=None) -> str:
    """Trade the one-time code for a long-lived refresh token."""
    s = session or requests
    r = s.post(TOKEN_URL, data={"code": code.strip(), "grant_type": "authorization_code"},
               auth=(app_key, app_secret), timeout=30)
    if r.status_code != 200:
        raise DropboxError(f"Dropbox didn't accept the code ({r.status_code}): {r.text[:200]}")
    token = r.json().get("refresh_token")
    if not token:
        raise DropboxError("Dropbox didn't return a refresh token. Run dropbox-setup again.")
    return token


class Dropbox:
    def __init__(self, app_key: str, app_secret: str, refresh_token: str, session=None) -> None:
        if not (app_key and app_secret and refresh_token):
            raise DropboxError("Dropbox isn't set up on this server yet. Run: python -m hitlist dropbox-setup")
        self.app_key, self.app_secret, self.refresh_token = app_key, app_secret, refresh_token
        self.s = session or requests.Session()
        self._access = ""
        self._expires = 0.0
        self.path_root: dict | None = None      # set by use_team_space()

    def _token(self) -> str:
        if not self._access or time.time() > self._expires - 60:
            r = self.s.post(TOKEN_URL, data={"grant_type": "refresh_token", "refresh_token": self.refresh_token},
                            auth=(self.app_key, self.app_secret), timeout=30)
            if r.status_code != 200:
                raise DropboxError(f"Dropbox sign-in failed ({r.status_code}): {r.text[:200]}")
            data = r.json()
            self._access = data["access_token"]
            self._expires = time.time() + float(data.get("expires_in", 14400))
        return self._access

    def _post(self, endpoint: str, body: dict | None, team_root: bool = True) -> dict:
        headers = {"Authorization": f"Bearer {self._token()}"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if team_root and self.path_root:
            headers["Dropbox-API-Path-Root"] = json.dumps(self.path_root)
        r = self.s.post(f"{API}/{endpoint}", headers=headers,
                        data=json.dumps(body) if body is not None else None, timeout=60)
        if r.status_code != 200:
            raise DropboxError(f"Dropbox {endpoint} failed ({r.status_code}): {r.text[:300]}")
        return r.json()

    def account(self) -> dict:
        return self._post("users/get_current_account", None, team_root=False)

    def use_team_space(self, account: dict | None = None) -> bool:
        """Look at folders from the team's top level (where the shared company folders are), not the
        member's own folder. Returns True for a team account."""
        info = (account or self.account()).get("root_info", {})
        root, home = info.get("root_namespace_id"), info.get("home_namespace_id")
        if info.get(".tag") == "team" and root and root != home:
            self.path_root = {".tag": "root", "root": root}
            return True
        return False

    def list_folder(self, path: str) -> list[dict]:
        """Everything directly inside a folder ("" = top level). Each entry has .tag (folder/file), name, id..."""
        data = self._post("files/list_folder", {"path": path, "recursive": False, "include_deleted": False})
        entries = list(data.get("entries", []))
        while data.get("has_more"):
            data = self._post("files/list_folder/continue", {"cursor": data["cursor"]})
            entries += data.get("entries", [])
        return entries

    def folders(self, path: str) -> list[dict]:
        return sorted((e for e in self.list_folder(path) if e.get(".tag") == "folder"),
                      key=lambda e: e["name"].lower())


def find_folder(entries: list[dict], name: str) -> dict | None:
    """The folder with this name (case and extra spaces ignored)."""
    want = " ".join(name.split()).lower()
    return next((e for e in entries if e.get(".tag") == "folder" and " ".join(e["name"].split()).lower() == want), None)


def set_env_values(path: str | Path, values: dict[str, str]) -> None:
    """Write KEY=value lines into a .env file, replacing existing keys and adding new ones at the end."""
    p = Path(path)
    lines = p.read_text(encoding="utf-8").splitlines() if p.exists() else []
    left = dict(values)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if "=" in line and not line.lstrip().startswith("#") and key in left:
            lines[i] = f"{key}={left.pop(key)}"
    lines += [f"{k}={v}" for k, v in left.items()]
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")


def connection_report(dbx: Dropbox, tech_folder: str) -> list[str]:
    """What the server can see: the account, the technician folders and how many project folders each has."""
    acct = dbx.account()
    team = dbx.use_team_space(acct)
    out = [f"Connected to Dropbox as {acct.get('name', {}).get('display_name', '?')}"
           f" ({'team account' if team else 'personal account'})."]
    kind = (acct.get("account_type") or {}).get(".tag", "?")
    team_name = (acct.get("team") or {}).get("name", "")
    out.append(f"  Email: {acct.get('email', '?')} | Dropbox plan: {kind}"
               + (f" | Team: {team_name}" if team_name else " | Not part of a team"))
    top = dbx.folders("")
    tech = find_folder(top, tech_folder)
    if not tech and dbx.path_root:            # also try the member's own view of Dropbox
        saved, dbx.path_root = dbx.path_root, None
        own = dbx.folders("")
        tech = find_folder(own, tech_folder)
        if tech or not top:
            top = own
        else:
            dbx.path_root = saved
    if not top:
        out.append("Dropbox shows this app an empty folder. That happens when the app was created with "
                   "'App folder' access instead of 'Full Dropbox' (see Permission type on the app's Settings tab). "
                   "Create a new app with Full Dropbox, then run: python -m hitlist dropbox-setup --relink")
        return out
    if not tech:
        out.append(f"Couldn't find a folder named '{tech_folder}' at the top level. Top-level folders seen: "
                   + (", ".join(e["name"] for e in top) or "(none)"))
        return out
    techs = dbx.folders(tech["path_lower"])
    out.append(f"Found '{tech['name']}' with {len(techs)} technician folder(s):")
    total = 0
    for t in techs:
        projects = dbx.folders(t["path_lower"])
        total += len(projects)
        out.append(f"  {t['name']}: {len(projects)} folder(s)")
    out.append(f"{total} project folder(s) in all. Read-only: Hitlist can't change or delete anything in Dropbox.")
    return out
