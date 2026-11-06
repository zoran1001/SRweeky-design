@echo off
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\AFTERSHOCK-sync.lnk');$s.TargetPath='%~dp0start-server.bat';$s.Arguments='--quiet';$s.WorkingDirectory='%~dp0';$s.WindowStyle=7;$s.Save()"

if errorlevel 1 (
  echo.
  echo   Failed. Do it manually:
  echo   1. Right-click start-server.bat - Send to - Desktop (create shortcut)
  echo   2. Press Win+R, type shell:startup, press Enter
  echo   3. Move the shortcut into that folder
  echo.
  pause
  exit /b 1
)

echo.
echo   Done. The server will start automatically after you log in.
echo   To undo: press Win+R, type shell:startup, delete AFTERSHOCK-sync.lnk
echo.
pause
