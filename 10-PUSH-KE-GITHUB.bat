@echo off
setlocal
title Ngobrol - Unggah proyek ke GitHub
cd /d "%~dp0"

echo.
echo   ============================================================
echo    UNGGAH PROYEK KE GITHUB
echo   ============================================================
echo.
echo   Seluruh kode proyek ini disimpan ke GitHub sebagai repository
echo   PRIVAT - hanya Anda yang bisa melihatnya.
echo.
echo   Teman tetap bisa mengambil cli.js lewat gist Anda
echo   (yang publik itu hanya cli.js, bukan seluruh kodenya).
echo.
echo   Butuh "token" GitHub (gratis, sekali saja):
echo     1. Buka   https://github.com/settings/tokens/new
echo     2. Isi nama bebas, mis.  ngobrol-push
echo     3. Centang kotak  [x] repo   ^(harus "repo", bukan cuma "gist"^)
echo     4. Klik   Generate token   lalu salin tokennya
echo.
echo   Token hanya dipakai selama jendela ini terbuka (tidak disimpan).
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
echo   Sifat repository:
echo     1 = privat  (hanya Anda)      - disarankan
echo     2 = publik  (siapa pun bisa lihat)
set /p JENIS=   Ketik 1 atau 2 lalu Enter (Enter = 1): 

set GITHUB_TOKEN=%TOKEN%
if "%JENIS%"=="2" (
  node tools/push-github.js --nama ngobrol --publik
) else (
  node tools/push-github.js --nama ngobrol
)

echo.
pause
