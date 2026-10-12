#!/bin/bash
# 建亿 OA · PM2 开机自启配置（macOS launchd，无需 sudo）
# 创建 ~/Library/LaunchAgents/com.PM2.plist 并 load -w
# 用法：bash setup-pm2-autostart.sh

set -e

# 探测 pm2/node 路径（兼容 nvm / brew / 手工安装 场景）
detect_bin() {
  local name="$1"
  if [ -n "${!name}" ]; then echo "${!name}"; return; fi
  if [ -x "$HOME/.nvm/versions/node/$(node -v 2>/dev/null | sed 's/^v//')/bin/$name" ]; then
    echo "$HOME/.nvm/versions/node/$(node -v 2>/dev/null | sed 's/^v//')/bin/$name"
    return
  fi
  if [ -x "/usr/local/bin/$name" ]; then echo "/usr/local/bin/$name"; return; fi
  command -v "$name" 2>/dev/null || which "$name" 2>/dev/null
}

USER_NAME=$(whoami)
PM2_BIN="$(detect_bin pm2)"
NODE_BIN_DIR="$(dirname "$PM2_BIN")"
HOME_DIR="$HOME"
PM2_HOME="$HOME/.pm2"
PLIST="$HOME/Library/LaunchAgents/com.PM2.plist"

if [ -z "$PM2_BIN" ] || [ ! -x "$PM2_BIN" ]; then
  echo "❌ 找不到 pm2 二进制，请先 npm i -g pm2 或手工安装"
  exit 1
fi

echo "  pm2: $PM2_BIN"

# 1. 先确保 dump.pm2 是最新的（开机按它恢复）
echo "▶ pm2 save (固化当前进程列表)..."
"$PM2_BIN" save

# 2. 生成 plist
mkdir -p "$HOME/Library/LaunchAgents"
echo "▶ 生成 $PLIST ..."
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.PM2</string>
    <key>UserName</key>
    <string>${USER_NAME}</string>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/sh</string>
      <string>-c</string>
      <string>${PM2_BIN} resurrect</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>OnDemand</key>
    <false/>
    <key>LaunchOnlyOnce</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${NODE_BIN_DIR}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
      <key>PM2_HOME</key>
      <string>${PM2_HOME}</string>
      <key>NVM_DIR</key>
      <string>${NVM_DIR}</string>
    </dict>
    <key>StandardErrorPath</key>
    <string>/tmp/com.PM2.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/com.PM2.out</string>
  </dict>
</plist>
EOF

# 3. 加载（-w 写入 launchd 持久化）
echo "▶ launchctl load -w ..."
# 先卸载旧的（如果有）
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

echo ""
echo "════════════════════════════════════════"
echo " ✅ 开机自启已配置"
echo "════════════════════════════════════════"
echo ""
echo "plist 位置: $PLIST"
echo "日志:       /tmp/com.PM2.out /tmp/com.PM2.err"
echo ""
echo "验证："
echo "  launchctl list | grep PM2        # 看 launchd 是否接管"
echo "  plutil -lint $PLIST              # plist 语法检查"
echo ""
echo "取消开机自启："
echo "  launchctl unload $PLIST"
echo "  rm $PLIST"
echo ""
echo "下次开机后会自动："
echo "  1. launchd 启动 pm2"
echo "  2. pm2 resurrect 读 ~/.pm2/dump.pm2"
echo "  3. jianyioa-backend / frontend / mobile / frpc 全部拉起"