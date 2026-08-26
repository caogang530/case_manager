#!/usr/bin/env bash
# 本地一键启动前后端服务:后端 FastAPI(8000) + 前端 Vite(5173)
# 用法:
#   ./start.sh        启动前后端(Ctrl+C 停止)
#   ./start.sh stop   清理本项目残留的前后端进程(含手动启动后未退出的)
# 兼容 POSIX sh:`sh start.sh` / `bash start.sh` / `./start.sh` 均可运行
set -eu

# 项目根目录(脚本所在目录)
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_PID=""
FRONTEND_PID=""

info()  { printf '\033[1;32m[启动]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[提示]\033[0m %s\n' "$*"; }
error() { printf '\033[1;31m[错误]\033[0m %s\n' "$*"; }

# 列出监听指定端口的 PID(依赖 lsof)
port_pids() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true
  fi
}

# 判断进程是否属于本项目的前后端(vite/esbuild/uvicorn/server.main)
is_project_server() {
  local cmd
  cmd="$(ps -p "$1" -o command= 2>/dev/null || true)"
  case "$cmd" in *"$ROOT_DIR"*) ;; *) return 1 ;; esac
  case "$cmd" in
    *vite*|*esbuild*|*uvicorn*|*server.main*) return 0 ;;
  esac
  return 1
}

# 收集本项目残留的前后端进程 PID(去重)
collect_project_pids() {
  (
    local port
    for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
      port_pids "$port"
    done
    if command -v pgrep >/dev/null 2>&1; then
      pgrep -f "$ROOT_DIR" 2>/dev/null | while IFS= read -r pid; do
        [ -n "$pid" ] && is_project_server "$pid" && echo "$pid"
      done
    fi
  ) | sort -u
}

# stop 模式:清理残留进程
stop() {
  local pids pid
  pids="$(collect_project_pids)"
  if [ -z "$pids" ]; then
    info "没有发现本项目的前后端进程。"
    return 0
  fi
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      pkill -P "$pid" 2>/dev/null || true   # 先清理子进程(如 vite 的 esbuild)
      kill "$pid" 2>/dev/null && info "已停止 PID ${pid}"
    fi
  done
  sleep 1
  local port leftover
  for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    leftover="$(port_pids "$port")"
    if [ -n "$leftover" ]; then
      warn "端口 ${port} 仍被占用:PID ${leftover}"
    fi
  done
  info "清理完成。"
}

# 参数分发:./start.sh stop
if [ "${1:-}" = "stop" ]; then
  stop
  exit 0
elif [ -n "${1:-}" ]; then
  error "用法: ./start.sh [stop]"
  exit 1
fi

cleanup() {
  trap - INT TERM EXIT
  echo
  info "正在停止前后端服务..."
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    pkill -P "$BACKEND_PID" 2>/dev/null || true
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  info "已停止。"
}
trap cleanup INT TERM EXIT

# ---- 环境检查 ----
for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { error "未找到 $cmd,请先安装 Node.js(≥18)"; exit 1; }
done

# ---- 端口检查(启动前) ----
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  pids="$(port_pids "$port")"
  if [ -n "$pids" ]; then
    for pid in $pids; do
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || echo '未知进程')"
      error "端口 ${port} 已被占用:PID ${pid} ${cmd}"
    done
    error "请先释放端口,或运行 ./start.sh stop 清理本项目残留进程后重试。"
    exit 1
  fi
done

# ---- 后端:虚拟环境与依赖 ----
if [ ! -x "$ROOT_DIR/.venv/bin/python" ]; then
  info "未找到 .venv,正在创建虚拟环境..."
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.13 "$ROOT_DIR/.venv"
  else
    python3 -m venv "$ROOT_DIR/.venv"
  fi
fi
PY="$ROOT_DIR/.venv/bin/python"

if [ ! -x "$ROOT_DIR/.venv/bin/uvicorn" ]; then
  info "安装后端依赖(requirements.txt)..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install -r "$ROOT_DIR/requirements.txt"
  else
    "$ROOT_DIR/.venv/bin/pip" install -r "$ROOT_DIR/requirements.txt"
  fi
fi

# ---- 前端:依赖 ----
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  info "安装前端依赖(npm install)..."
  npm install
fi

# ---- 启动后端 ----
info "启动后端:http://localhost:${BACKEND_PORT} (热重载)"
"$PY" -m server.main > "$ROOT_DIR/server.log" 2>&1 &
BACKEND_PID=$!

# 等待后端就绪
for _ in $(seq 1 30); do
  if curl -s "http://localhost:${BACKEND_PORT}/api" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# ---- 启动前端 ----
info "启动前端:http://localhost:${FRONTEND_PORT}"
npm run dev > "$ROOT_DIR/vite.log" 2>&1 &
FRONTEND_PID=$!

echo
info "全部就绪:"
info "  前端 http://localhost:${FRONTEND_PORT}  (Vite,/api 已代理到 ${BACKEND_PORT})"
info "  后端 http://localhost:${BACKEND_PORT}"
info "日志:server.log / vite.log,按 Ctrl+C 停止。"
echo

# 阻塞等待任一进程退出
wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
