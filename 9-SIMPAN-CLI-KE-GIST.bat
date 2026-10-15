@echo off
setlocal
title Ngobrol - Simpan cli.js ke GitHub Gist
cd /d "%~dp0"

echo.
echo   ============================================================
echo    SIMPAN cli.js KE GITHUB GIST
echo   ============================================================
echo.
echo   Agar klien terminal (cli.js) bisa diunduh siapa saja lewat
echo   satu link - tanpa Anda kirim file, dan tanpa server Anda hidup.
echo.
echo   Butuh "token" GitHub SEKALI SAJA (gratis, sekitar 1 menit):
echo     1. Buka   https://github.com/settings/tokens/new
echo     2. Isi nama bebas, centang kotak  [x] gist
echo     3. Klik    Generate token  lalu salin tokennya
echo.
echo   Token ini hanya dipakai selama jendela ini terbuka
echo   (tidak disimpan ke file).
echo.
set /p TOKEN=   Tempel token GitHub di sini lalu Enter: 

if "%TOKEN%"=="" (
  echo.
  echo   Token kosong - dibatalkan.
  echo.
  pause
  exit /b 1
)

echo.
echo   Pilih jenis gist:
echo     1 = rahasia / unlisted  (hanya yang punya link) - disarankan
echo     2 = publik               (bisa ditemukan orang lain)
set /p JENIS=   Ketik 1 atau 2 lalu Enter (Enter = 1): 

set GITHUB_TOKEN=%TOKEN%
if "%JENIS%"=="2" (
  node tools/push-gist.js --publik
) else (
  node tools/push-gist.js
)

echo.
pause
