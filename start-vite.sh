#!/bin/bash
# OA系统 Vite 启动脚本
# 清除过期缓存 →启动 Vite 开发服务器

VITE_DIR="/Users/gtamer/Desktop/test/oa-system/web"
VITE_CACHE="$VITE_DIR/node_modules/.vite"

# 清除过期缓存
if [ -d "$VITE_CACHE" ]; then
    rm -rf "$VITE_CACHE"
    echo "[$(date)] Vite cache cleared"
fi

# 启动 Vite
cd "$VITE_DIR"
nohup node node_modules/.bin/vite --host > ~/Desktop/test/oa-system/vite.log 2>&1 &
echo "[$(date)] Vite started (PID: $!)"