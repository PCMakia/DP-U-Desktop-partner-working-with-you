@echo off
title DP^&U
cd /d "%~dp0"
if exist "%~dp0DPU.exe" (
  start "" "%~dp0DPU.exe"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\08-start-companion.ps1"
if errorlevel 1 pause
