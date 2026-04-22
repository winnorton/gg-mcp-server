@echo off
echo.
echo  ⛳ Garmin Golf Analytics - Setup
echo  ================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  ❌ Node.js is not installed!
    echo     Download it from: https://nodejs.org
    echo     Install the LTS version, then run this script again.
    echo.
    pause
    exit /b 1
)

echo  ✅ Node.js found
echo.
echo  Installing dependencies...
call npm install
echo.

echo  Building the server...
call npm run build
echo.

echo  ✅ Setup complete!
echo.
echo  ============================================
echo   To start the web dashboard:
echo     start.bat
echo.
echo   To use with Gemini CLI or Claude Desktop,
echo   see the README.md for configuration.
echo  ============================================
echo.
pause
