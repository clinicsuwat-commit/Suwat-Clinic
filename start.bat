@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or newer: https://nodejs.org/
  pause
  exit /b 1
)
echo Starting Suwat Clinic in a separate terminal window...
start "Suwat Clinic - Server" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
