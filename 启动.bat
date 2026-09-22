@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Debate Clock - Start Dev Environment
echo ========================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js was not found.
    echo Install Node.js first: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm was not found.
    echo Reinstall Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo [INFO] Node.js version:
node --version
echo.

if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

if not exist ".dev.vars" (
    echo [WARN] .dev.vars not found. Copying from .dev.vars.example
    copy /y ".dev.vars.example" ".dev.vars" >nul
    echo [WARN] Please edit .dev.vars and set HOST_ADMIN_PASSWORD / ADMIN_SESSION_SECRET
    echo.
)

echo [INFO] Applying local D1 migrations (accounts database)...
set CI=true
call npx wrangler d1 migrations apply DB --local
set CI=
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to apply local D1 migrations.
    pause
    exit /b 1
)
echo.

echo [INFO] Starting local Worker API on http://127.0.0.1:8787
start "Debate Clock Worker" cmd /k "cd /d ""%~dp0"" && npm run dev:worker"
timeout /t 3 /nobreak >nul

echo [INFO] Starting frontend on http://localhost:5173
echo Open this URL in your browser:
echo http://localhost:5173
echo.
echo Frontend runs in this window.
echo Worker API runs in the extra window.
echo.
echo Tip: with no email provider configured, verification codes are printed
echo      in the Worker window and readable at http://127.0.0.1:8787/api/dev/outbox
echo.

call npm run dev

pause
