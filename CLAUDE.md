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

## Project documents (Dropbox)
- Read-only Dropbox app ("Full Dropbox", files.metadata.read + files.content.read); key/secret/refresh token only in
  the server's .env (`hitlist dropbox-setup`). The team's shared folders are read from the team root (path root).
- `hitlist/documents.py`: project folder = folder starting with the job number in a technician folder (or directly
  under the technicians folder), the name must clearly pick one when a number is shared (else it asks for Change folder), folders
  linked to another project with the same number are skipped; a job folder without the standard folders but with a
  folder per site uses the site folder that clearly matches the Hitlist name (`documents_folder`, `best_by_name`); reads only Drawings and Specs, Submittal, TAB Plan, ASIs and RFIs,
  Change Orders; page text (PyMuPDF) sent gzipped in parts to `POST /api/worker/docs/{project}?part=`, manifest last.
  Unchanged files (Dropbox content hash) are skipped. Queue rows with kind "docs" are document updates; each sync
  queues one. Projects columns dropbox_id, dropbox_path (pasted path or found), docs_updated, docs_status.
- Last punch list sent = newest file (client_modified) in the project's "Deficiency Reports" folder (names/dates only):
  Projects punch_sent/punch_file, updated by docs jobs and by `refresh_punch_lists` right before the Monday email.
- Web `lib/docs.ts`: keyword/tag page search, only the best pages go to Claude; answers cite [S#] file+page;
  history in Blob docs-qa/. File names/contents are client data: never in the repo or tests.

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
- Design/Actual pairs (matched by name: "Design X" / "Actual X", 112 in the default rules): a completely blank Design skips
  both fields (unit doesn't have it); a "-" Design still requires the Actual.
- A field may list several columns (three-phase readings): filled if ANY has a value.
- Conditions: `equals` (spaces ignored, so "BeltDrive" = "Belt Drive"), `gt`, or `filled` (column has a value;
  coil air velocities only count when Airside Face Area is filled in).
- Rules: the Rules tab is the company default (admins edit). `update-rules TYPE [--statuses]` copies a type from
  the bundled seed; with the same field count it pairs fields by position, so renames carry over (and to ProjectRules);
  new fields are appended, or with --statuses the type is rewritten to match the seed exactly. ProjectRules holds one project's
  required/optional/ignore changes (anyone edits, on the project's Rules tab); blank status = default.
  The worker applies them per project (`store.apply_overrides`).
- The "Electric Coil" sheet feeds two types: under a Terminal Unit = VAV electric heat, else EDH sub-item.

## What's new
- Every change a tech or admin would notice gets a plain-English entry in `web/content/whats-new.json`
  (date, audience "all" or "admins", title, one-line text). The Monday email shows the 10 newest (link to the rest); the Help
  page and Admin → What's new show the list. No client names in entries.

## Workflow
- Rick chose to have changes pushed straight to `main`.
- Run `python -m pytest` in `worker/` before pushing.
