"""Settings for the worker, read from environment variables or a .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def load_dotenv(path: str | Path = ".env") -> None:
    """Minimal .env reader (KEY=value per line). Existing environment variables win."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


@dataclass
class Settings:
    service_account_file: str = ""
    sheet_id: str = ""
    gmail_address: str = ""
    gmail_app_password: str = ""
    sender_name: str = "PFE Hitlist"
    buildingstart_username: str = ""
    buildingstart_password: str = ""
    browser_session_dir: Path = Path("browser_session")
    export_command: str = ""          # optional override; blank = built-in BuildingStart downloader
    export_dir: Path = Path("exports")
    results_dir: Path = Path("results")
    app_url: str = ""                 # web app base URL, once it exists
    worker_secret: str = ""           # shared secret for the web app's worker endpoint
    admin_emails: list[str] = field(default_factory=list)
    # Who gets "sync failed" emails besides the tech (Rick's work address).
    failure_emails: list[str] = field(default_factory=list)
    poll_seconds: int = 30
    # Read-only Dropbox app for project documents (python -m hitlist dropbox-setup fills these in).
    dropbox_app_key: str = ""
    dropbox_app_secret: str = ""
    dropbox_refresh_token: str = ""
    dropbox_tech_folder: str = "PFE - Technician"   # top-level folder holding each technician's project folders
    export_timeout_minutes: int = 30

    @classmethod
    def from_env(cls, dotenv: str | Path | None = ".env") -> "Settings":
        if dotenv:
            load_dotenv(dotenv)
        e = os.environ.get
        return cls(
            service_account_file=e("GOOGLE_SERVICE_ACCOUNT_FILE", ""),
            sheet_id=e("HITLIST_SHEET_ID", ""),
            gmail_address=e("GMAIL_ADDRESS", ""),
            gmail_app_password=e("GMAIL_APP_PASSWORD", "").replace(" ", ""),
            sender_name=e("SENDER_NAME", "PFE Hitlist"),
            buildingstart_username=e("BUILDINGSTART_USERNAME", ""),
            buildingstart_password=e("BUILDINGSTART_PASSWORD", ""),
            browser_session_dir=Path(e("BROWSER_SESSION_DIR", "browser_session")),
            export_command=e("EXPORT_COMMAND", ""),
            export_dir=Path(e("EXPORT_DIR", "exports")),
            results_dir=Path(e("RESULTS_DIR", "results")),
            app_url=e("APP_URL", "").rstrip("/"),
            worker_secret=e("WORKER_SECRET", ""),
            admin_emails=[x.strip() for x in e("ADMIN_EMAILS", "").split(",") if x.strip()],
            failure_emails=[x.strip() for x in e("FAILURE_EMAILS", "").split(",") if x.strip()],
            poll_seconds=int(e("POLL_SECONDS", "30")),
            dropbox_app_key=e("DROPBOX_APP_KEY", ""),
            dropbox_app_secret=e("DROPBOX_APP_SECRET", ""),
            dropbox_refresh_token=e("DROPBOX_REFRESH_TOKEN", ""),
            dropbox_tech_folder=e("DROPBOX_TECH_FOLDER", "PFE - Technician"),
            export_timeout_minutes=int(e("EXPORT_TIMEOUT_MINUTES", "30")),
        )
