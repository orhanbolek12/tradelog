@echo off
title TradeLog Dashboard
cd /d "%~dp0"
echo.
echo   Starting TradeLog Dashboard...
echo   http://localhost:5003
echo.
start "" http://localhost:5003
node server.js
