@echo off
REM Sends the Monday summary emails. Task Scheduler runs this Mondays at 6:15. Output goes to logs\weekly_summary.log.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat
if not exist logs mkdir logs
echo ==== %date% %time% >> logs\weekly_summary.log
python -m hitlist weekly-summary >> logs\weekly_summary.log 2>&1
