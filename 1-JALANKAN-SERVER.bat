@echo off
title Ngobrol - SERVER
cd /d "%~dp0server"
echo ============================================
echo   SERVER CHAT NGOBROL
echo   Jendela ini HARUS dibiarkan terbuka.
echo   Catat alamat http://... yang muncul.
echo ============================================
echo.
npm.cmd start
echo.
echo Server berhenti. Tekan apa saja untuk menutup.
pause >nul
