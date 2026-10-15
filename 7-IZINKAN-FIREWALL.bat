@echo off
title Izinkan Port 8080 di Windows Firewall
echo.
echo   ============================================================
echo    IZINKAN SERVER NGOBROL DI WINDOWS FIREWALL
echo   ============================================================
echo.
echo   Perlu ini kalau HP atau PC LAIN tidak bisa menyambung ke
echo   server yang jalan di PC ini.
echo.
echo   Akan muncul permintaan izin Administrator (klik "Yes").
echo.
echo   Tekan tombol apa saja untuk mulai...
pause >nul

netsh advfirewall firewall delete rule name="Ngobrol Chat 8080" >nul 2>nul
netsh advfirewall firewall add rule name="Ngobrol Chat 8080" dir=in action=allow protocol=TCP localport=8080 profile=private,domain

if errorlevel 1 goto gagal

echo.
echo   ============================================================
echo    SELESAI! Port 8080 sekarang terbuka untuk jaringan privat.
echo.
echo    Coba lagi sambung dari HP / PC lain.
echo   ============================================================
echo.
pause
exit /b 0

:gagal
echo.
echo   ============================================================
echo    GAGAL (mungkin tidak dijalankan sebagai Administrator).
echo.
echo    Cara manual:
echo      1. Klik Start, ketik "Windows Defender Firewall"
echo      2. Pilih "Allow an app through firewall"
echo      3. Klik "Change settings" -^> "Allow another app"
echo      4. Pilih node.exe, centang "Private"
echo   ============================================================
echo.
pause
exit /b 1
