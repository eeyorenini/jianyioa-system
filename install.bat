@echo off
chcp 65001 > nul
echo ====================================
echo   建亿OA系统 v1.0.1 一键安装脚本
echo ====================================
echo.

REM 切到脚本所在目录
cd /d "%~dp0"

echo [1/4] 检查 Node.js 环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo     Node 版本: %%v

echo.
echo [2/4] 安装后端依赖（server/）...
cd /d "%~dp0server"
call npm install --legacy-peer-deps
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo     依赖安装完成

echo.
echo [3/4] 检查 .env 配置...
if not exist ".env" (
    echo [警告] .env 文件不存在，创建默认配置...
    (
        echo DB_HOST=116.204.19.53
        echo DB_PORT=3306
        echo DB_USER=jianyioa
        echo DB_PASSWORD=zpfbAsxyA76P2ZHw
        echo DB_NAME=jianyioa
        echo DB_POOL_LIMIT=10
        echo PORT=3001
    ) > .env
    echo     已创建默认 .env，请检查密码是否正确
)

echo.
echo [4/4] 验证 dist 是否存在...
if not exist "..\web\dist\index.html" (
    echo [错误] 缺少前端 dist 目录，请确认 web\dist\ 存在
    pause
    exit /b 1
)
echo     前端 dist 存在

echo.
echo ====================================
echo   安装完成！
echo ====================================
echo.
echo 启动方式（二选一）：
echo   A. 在宝塔里设置：项目目录 = 此目录的 server 子目录，启动选项 = start
echo   B. 手动启动：在 server 目录执行 npm start
echo.
echo ⚠ 重要：如果连接 MySQL 报错 Host not allowed，
echo    请到 phpMyAdmin 用 root 账号执行：
echo.
echo    CREATE USER 'jianyioa'@'%%' IDENTIFIED BY 'zpfbAsxyA76P2ZHw';
echo    GRANT ALL PRIVILEGES ON jianyioa.* TO 'jianyioa'@'%%';
echo    FLUSH PRIVILEGES;
echo.
pause
