@echo off
REM Starts the Hitlist worker. Task Scheduler runs this at startup.
REM If the worker ever stops, wait a minute and start it again.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat
:loop
python -m hitlist run
timeout /t 60 /nobreak >nul
goto loop
