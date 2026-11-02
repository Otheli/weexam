@echo off
chcp 65001 >nul
title Memasang Weexam
echo Memasang Weexam...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Pasang-Weexam.ps1"
if errorlevel 1 goto gagal
exit /b 0
:gagal
echo.
echo Pemasangan belum berhasil. Baca BACA-SAYA.txt untuk cara lain.
pause
