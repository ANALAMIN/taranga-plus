@echo off
cd /d "%~dp0"
title Taranga+

echo Starting Vite...
start /b npm run dev:web >nul 2>&1

:wait
timeout /t 1 /nobreak >nul
curl -s http://localhost:1420 >nul 2>&1
if errorlevel 1 goto wait

echo Launching Taranga+...
start /b dotnet run --project backend >nul 2>&1

echo Taranga+ is running. Close this window to stop.
pause >nul
taskkill /f /im TarangaPlus.exe >nul 2>&1
exit
