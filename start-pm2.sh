#!/bin/bash
# 建亿 OA · PM2 切换脚本（把 nohup 服务换成 PM2 看门狗）
# 用法：bash start-pm2.sh install | start | stop | restart | status | logs | save | startup

set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PM2_PATH="/Users/gtamer/.nvm/versions/node/v24.21.0/bin/pm2"

# 1. 装 PM2（如未装）
ensure_pm2() {
  if [ ! -x "$PM2_PATH" ]; then
    echo "▶ 装 pm2 (全局)..."
    npm install -g pm2
  fi
  echo "  ✅ pm2: $($PM2_PATH -v)"
}

# 2. 停掉 nohup 起的服务（端口冲突）
stop_nohup() {
  echo "▶ 停掉 nohup 占用的端口..."
  for p in 3002 5555 10086; do
    pids=$(lsof -nP -iTCP:$p -sTCP:LISTEN -t 2>/dev/null)
    [ -n "$pids" ] && echo "  · kill port $p: $pids" && echo "$pids" | xargs kill 2>/dev/null
  done
  sleep 2
}

# 3. 启动 PM2
start_pm2() {
  $PM2_PATH start ecosystem.config.js
  $PM2_PATH save
  echo ""
  echo "✓ PM2 已启动。要开机自启，请执行："
  echo "    bash $0 startup"
}

cmd="${1:-help}"
case "$cmd" in
  install)
    ensure_pm2
    stop_nohup
    # 如果之前 PM2 已有同名进程，先删
    $PM2_PATH delete all 2>/dev/null || true
    start_pm2
    ;;
  start)
    ensure_pm2
    stop_nohup
    start_pm2
    ;;
  stop)
    $PM2_PATH stop all 2>/dev/null || true
    echo "  ✓ pm2 stop all"
    ;;
  restart)
    $PM2_PATH restart all
    ;;
  reload|reloader|reload)
    $PM2_PATH reload all
    ;;
  status)
    $PM2_PATH ls
    ;;
  logs)
    $PM2_PATH logs --lines 80
    ;;
  save)
    $PM2_PATH save
    echo "  ✓ pm2 save (快照当前进程列表，开机自启需配合 startup)"
    ;;
  startup)
    $PM2_PATH startup
    echo ""
    echo "↑ 把上面输出的 'sudo xxx' 那条命令复制执行一次，即可开机自启"
    ;;
  delete)
    $PM2_PATH delete all
    ;;
  help|*)
    echo "用法: $0 {install|start|stop|restart|status|logs|save|startup|delete}"
    echo ""
    echo "  install  首次切换：装 PM2 + 停 nohup + 拉起三服务"
    echo "  start    后续启动"
    echo "  stop     全停"
    echo "  restart  重启所有服务"
    echo "  status   看 PM2 状态"
    echo "  logs     看实时日志"
    echo "  save     保存当前进程列表"
    echo "  startup  生成开机自启命令"
    exit 1
    ;;
esac