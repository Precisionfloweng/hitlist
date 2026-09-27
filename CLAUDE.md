# Project Hitlist — notes for Claude

Owner: Rick (GitHub RickPFE), Precision Flow Engineering (PFE). Two admins: Rick and the owner.
Plan and decisions: the "Project Hitlist — Conversion Plan" doc in the Project Hitlist project.

## Hard rules (public repo)
- Never commit secrets: `.env`, service-account JSON, app passwords, BuildingStart logins.
- Never commit client data: BuildingStart exports, Hitlist workbooks, results files, real project
  names or numbers, technician or contractor names. Tests use invented data (see `worker/tests/conftest.py`).
- Before every push, scan the diff for client names and secrets.

## Architecture (short)
- `worker/` Python on a Windows mini PC (24/7). Polls the Queue tab, downloads the BuildingStart
  export by project # (`hitlist/buildingstart.py`, Playwright, adapted from Rick's
  airnab_downloader.py; login from .env), applies rules, writes the Google Sheet "PFE Hitlist Data"
  (tabs defined in `hitlist/store.py`) and hands one results JSON per project to the web app
  (`POST /api/worker/results/{project}` with `x-worker-secret`), which stores it in Vercel Blob.
  Emails via Rick's Gmail app password. Setup: `docs/MINI_PC_SETUP.md`.
- `web/` Next.js on Vercel (Hobby now, Pro before rollout). Sign-in with emailed 6-digit codes.
- Refresh is manual (button); weekly summary email shows days since last sync.

## Project keys
- Projects can share a number (two sites on one contract). Each project's key is `project_id`, blank
  meaning "same as project_number"; a second site gets e.g. "26-083-2". URLs, Queue.project_number,
  Dashboard/Deficiencies/History/ProjectRules rows, results files and export folders all use the key.
- The worker searches BuildingStart by the real number; with several rows it opens the one whose name
  best matches the Hitlist name (`buildingstart.pick_project_row`).

## Rules engine facts
- Field codes: P filled, R required+missing, O optional+missing, - not applicable.
- Missing = blank, or only `?`/`` ` `` (BuildingStart's "can't calculate yet" marker).
- N/A entries (-, --, dashes, na, n/a, nd, n/d, none; any case, spaces/dots ignored) = code N:
  answered, left out of the counts. `?` is still missing, `0` is a reading.
- Design/Actual pairs (matched by name, 80 in the default rules): a completely blank Design skips
  both fields (unit doesn't have it); a "-" Design still requires the Actual.
- A field may list several columns (three-phase readings): filled if ANY has a value.
- Conditions: `equals` (spaces ignored, so "BeltDrive" = "Belt Drive") or `gt`.
- Rules: the Rules tab is the company default (admins edit). ProjectRules holds one project's
  required/optional/ignore changes (anyone edits, on the project's Rules tab); blank status = default.
  The worker applies them per project (`store.apply_overrides`).
- The "Electric Coil" sheet feeds two types: under a Terminal Unit = VAV electric heat, else EDH sub-item.

## Workflow
- Rick chose to have changes pushed straight to `main`.
- Run `python -m pytest` in `worker/` before pushing.
