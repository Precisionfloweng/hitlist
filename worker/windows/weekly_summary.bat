@echo off
REM Sends the Monday summary emails. Task Scheduler runs this Mondays at 7:00.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat
python -m hitlist weekly-summary
