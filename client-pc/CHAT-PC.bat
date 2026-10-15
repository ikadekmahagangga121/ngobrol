@echo off
title Ngobrol - Chat dari PC ini
cd /d "%~dp0"

rem Bisa langsung:  CHAT-PC.bat http://192.168.1.4:8080
if not "%~1"=="" set "ALAMAT=%~1"

if "%ALAMAT%"=="" (
  echo.
  echo   ============================================================
  echo    NGOBROL - CHAT DARI PC INI
  echo   ============================================================
  echo.
  echo   Tempel ALAMAT SERVER, lalu tekan Enter.
  echo.
  echo     Server di PC ini sendiri   : http://127.0.0.1:8080
  echo     Server di PC lain (1 WiFi) : http://192.168.1.4:8080
  echo     Server online (Cloudflare) : https://ngobrol-server.namamu.workers.dev
  echo.
  echo   (Alamat LAN tertera di jendela server saat dijalankan)
  echo.
  set /p ALAMAT=   Alamat server: 
)

if "%ALAMAT%"=="" (
  echo.
  echo   Alamat kosong. Dibatalkan.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 goto tanpanode

echo.
echo   Menyambung ke %ALAMAT% ...
echo.
node "%~dp0cli.js" --server "%ALAMAT%"
echo.
echo   Chat berakhir.
pause
exit /b 0

:tanpanode
echo.
echo   ============================================================
echo    Node.js BELUM terpasang di PC ini.
echo.
echo    1. Buka https://nodejs.org
echo    2. Unduh versi "LTS" untuk Windows, install (Next terus).
echo    3. Jalankan lagi file CHAT-PC.bat ini.
echo   ============================================================
echo.
pause
exit /b 1
