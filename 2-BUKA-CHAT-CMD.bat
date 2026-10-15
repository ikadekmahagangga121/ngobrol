@echo off
title Ngobrol - Chat CMD
cd /d "%~dp0server"
echo ============================================
echo   NGOBROL - CHAT CMD
echo   Buka file ini 2x untuk 2 user berbeda.
echo   Pilih "Daftar" saat pertama kali.
echo   Ketik /sandi untuk ganti kata sandi.
echo ============================================
echo.
node cli.js
echo.
echo Tekan apa saja untuk menutup.
pause >nul
