@echo off

:: ====================================================
:: EchoShade Application Launcher
:: ====================================================

echo.
echo ====================================================
echo           ECHOSHADE APPLICATION LAUNCHER
echo ====================================================
echo.

:: Check if Python is installed
echo [1/4] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 goto NO_PYTHON

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo    Found Python %PYTHON_VERSION%
echo.
goto CHECK_VENV

:NO_PYTHON
echo ERROR: Python is not installed or not in PATH!
echo Please install Python 3.7+ from https://python.org
exit /b 1

:CHECK_VENV
:: Check if virtual environment exists
echo [2/4] Checking virtual environment...
if exist "venv\Scripts\python.exe" goto VENV_OK

echo    Virtual environment not found, creating one...
python -m venv venv
if errorlevel 1 goto VENV_FAIL
echo    Virtual environment created successfully.
goto VENV_OK

:VENV_FAIL
echo ERROR: Failed to create virtual environment!
exit /b 1

:VENV_OK
echo    Virtual environment found.
echo.

:: Check dependencies
echo [3/4] Checking dependencies...
if exist "venv\installed.flag" goto DEPS_OK

echo    Installing dependencies...
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set http_proxy=
set https_proxy=
set all_proxy=
venv\Scripts\python.exe -m pip install --upgrade pip --quiet --timeout 15
venv\Scripts\pip.exe install -r requirements.txt --quiet --timeout 30
echo ok > venv\installed.flag
echo    Dependencies installed successfully.

:DEPS_OK
echo    Dependencies ready (Fast launch enabled).
echo.

:: Check if .env file exists
if not exist ".env" (
    echo WARNING: .env file not found!
    echo.
)

:: Launch the application
echo [4/4] Starting EchoShade application...
echo    Launching main.py...
echo.
echo ====================================================
echo           APPLICATION STARTING...
echo ====================================================
echo.
echo Press Ctrl+C to stop the application
echo.

venv\Scripts\python.exe main.py

if errorlevel 1 (
    echo Application exited with error code: %errorlevel%
) else (
    echo Application exited normally
)
echo.