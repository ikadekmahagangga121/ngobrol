@echo off
title Deploy Server Ngobrol ke Cloudflare
cd /d "%~dp0cloudflare"

echo.
echo   ============================================================
echo    DEPLOY SERVER NGOBROL KE CLOUDFLARE
echo    Gratis selamanya - tanpa kartu kredit
echo   ============================================================
echo.
echo   Langkah:
echo     1. Browser akan terbuka untuk login Cloudflare.
echo     2. Belum punya akun? Daftar gratis (cukup email).
echo     3. Klik "Allow".
echo     4. Tunggu sampai muncul alamat "https://...workers.dev".
echo.
echo   Tekan tombol apa saja untuk mulai...
pause >nul

echo.
echo   [1/2] Login ke Cloudflare...
call npx wrangler login
if errorlevel 1 goto gagal

echo.
echo   [2/2] Mengirim server ke Cloudflare...
call npx wrangler deploy
if errorlevel 1 goto gagal

echo.
echo   ============================================================
echo    SELESAI!
echo.
echo    Salin alamat "https://...workers.dev" di atas ke kolom
echo    "Alamat server" pada aplikasi Ngobrol (Android / CMD / Termux).
echo.
echo    Contoh: https://ngobrol-server.namamu.workers.dev
echo   ============================================================
echo.
pause
exit /b 0

:gagal
echo.
echo   ============================================================
echo    GAGAL. Periksa pesan kesalahan di atas.
echo.
echo    Kalau masalahnya "install-scripts" atau "approve", jalankan
echo    perintah berikut di folder cloudflare:
echo      npm install-scripts approve esbuild workerd
echo      npm install
echo   ============================================================
echo.
pause
exit /b 1
