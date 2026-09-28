@echo off
cd /d "%~dp0"
if not exist .venv-local\ready.txt (
 echo Run install-local.cmd first.
 pause
 exit /b 1
)
set WAN_LOCAL=1
set PORT=8788
node server.mjs
pause
