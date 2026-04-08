@echo off
chcp 65001 >nul
echo ========================================
echo 辩论棋钟 - 一键启动
echo ========================================
echo.

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js！
    echo.
    choice /c YN /n /m "是否现在自动安装 Node.js LTS? (Y/N): "
    if errorlevel 2 (
        echo 请先安装 Node.js: https://nodejs.org/
        start "" "https://nodejs.org/"
        pause
        exit /b 1
    )

    where winget >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 未检测到 winget，无法自动安装。
        echo 请先手动安装 Node.js: https://nodejs.org/
        start "" "https://nodejs.org/"
        pause
        exit /b 1
    )

    echo [信息] 正在使用 winget 安装 Node.js LTS...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] Node.js 自动安装失败！
        echo 请手动安装 Node.js: https://nodejs.org/
        start "" "https://nodejs.org/"
        pause
        exit /b 1
    )

    set "PATH=%PATH%;C:\Program Files\nodejs"
    where node >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 已完成安装但仍未检测到 Node.js。
        echo 请关闭此窗口并重新运行本启动脚本。
        pause
        exit /b 1
    )
)

echo [信息] Node.js 已安装
node --version
echo.

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 npm，无法继续。
    echo 请重新安装 Node.js: https://nodejs.org/
    start "" "https://nodejs.org/"
    pause
    exit /b 1
)

:: 检查是否已安装依赖
if not exist "node_modules" (
    echo [信息] 检测到尚未安装依赖，正在自动安装...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败！
        pause
        exit /b 1
    )
    echo.
    echo [成功] 依赖安装完成！
    echo.
) else (
    echo [信息] 依赖已存在，跳过安装步骤
    echo.
)

:: 启动开发服务器
echo [信息] 正在启动开发服务器...
echo.
echo ========================================
echo 服务启动后，请在浏览器中访问:
echo http://localhost:5173
echo ========================================
echo.
echo 按 Ctrl+C 可停止服务器
echo.

call npm run dev

pause
