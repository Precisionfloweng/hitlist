# Project Hitlist — notes for Claude

Owner: Rick Maitland (RickPFE), Precision Flow Engineering (PFE). Admins: Rick and Cody.
Plan and decisions: the "Project Hitlist — Conversion Plan" doc in the Project Hitlist project.

## Hard rules (public repo)
- Never commit secrets: `.env`, service-account JSON, app passwords, BuildingStart logins.
- Never commit client data: BuildingStart exports, Hitlist workbooks, results files, real project
  names or numbers, people's names. Tests use invented data (see `worker/tests/conftest.py`).
- Before every push, scan the diff for client names and secrets.

## Architecture (short)
- `worker/` Python on a Windows mini PC (24/7). Polls a refresh queue, runs Rick's BuildingStart
  export script by project #, applies rules, writes dashboard numbers to the Google Sheet
  "PFE Hitlist Data" (service account hitlist-app@pfe-hitlist.iam.gserviceaccount.com) and one
  results JSON per project to Vercel Blob. Emails via Rick's Gmail app password.
- `web/` Next.js on Vercel (Hobby now, Pro before rollout). Sign-in with emailed 6-digit codes.
- Refresh is manual (button); weekly summary email shows days since last sync.

## Rules engine facts
- Field codes: P filled, R required+missing, O optional+missing, - not applicable.
- Missing = blank, or only `?`/`` ` `` (BuildingStart's "can't calculate yet" marker).
- A field may list several columns (three-phase readings): filled if ANY has a value.
- Conditions: `equals` (spaces ignored, so "BeltDrive" = "Belt Drive") or `gt`.
- The "Electric Coil" sheet feeds two types: under a Terminal Unit = VAV electric heat, else EDH sub-item.

## Workflow
- Rick chose to have changes pushed straight to `main`.
- Run `python -m pytest` in `worker/` before pushing.
