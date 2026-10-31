@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install LTS from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo [1/2] Installing dependencies...
call npm install
if errorlevel 1 goto fail

echo [2/2] Building app...
call npm run build
if errorlevel 1 goto fail

echo.
echo DONE! Look in the "dist" folder:
echo   SoundCloud-portable.exe  - run without installing
echo   SoundCloud Setup *.exe   - installer with desktop shortcut
start "" "%~dp0dist"
pause
exit /b 0

:fail
echo.
echo ERROR - send a screenshot of this window.
pause
exit /b 1
