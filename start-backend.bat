@echo off
cd /d "%~dp0"
if not "%~1"=="" (
  set PORT=%~1
  echo Using PORT=%PORT%
)
npm run start:dev
pause
