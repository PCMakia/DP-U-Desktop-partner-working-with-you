@echo off
title ALICE
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\08-start-companion.ps1"
if errorlevel 1 pause
