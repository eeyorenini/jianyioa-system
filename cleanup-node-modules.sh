#!/bin/bash
# 建亿 OA · node_modules 一键清理（释放 760MB+）
# ⚠️ 此操作会停掉所有 PM2 服务 5-15 分钟（重新 npm install）
# 用法：bash cleanup-node-modules.sh

set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# 1. 看现状
echo "▶ 当前 node_modules 占用："
for d in server/node_modules web/node_modules jianyioa-app/mobile/node_modules node_modules; do
  if [ -d "$d" ]; then
    size=$(du -sh "$d" 2>/dev/null | awk '{print $1}')
    files=$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')
    printf "   %-40s %6s  (%s 个文件)\n" "$d" "$size" "$files"
  fi
done
echo ""

# 2. 估算节省
total_before=$(du -sh server/node_modules web/node_modules jianyioa-app/mobile/node_modules node_modules 2>/dev/null | awk '{sum+=$1} END {print sum}')
echo "  共 ~${total_before}MB，清理后预计节省 750MB+"
echo ""

# 3. 停服务
echo "▶ 停 PM2 服务（会中断服务 5-15 分钟）..."
"$NVM_DIR/versions/node/v24.21.0/bin/pm2" stop all 2>/dev/null || true
"$NVM_DIR/versions/node/v24.21.0/bin/pm2" delete all 2>/dev/null || true
sleep 2

# 4. 移到回收站（用 mavis-trash，可恢复）
echo "▶ 移到回收站..."
mavis-trash server/node_modules web/node_modules jianyioa-app/mobile/node_modules node_modules 2>&1 | tail -5

# 5. 重新装依赖
echo ""
echo "▶ 重装 server 依赖（~2-3 分钟）..."
cd "$ROOT/server"
npm install --legacy-peer-deps 2>&1 | tail -3

echo ""
echo "▶ 重装 web 依赖（~2-3 分钟）..."
cd "$ROOT/web"
npm install --legacy-peer-deps 2>&1 | tail -3

echo ""
echo "▶ 重装 mobile 依赖（~3-5 分钟）..."
cd "$ROOT/jianyioa-app/mobile"
npm install --legacy-peer-deps 2>&1 | tail -3

# 6. 重新拉起 PM2
echo ""
echo "▶ 重启 PM2 服务..."
cd "$ROOT"
"$NVM_DIR/versions/node/v24.21.0/bin/pm2" start ecosystem.config.js
"$NVM_DIR/versions/node/v24.21.0/bin/pm2" save

echo ""
echo "✓ 完成！新 node_modules 总占用："
for d in server/node_modules web/node_modules jianyioa-app/mobile/node_modules node_modules; do
  if [ -d "$d" ]; then
    size=$(du -sh "$d" 2>/dev/null | awk '{print $1}')
    printf "   %-40s %6s\n" "$d" "$size"
  fi
done
echo ""
echo "  验证：curl http://127.0.0.1:3002/  应该能打开 PC 后台"