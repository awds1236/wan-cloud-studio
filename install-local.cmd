@echo off
cd /d "%~dp0"
echo Installing local Python environment. Model files download only on Generate.
python -m venv .venv-local
if errorlevel 1 goto fail
.venv-local\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto fail
.venv-local\Scripts\python.exe -m pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto fail
.venv-local\Scripts\python.exe -m pip install -r local\requirements.txt
if errorlevel 1 goto fail
.venv-local\Scripts\python.exe local\generate.py --probe
if errorlevel 1 goto fail
echo ready>.venv-local\ready.txt
echo Ready. Run start-local.cmd next.
pause
exit /b 0
:fail
echo Installation failed. See the error above.
pause
exit /b 1
