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

echo.
echo   Starting the sync server. Keep this window open.
echo   Closing this window stops the server.
echo.

node server.js

echo.
echo   Server stopped. Press any key to close.
pause >nul
