@echo off
title Perbaiki workerd (Visual C++ Redistributable)
echo.
echo   ============================================================
echo    PERBAIKI "Error: write EOF"
echo   ============================================================
echo.
echo   wrangler dev / Miniflare butuh "Microsoft Visual C++
echo   Redistributable (x64)" supaya mesin workerd bisa jalan.
echo.
echo   Skrip ini akan mengunduh dan memasangnya dari situs resmi
echo   Microsoft. Akan muncul permintaan izin Administrator
echo   (klik "Yes"), lalu tunggu sampai selesai.
echo.
echo   Catatan: ini TIDAK diperlukan untuk deploy ke Cloudflare,
echo   hanya untuk menjalankan server uji di komputer sendiri.
echo.
echo   Tekan tombol apa saja untuk mulai...
pause >nul

set "VC=%TEMP%\vc_redist.x64.exe"

echo.
echo   [1/2] Mengunduh...
curl.exe -L --fail -o "%VC%" https://aka.ms/vs/17/release/vc_redist.x64.exe
if errorlevel 1 goto gagal

echo.
echo   [2/2] Memasang (butuh izin Administrator)...
"%VC%" /install /quiet /norestart
if errorlevel 1 goto gagal

echo.
echo   ============================================================
echo    SELESAI! Silakan coba lagi uji lokalnya:
echo      cd cloudflare
echo      npm run dev
echo   ============================================================
echo.
pause
exit /b 0

:gagal
echo.
echo   ============================================================
echo    GAGAL memasang otomatis.
echo.
echo    Unduh manual dari:
echo      https://aka.ms/vs/17/release/vc_redist.x64.exe
echo    lalu jalankan file itu dan klik Install.
echo   ============================================================
echo.
pause
exit /b 1
