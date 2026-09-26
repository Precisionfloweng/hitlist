# Project Hitlist

Precision Flow Engineering's test-and-balance completion tracker. It replaces the Macro Scheduler
"Project Hitlist" scripts, AppSheet, and the per-project Hitlist Excel files.

For every project, the app reads the BuildingStart full-project export and shows, per piece of
equipment, which fields are filled (✓), missing and required (✖), or missing and optional (⚠),
plus completion % and a punch-list (deficiency) breakdown.

## Layout

| Folder | What it is |
| --- | --- |
| `worker/` | Python. Runs on the office mini PC: exports each project from BuildingStart, applies the rules, writes results. |
| `web/` | Next.js website on Vercel *(coming in phase 3)*. |
| `docs/RULES.md` | Readable list of every rule (required / optional per field). |

## Worker quick start

```bash
cd worker
pip install -e ".[dev]"
python -m pytest                       # run the tests
python -m hitlist check path/to/export.xlsx --out results.json
```

`check` prints a completion summary per equipment type and writes the full results JSON.
Other commands (`setup`, `add-project`, `refresh`, `run`, `run-once`, `weekly-summary`) are listed at
the top of `worker/hitlist/cli.py`. Installing on the mini PC: `docs/MINI_PC_SETUP.md`.

## Rules

Rules live in `worker/hitlist/data/rules_seed.json` for now (seeded from the old scripts) and will
move to the Google Sheet so they can be edited from the web app. After changing the seed, regenerate
the readable copy with `python worker/tools/rules_to_markdown.py`.

## This repository is public

No passwords, keys, `.env` files, BuildingStart exports, Hitlist workbooks, or real project or client
names go in here. Tests use made-up data only. See `CLAUDE.md`.
