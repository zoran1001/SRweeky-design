@echo off
title Allow port 8787

net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Please right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall add rule name="AFTERSHOCK-8787" dir=in action=allow protocol=TCP localport=8787 >nul
if errorlevel 1 (
  echo   Failed. Open Windows Firewall - Advanced Settings - Inbound Rules and allow TCP 8787 manually.
) else (
  echo.
  echo   Port 8787 is now open for other computers on your network.
)
echo.
pause
