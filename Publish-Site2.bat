@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publish-Site2.ps1" %*
if errorlevel 1 (
  echo.
  echo Publish FAILED.
  pause
  exit /b 1
)
echo.
pause
