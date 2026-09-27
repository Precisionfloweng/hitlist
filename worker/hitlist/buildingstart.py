"""Downloads a project's full Excel export from BuildingStart (Airnab).

Based on Rick's airnab_downloader.py. Same steps, but the login comes from the
settings file (.env) instead of being written in the code, because this repo is public.

Needs:  pip install playwright   then   python -m playwright install chromium
"""

from __future__ import annotations

import re

import time
from pathlib import Path
from typing import Callable

LOGIN_URL = "https://live.buildingstart.com/pfe/PublicSite/Default/Login.aspx"
HOME_URL = "https://live.buildingstart.com/pfe/"

SEL_USERNAME = "#ctl00_ContentPlaceHolder1_lgvLogin_ctlLogin_lgnLogin_UserName"
SEL_PASSWORD = "#ctl00_ContentPlaceHolder1_lgvLogin_ctlLogin_lgnLogin_Password"
SEL_LOGIN_BTN = "#ctl00_ContentPlaceHolder1_lgvLogin_ctlLogin_lgnLogin_LoginButton"
SEL_PROJ_FILTER = "input[data-field='ProjectNumber']"


_WORD = re.compile(r"[a-z0-9]+")
_FILLER = {"the", "of", "and", "at", "for", "project", "site", "phase"}


def _words(text: str, number: str) -> set[str]:
    """Distinctive words of a project name, without the project number."""
    text = str(text or "").lower().replace(str(number or "").lower(), " ")
    return {w for w in _WORD.findall(text) if w not in _FILLER and not w.isdigit()}


def pick_project_row(row_names: list[str], project_number: str, project_name: str) -> int:
    """Which BuildingStart row to open when searching by number returns several projects.
    Picks the row whose name shares the most distinctive words with the Hitlist project name."""
    if len(row_names) == 1:
        return 0
    want = _words(project_name, project_number)
    row_words = [_words(n, project_number) for n in row_names]
    shared = set.intersection(*row_words)          # e.g. the district name on both sites
    # Score on words that tell the rows apart; longer words count more ("Hicks" beats "ES").
    scores = [sum(len(w) for w in want & (words - shared)) for words in row_words]
    best = max(range(len(scores)), key=lambda i: scores[i])
    if scores[best] == 0 or scores.count(scores[best]) > 1:
        names = "; ".join(f"'{n.strip()}'" for n in row_names)
        raise RuntimeError(f"{len(row_names)} BuildingStart projects are numbered {project_number}: {names}. "
                           f"Change the Hitlist project name ('{project_name}') so it matches one of them.")
    return best


def download_project_xlsx(project_number: str, output_dir: Path, username: str, password: str,
                          session_dir: Path = Path("browser_session"), headless: bool = True,
                          download_timeout_minutes: int = 15,
                          status: Callable[[str], None] = lambda m: print(f"[BuildingStart] {m}"),
                          project_name: str = "") -> Path:
    if not username or not password:
        raise RuntimeError("BUILDINGSTART_USERNAME / BUILDINGSTART_PASSWORD are not set in .env")
    from playwright.sync_api import sync_playwright

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    session_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        status("Opening BuildingStart")
        context = p.chromium.launch_persistent_context(
            str(session_dir), headless=headless, accept_downloads=True,
            viewport={"width": 1280, "height": 768}, args=["--disable-popup-blocking"])
        try:
            page = context.new_page()

            # 1. Log in, or reuse the saved session
            page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
            time.sleep(1)
            if "login" in page.url.lower():
                status("Logging in")
                page.fill(SEL_USERNAME, username)
                page.fill(SEL_PASSWORD, password)
                page.click(SEL_LOGIN_BTN)
                page.wait_for_url(lambda url: "login" not in url.lower(), timeout=30000)

            # 2-3. Project list, filtered by project number
            status("Finding the project")
            page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30000)
            time.sleep(5)   # Kendo grid render
            box = page.locator(SEL_PROJ_FILTER)
            box.wait_for(timeout=20000)
            time.sleep(1)
            box.fill(project_number)
            time.sleep(3)   # grid filter

            # 4. Open the project (Project Name cell of the matching row)
            page.keyboard.press("Escape")
            time.sleep(1)
            rows = page.locator(f"tr:has-text('{project_number}')")
            if rows.count() == 0:
                raise RuntimeError(f"Project {project_number} was not found in BuildingStart")
            # Two sites under one contract can share a number: open the one whose name matches.
            if rows.count() > 1:
                names = [rows.nth(i).locator("td").nth(5).inner_text() for i in range(rows.count())]
                row = rows.nth(pick_project_row(names, project_number, project_name))
            else:
                row = rows.nth(0)
            cell = row.locator("td").nth(5)
            cell.wait_for(timeout=15000)
            cell.click()
            page.wait_for_load_state("domcontentloaded", timeout=30000)
            time.sleep(6)

            # 5-6. Excel Export Tool dialog; find the Export button in the page or its frames
            status("Opening export tool")
            page.wait_for_selector("text=Excel Export Tool", timeout=30000)
            page.click("text=Excel Export Tool")
            export_frame = None
            for _ in range(60):
                for frame in page.frames:
                    try:
                        if frame.locator("#btn-export").count() > 0:
                            export_frame = frame
                            break
                    except Exception:  # noqa: BLE001 - frames come and go while loading
                        continue
                if export_frame is not None:
                    break
                time.sleep(0.5)
            if export_frame is None:
                raise RuntimeError("Export button did not appear within 30 seconds")

            # 7. Download
            status("Downloading export")
            btn = export_frame.locator("#btn-export")
            btn.wait_for(state="visible", timeout=30000)
            time.sleep(1)
            with page.expect_download(timeout=download_timeout_minutes * 60 * 1000) as dl:
                btn.click()
            out_path = output_dir / f"{project_number}_TAB_Report.xlsx"
            dl.value.save_as(str(out_path))
            status("Export downloaded")
            return out_path
        finally:
            context.close()
