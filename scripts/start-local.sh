#!/usr/bin/env bash
# ================================================================
# 本地开发服务启停（端口 3002：API + PC + H5 /m/ 同一入口）
# ----------------------------------------------------------------
#   ./scripts/start-local.sh           前台启动，Ctrl+C 停止（推荐，日志直接看）
#   ./scripts/start-local.sh -d        后台启动，日志写 /tmp/jianyioa-3002.log
#   ./scripts/start-local.sh stop      停止
#   ./scripts/start-local.sh restart   重启（会 kill 掉端口上的旧进程）
#   ./scripts/start-local.sh status    看状态
#
# 为什么要有这个脚本
# ----------------------------------------------------------------
# 1. 重复启动时若端口没释放，node 抛 EADDRINUSE 后**静默退出**，表现为
#    「改了代码但接口还是旧的」，极易误判成代码 bug。脚本先查端口再说。
# 2. 进程号不能用 `$!` —— 拿到的是子 shell 的 PID，不是 node 的。
#    一律以 `lsof -nP -iTCP:3002 -sTCP:LISTEN -t` 为准。
# 3. 必须 cd 到 server/ 再启动：server.js 按相对路径读 .env 和
#    ./api/*、./lib/*，在项目根目录跑会找不到。
#
# node 版本：优先用本机固定的 22.x 二进制，可用 NODE_BIN=... 覆盖。
# ================================================================
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
PORT="${PORT:-3002}"
LOG="${LOG:-/tmp/jianyioa-3002.log}"

if [ -n "${NODE_BIN:-}" ]; then
  :
elif [ -x "/Users/gtamer/.workbuddy/binaries/node/versions/22.22.2-6/bin/node" ]; then
  NODE_BIN="/Users/gtamer/.workbuddy/binaries/node/versions/22.22.2-6/bin/node"
else
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "${NODE_BIN:-}" ] || [ ! -x "$NODE_BIN" ]; then
  echo "✗ 找不到 node，可用 NODE_BIN=/path/to/node 指定" >&2
  exit 1
fi

pid_on_port() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1; }
port_busy()  { [ -n "$(pid_on_port)" ]; }

do_status() {
  local pid; pid="$(pid_on_port)"
  if [ -z "$pid" ]; then
    echo "● 未运行（端口 $PORT 空闲）"
    return 1
  fi
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 5 "http://127.0.0.1:$PORT/" 2>/dev/null)"
  echo "● 运行中  PID=$pid  端口=$PORT  首页 HTTP ${code:-000}"
  echo "  PC   http://127.0.0.1:$PORT/"
  echo "  H5   http://127.0.0.1:$PORT/m/"
  local ip; ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  [ -n "$ip" ] && echo "  局域网 http://$ip:$PORT/  （手机/小程序联调用）"
  return 0
}

do_stop() {
  local pid; pid="$(pid_on_port)"
  if [ -z "$pid" ]; then
    echo "· 本来就没在跑（端口 $PORT 空闲）"
    return 0
  fi
  echo "· kill $pid"
  kill "$pid" 2>/dev/null
  for _ in $(seq 1 20); do
    port_busy || { echo "✓ 已停止，端口已释放"; return 0; }
    sleep 0.5
  done
  echo "⚠ 进程没响应 TERM，强杀"
  kill -9 "$pid" 2>/dev/null
  sleep 1
  if port_busy; then
    echo "✗ 端口 $PORT 仍被占用：" >&2
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
    return 1
  fi
  echo "✓ 已强制停止"
}

wait_ready() {
  echo -n "· 等待就绪 "
  for _ in $(seq 1 40); do
    if ! port_busy; then continue; fi
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null)"
    if [ "$code" = "200" ]; then
      echo " ✓"
      do_status
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo " ✗"
  echo "✗ 40 秒内没起来，看日志：$LOG" >&2
  [ -f "$LOG" ] && tail -30 "$LOG" >&2
  return 1
}

do_start() {
  local background="${1:-0}"

  if port_busy; then
    local pid; pid="$(pid_on_port)"
    echo "✗ 端口 $PORT 已被 PID $pid 占用：" >&2
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
    echo "  要重启的话用：$0 restart" >&2
    return 1
  fi

  if [ ! -f "$SERVER_DIR/server.js" ]; then
    echo "✗ 找不到 $SERVER_DIR/server.js" >&2
    return 1
  fi

  if [ "$background" = "1" ]; then
    cd "$SERVER_DIR" || return 1
    nohup "$NODE_BIN" server.js > "$LOG" 2>&1 < /dev/null &
    echo "· 已后台启动，日志 $LOG"
    wait_ready
    return $?
  fi

  echo "· 前台启动（Ctrl+C 停止）  日志同时写入 $LOG"
  echo "  PC http://127.0.0.1:$PORT/    H5 http://127.0.0.1:$PORT/m/"
  echo
  cd "$SERVER_DIR" || return 1
  "$NODE_BIN" server.js 2>&1 | tee "$LOG"
}

case "${1:-start}" in
  status)   do_status ;;
  stop)     do_stop ;;
  restart)  do_stop && sleep 1 && do_start 1 ;;
  -d|--daemon|bg) do_start 1 ;;
  start|"") do_start 0 ;;
  -h|--help|help)
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "未知参数：$1（试试 help）" >&2
    exit 2
    ;;
esac
