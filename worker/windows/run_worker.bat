@echo off
REM Starts the Hitlist worker. Task Scheduler runs this at startup.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat
python -m hitlist run
