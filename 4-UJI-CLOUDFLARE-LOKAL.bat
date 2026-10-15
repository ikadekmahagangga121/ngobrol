@echo off
title Uji Server Ngobrol (Cloudflare, lokal)
cd /d "%~dp0cloudflare"

echo.
echo   ============================================================
echo    UJI SERVER CLOUDFLARE (mode lokal, belum online)
echo   ============================================================
echo.
echo   Server akan jalan di http://127.0.0.1:8787
echo.
echo   Buka jendela baru lalu jalankan:
echo      cd cloudflare ^&^& node test/simulate.js
echo.
echo   Tutup jendela ini untuk mematikan server.
echo   ============================================================
echo.

call npx wrangler dev --port 8787
pause
