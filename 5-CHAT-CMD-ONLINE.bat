@echo off
title Chat Ngobrol (server online)
cd /d "%~dp0server"

echo.
echo   ============================================================
echo    CHAT NGOBROL - tersambung ke server online
echo   ============================================================
echo.
echo   Tempel alamat server Cloudflare-mu, lalu tekan Enter.
echo   Contoh: https://ngobrol-server.namamu.workers.dev
echo.
set /p ALAMAT=   Alamat server: 

if "%ALAMAT%"=="" (
  echo.
  echo   Alamat kosong. Membatalkan.
  pause
  exit /b 1
)

echo.
echo   Menyambung ke %ALAMAT% ...
echo.
node cli.js --server %ALAMAT%

echo.
echo   Chat berakhir.
pause
