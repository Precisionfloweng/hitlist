# Setting up the worker on the mini PC

One-time setup, about 30 minutes. Do it on the Windows mini PC that stays on 24/7.

## 1. Install the tools
1. **Python 3.12**: python.org/downloads. In the installer tick **"Add python.exe to PATH"**.
2. **Git for Windows**: git-scm.com/download/win, all defaults.

## 2. Get the code
Open **Command Prompt** and run:
```
cd C:\
git clone https://github.com/Precisionfloweng/hitlist.git Hitlist
cd C:\Hitlist\worker
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[browser]"
python -m playwright install chromium
```

## 3. Secrets (never in GitHub)
1. Make the folder `C:\Hitlist\worker\secrets`.
2. Copy the Google key file (the `.json` downloaded from Google Cloud) into it and rename it
   `service-account.json`.
3. Copy `.env.example` to `.env` (same folder) and fill it in with Notepad:
   - `GOOGLE_SERVICE_ACCOUNT_FILE=C:\Hitlist\worker\secrets\service-account.json`
   - `HITLIST_SHEET_ID=` the long ID from the PFE Hitlist Data sheet link
   - `BUILDINGSTART_USERNAME=` / `BUILDINGSTART_PASSWORD=` the login the worker uses
   - `GMAIL_ADDRESS=` / `GMAIL_APP_PASSWORD=` the Gmail app password
   - `ADMIN_EMAILS=` extra people for the all-projects weekly summary, comma separated (admins get it automatically; the owner only if listed here)
   - `FAILURE_EMAILS=` who gets "sync failed" emails besides the tech (work address; nothing is ever sent to `GMAIL_ADDRESS`)

## 4. First run
```
cd C:\Hitlist\worker
.venv\Scripts\activate
python -m hitlist setup --admin you@precisionfloweng.com --name "Your Name"
python -m hitlist add-project 99-001 "Test project name" --tech Rick
python -m hitlist refresh 99-001 --by you@precisionfloweng.com
python -m hitlist run-once
```
Use a real project number. You should get a "Sync complete" email and see rows appear in the
sheet's Projects, Dashboard and History tabs. (Once the website exists, projects are added there.)

## 5. Keep it running (Task Scheduler)
Open **PowerShell as Administrator** (Start → type PowerShell → right-click → Run as administrator) and run:
```
powershell -ExecutionPolicy Bypass -File C:\Hitlist\worker\windows\install_tasks.ps1 -AsSystem
```
This creates `Hitlist worker` (starts with Windows,
restarts itself) and `Hitlist weekly summary` (Mondays 6:15 AM; output in `logs\weekly_summary.log`), and starts the worker.

Logs are in `C:\Hitlist\worker\logs\worker.log`.

## 6. Dropbox (project documents, read-only)
1. Create the app at dropbox.com/developers/apps: **Scoped access**, **Full Dropbox**. On its **Permissions**
   tab tick only `files.metadata.read` and `files.content.read`, then **Submit**.
2. On the server:
```
cd C:\Hitlist\worker
.venv\Scripts\activate
python -m hitlist dropbox-setup
```
   Paste the **App key**, then the **App secret** (from the app's Settings tab; click Show for the secret). Ctrl+V or right-click pastes.
   A Dropbox page opens: sign in with the PFE account, click **Allow**, copy the code it shows and paste it back.
   The key, secret and refresh token are saved in `.env`. The command then lists the technician folders and
   how many project folders each has. Run `python -m hitlist dropbox-test` any time to see that list again.
3. If the technicians folder has another name, add `DROPBOX_TECH_FOLDER=Its Name` to `.env`.

## Updating later
```
cd C:\Hitlist
git pull
```
then restart the `Hitlist worker` task.
