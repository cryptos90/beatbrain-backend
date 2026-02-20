@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo [Backend] node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo [Backend] npm install failed.
    exit /b 1
  )
)

set PORT=%~1
if "%PORT%"=="" set PORT=3000

echo Ensuring port %PORT% is free...
for /f "tokens=5" %%p in ('netstat -aon ^| find ":%PORT%" ^| find "LISTENING"') do (
  echo Killed process on %PORT% with PID %%p
  taskkill /F /PID %%p >nul 2>&1
)

for /f %%p in ('powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($procId in $pids){ Write-Output $procId }"') do (
  taskkill /F /PID %%p >nul 2>&1
)

echo Starting backend on PORT=%PORT%
call npm run start:dev

endlocal
