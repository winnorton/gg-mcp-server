@echo off
echo.
echo  ⛳ Starting Garmin Golf Analytics...
echo.

:: Build first in case there were changes
call npm run build >nul 2>&1

:: Start the web server
echo  Opening http://localhost:4002 in your browser...
start http://localhost:4002
node dist/server.js --sse
