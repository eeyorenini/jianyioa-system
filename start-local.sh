#!/bin/bash
# 建亿 OA 一键启动（nohup 版本，无需 PM2）
# 用法：bash start-local.sh start | stop | status | restart

set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.run-logs"
mkdir -p "$LOG_DIR"

start_one() {
  local name=$1; local cmd=$2; local cwd=$3; local logfile="$LOG_DIR/$name.log"
  if lsof -nP -iTCP:$4 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  ✅ $name (port $4) 已在跑"
    return
  fi
  cd "$cwd"
  nohup bash -c "$cmd" > "$logfile" 2>&1 &
  echo $! > "$LOG_DIR/$name.pid"
  echo "  🚀 $name 启动 PID=$(cat "$LOG_DIR/$name.pid")  日志: $logfile"
  cd "$ROOT"
}

stop_one() {
  local name=$1; local port=$2
  local pids=$(lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "  🛑 $name (port $port) 停止: $pids"
    echo "$pids" | xargs kill 2>/dev/null
  else
    echo "  · $name (port $port) 未跑"
  fi
  [ -f "$LOG_DIR/$name.pid" ] && rm -f "$LOG_DIR/$name.pid"
}

status_one() {
  local name=$1; local port=$2
  if lsof -nP -iTCP:$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    local pid=$(lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null | head -1)
    echo "  ✅ $name  port=$port  pid=$pid"
  else
    echo "  ❌ $name  port=$port  未运行"
  fi
}

case "${1:-status}" in
  start)
    echo "▶ 启动建亿 OA 三服务..."
    start_one "backend"  "node server.js"                      "$ROOT/server"           3002
    start_one "frontend" "npx vite --host 0.0.0.0 --port 5555"  "$ROOT/web"              5555
    start_one "mobile"   "npm run dev:h5"                      "$ROOT/jianyioa-app/mobile" 10086
    echo ""
    echo "🌐 入口："
    echo "   PC  后台：  http://127.0.0.1:3002/         （生产构建，无需 5555）"
    echo "   PC  dev:   http://127.0.0.1:5555/         （热更新）"
    echo "   Mobile:    http://127.0.0.1:10086/m/      （热更新）"
    echo "   日志：     $LOG_DIR/{backend,frontend,mobile}.log"
    ;;
  stop)
    echo "■ 停止建亿 OA 三服务..."
    stop_one "backend"  3002
    stop_one "frontend" 5555
    stop_one "mobile"   10086
    ;;
  restart)
    "$0" stop
    sleep 2
    "$0" start
    ;;
  status)
    echo "◇ 状态："
    status_one "backend"  3002
    status_one "frontend" 5555
    status_one "mobile"   10086
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac