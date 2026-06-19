@echo off
setlocal

title Taranga+ (তরঙ্গ+) - Electron App
cd /d "%~dp0\.."

echo.
echo ========================================
echo   Taranga+ (তরঙ্গ+) - Electron App
echo ========================================
echo.
echo   Version: 2.0.0
echo   Platform: Windows Desktop (Electron)
echo   Channels: 551+ validated
echo.
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Please install from: https://nodejs.org
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed.
  echo Please reinstall Node.js.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] First time setup - Installing dependencies...
  echo This may take 1-2 minutes.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency install failed.
    pause
    exit /b 1
  )
  echo.
  echo [SUCCESS] Dependencies installed!
  echo.
)

echo [INFO] Building Electron app...
echo.
call npm run build:electron
if errorlevel 1 (
  echo.
  echo [ERROR] Electron build failed.
  pause
  exit /b 1
)

echo [SUCCESS] Build complete!
echo.
echo [INFO] Starting Taranga+ in Electron window...
echo [INFO] App will open in a new window.
echo [INFO] Close the window to stop the app.
echo.

call npm run dev:electron

echo.
echo [INFO] Taranga+ stopped.
pause
