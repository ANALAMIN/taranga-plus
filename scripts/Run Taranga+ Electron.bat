@echo off
setlocal

title Taranga+ Electron
cd /d "%~dp0\.."

echo.
echo ========================================
echo   Taranga+ (তরঙ্গ+) - Electron Dev Launcher
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available in PATH.
  echo Please install Node.js LTS, then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or not available in PATH.
  echo Please reinstall Node.js LTS, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing project dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

echo Starting Taranga+ Electron app...
echo Keep this window open while testing. Press Ctrl+C here to stop.
echo.

call npm run dev

echo.
echo App stopped.
pause
