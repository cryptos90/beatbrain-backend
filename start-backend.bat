@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM --- ensure we are in backend repo
if not exist "package.json" (
  echo [ERROR] Missing package.json in backend directory.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found in PATH.
  pause
  exit /b 1
)

REM --- optional port param, default 3000
set "BPORT=%~1"
if "%BPORT%"=="" set "BPORT=3000"
set "PORT=%BPORT%"
set "NODE_ENV=development"

echo [INFO] Starting backend on PORT=%PORT%
echo [INFO] NODE_ENV=%NODE_ENV%

REM --- free backend port
for /f %%a in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique"') do (
  echo [INFO] Killing process on :%PORT% PID=%%a
  taskkill /F /PID %%a >nul 2>nul
)

REM --- install deps if needed
if not exist "node_modules" (
  echo [INFO] Installing backend deps ^(npm install^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed ^(backend^).
    pause
    exit /b 1
  )
)

call npm run start:dev
set "EXITCODE=!errorlevel!"

echo.
echo [INFO] Backend exited with code !EXITCODE!
pause
exit /b !EXITCODE!
