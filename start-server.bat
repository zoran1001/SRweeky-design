@echo off
title AFTERSHOCK Weekly Report Sync Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found. Please install the LTS version from https://nodejs.org
  echo   Then double-click this file again.
  echo.
  pause
  exit /b 1
)

rem --quiet : start without opening the browser (used by autostart)
set AFTERSHOCK_OPEN=1
if "%~1"=="--quiet" set AFTERSHOCK_OPEN=

echo.
echo   Starting the sync server. Keep this window open.
echo   Closing this window stops the server.
echo   The management page will open in your browser automatically.
echo.

node server.js

echo.
echo   Server stopped. Press any key to close.
pause >nul
