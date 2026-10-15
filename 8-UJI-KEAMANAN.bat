@echo off
title Ngobrol - Uji Server
cd /d "%~dp0server"

echo.
echo   ============================================================
echo    UJI SERVER (KEAMANAN + PESAN SAAT OFFLINE)
echo   ============================================================
echo.
echo   Pemeriksaan otomatis:
echo     - batas percobaan login ^& pendaftaran akun
echo     - ganti kata sandi ^& token kedaluwarsa
echo     - anti-spam pesan ^& batas panjang pesan
echo     - header pengaman respons
echo     - pesan tetap sampai saat penerima sedang offline
echo.
echo   Server uji dijalankan sendiri - tidak perlu server lain.
echo   ============================================================
echo.

set GAGAL=0

node test/keamanan.js
if errorlevel 1 set GAGAL=1
echo.

node test/offline.js
if errorlevel 1 set GAGAL=1
echo.

if "%GAGAL%"=="1" (
  echo   >>> Ada uji yang GAGAL. Lihat tanda X di atas.
) else (
  echo   >>> Semua uji LULUS.
)
echo.
pause
