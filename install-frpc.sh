#!/bin/bash
# 建亿 OA · 安装 frpc 客户端（macOS，无 sudo 版）
# 装到 ~/bin/frpc，并把 ecosystem.config.js 里 frpc 路径改为它
# 用法：bash install-frpc.sh

set -e

FRP_VERSION="0.61.1"
INSTALL_DIR="$HOME/bin"
FRPC_BIN="$INSTALL_DIR/frpc"
TARBALL="/tmp/frp_${FRP_VERSION}_darwin_amd64.tar.gz"

mkdir -p "$INSTALL_DIR"

# 1. 下载（如已装则跳过）
if [[ -x "$FRPC_BIN" ]] && "$FRPC_BIN" -v 2>/dev/null | grep -q "0.61.1"; then
  echo "▶ frpc 已存在且版本匹配：$("$FRPC_BIN" -v)"
else
  echo "▶ 下载 frp ${FRP_VERSION} darwin amd64 ..."
  curl -L -o "$TARBALL" "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_darwin_amd64.tar.gz"
  echo "▶ 解压并安装到 $FRPC_BIN ..."
  tar -xzf "$TARBALL" -C /tmp/
  mv "/tmp/frp_${FRP_VERSION}_darwin_amd64/frpc" "$FRPC_BIN"
  chmod +x "$FRPC_BIN"
  rm -rf "/tmp/frp_${FRP_VERSION}_darwin_amd64" "$TARBALL"
fi

echo "  ✅ frpc 版本: $("$FRPC_BIN" -v 2>&1 | head -1)"
echo "  ✅ 位置: $FRPC_BIN"

# 2. 把 PATH 永久化（zsh）
SHELL_RC="$HOME/.zshrc"
if ! grep -q "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# user bin (frpc 等)" >> "$SHELL_RC"
  echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$SHELL_RC"
  echo "  ✅ 已把 $INSTALL_DIR 加入 ~/.zshrc"
else
  echo "  · ~/.zshrc 已包含 $INSTALL_DIR"
fi

# 3. 更新 ecosystem.config.js 里 frpc 路径
ECO="$HOME/Desktop/jianyioa-system/ecosystem.config.js"
if grep -q "/usr/local/bin/frpc" "$ECO"; then
  # macOS sed 需要 -i ''
  sed -i '' "s|/usr/local/bin/frpc|$FRPC_BIN|g" "$ECO"
  # 同时改 enabled 判定路径
  sed -i '' "s|existsSync('/usr/local/bin/frpc')|existsSync('$FRPC_BIN')|g" "$ECO"
  echo "  ✅ ecosystem.config.js 已更新: /usr/local/bin/frpc → $FRPC_BIN"
else
  echo "  · ecosystem.config.js 已是新版路径"
fi

# 4. 提醒 frpc.ini 选哪个
echo ""
echo "════════════════════════════════════════"
echo " 接下来你需要做："
echo "════════════════════════════════════════"
echo ""
echo "1. 选对 frpc.ini（两个文件冲突）："
echo "   旧（端口已过期）：~/Desktop/jianyioa-system/frpc.ini"
echo "   新（端口和文档对）：~/Desktop/jianyioa-system/jianyioa-app/mobile/frpc.ini"
echo "   建议：删掉旧的那个"
echo "     rm ~/Desktop/jianyioa-system/frpc.ini"
echo ""

echo "2. 重启 PM2 让 frpc 生效："
echo "     cd ~/Desktop/jianyioa-system"
echo "     pm2 delete all"
echo "     pm2 start ecosystem.config.js"
echo "     pm2 save"
echo ""

echo "3. 验证 frpc 在 PM2 里："
echo "     pm2 ls   (应该看到 4 行 online：backend/frontend/mobile/frpc)"
echo "     pm2 logs jianyioa-frpc   (应看到 'start proxy success' 类似字样)"
echo ""

echo "4. 测试外网访问："
echo "   你的域名/端口（来自 mobile/frpc.ini）："
echo "     移动生产：116.204.19.53:7780    → 本机 3002 /m/"
echo "     移动 dev：116.204.19.53:7779    → 本机 10086/m/"
echo "     PC dev：  116.204.19.53:35189   → 本机 5555"
echo "     后端 API：116.204.19.53:7002    → 本机 3002"
echo ""