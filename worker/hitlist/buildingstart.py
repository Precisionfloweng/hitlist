"""Downloads a project's full Excel export from BuildingStart (Airnab).

Based on Rick's airnab_downloader.py. Same steps, but the login comes from the
settings file (.env) instead of being written in the code, because this repo is public.

Needs:  pip install playwright   then   python -m playwright install chromium
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

LOGIN_URL = "https://live.buildingstart.com/pfe/PublicSite/Default/Login.aspx"
HOME_URL = "https://live.buildingstart.com/pfe/"

SEL_USERNAME = "#ctl00_ContentPlaceHolder1_lgvLogin_ctlLogin_lgnLogin_UserName"
SEL_PASSWORD = "#ctl00_ContentPlaceHolder1_lgvLogin_ctlLogin_lgnLogin_Password"
SEL_LOGIN_BTN = "#ctl00_ContentPlaceHolder1_lgvLogin_ctlLogin_lgnLogin_LoginButton"
SEL_PROJ_FILTER = "input[data-field='ProjectNumber']"


def download_project_xlsx(project_number: str, output_dir: Path, username: str, password: str,
                          session_dir: Path = Path("browser_session"), headless: bool = True,
                          download_timeout_minutes: int = 15,
                          status: Callable[[str], None] = lambda m: print(f"[BuildingStart] {m}")) -> Path:
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
                status("Logging in to BuildingStart")
                page.fill(SEL_USERNAME, username)
                page.fill(SEL_PASSWORD, password)
                page.click(SEL_LOGIN_BTN)
                page.wait_for_url(lambda url: "login" not in url.lower(), timeout=30000)

            # 2-3. Project list, filtered by project number
            status(f"Finding project {project_number} in BuildingStart")
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
            row_cells = page.locator(f"tr:has-text('{project_number}') td")
            if row_cells.count() == 0:
                raise RuntimeError(f"Project {project_number} was not found in BuildingStart")
            cell = row_cells.nth(5)
            cell.wait_for(timeout=15000)
            cell.click()
            page.wait_for_load_state("domcontentloaded", timeout=30000)
            time.sleep(6)

            # 5-6. Excel Export Tool dialog; find the Export button in the page or its frames
            status("Opening the Excel Export Tool")
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
            status("Downloading the export from BuildingStart (large projects take 5-10 min)")
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
