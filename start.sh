#!/bin/sh
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' '请先安装 Node.js 和 npm，再运行此脚本。' >&2
  exit 1
fi

installed_lock=node_modules/.package-lock.json
if [ ! -x node_modules/.bin/vite ] || [ ! -f "$installed_lock" ] ||
   [ package-lock.json -nt "$installed_lock" ] || [ package.json -nt "$installed_lock" ]; then
  printf '%s\n' '正在安装项目依赖…'
  npm ci --no-audit --no-fund
fi

exec npm run dev
