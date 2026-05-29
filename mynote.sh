#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/.mynote"
LOG_DIR="$PID_DIR/logs"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
API_PID_FILE="$PID_DIR/api.pid"
FRONTEND_LOG_FILE="$LOG_DIR/frontend.log"
API_LOG_FILE="$LOG_DIR/api.log"
FRONTEND_HOST="127.0.0.1"
FRONTEND_PORT="5173"
API_PORT="3000"

cd "$ROOT_DIR"

mkdir -p "$PID_DIR" "$LOG_DIR"

print_usage() {
  cat <<USAGE
Usage:
  ./mynote.sh start     初回セットアップ、ビルド、フロントエンド/APIを一括起動
  ./mynote.sh stop      起動中のフロントエンド/APIを停止
  ./mynote.sh restart   停止してから起動
  ./mynote.sh status    起動状態を表示
  ./mynote.sh logs      ログを追跡表示
  ./mynote.sh build     依存関係を確認してビルドのみ実行

Default:
  ./mynote.sh は ./mynote.sh start と同じ動作
USAGE
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

pid_is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

read_pid_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cat "$file"
  else
    true
  fi
}

stop_pid_file() {
  local name="$1"
  local file="$2"
  local pid
  pid="$(read_pid_file "$file")"

  if [[ -z "$pid" ]]; then
    echo "$name: PIDファイルなし"
    return 0
  fi

  if pid_is_running "$pid"; then
    echo "$name: stopping pid=$pid"
    kill "$pid" >/dev/null 2>&1 || true

    for _ in {1..30}; do
      if ! pid_is_running "$pid"; then
        break
      fi
      sleep 0.1
    done

    if pid_is_running "$pid"; then
      echo "$name: force killing pid=$pid"
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    echo "$name: 既に停止済み pid=$pid"
  fi

  rm -f "$file"
}

stop_known_processes() {
  echo "既存の mynote 関連プロセスを停止します"

  stop_pid_file "frontend" "$FRONTEND_PID_FILE"
  stop_pid_file "api" "$API_PID_FILE"

  pkill -f "vite --host ${FRONTEND_HOST}" >/dev/null 2>&1 || true
  pkill -f "vite.*--host ${FRONTEND_HOST}" >/dev/null 2>&1 || true
  pkill -f "tsx server/index.ts" >/dev/null 2>&1 || true
}

ensure_node() {
  if ! command_exists node; then
    echo "ERROR: node が見つかりません。Node.js をインストールしてください。" >&2
    exit 1
  fi

  if ! command_exists npm; then
    echo "ERROR: npm が見つかりません。Node.js/npm をインストールしてください。" >&2
    exit 1
  fi
}

install_dependencies_if_needed() {
  if [[ ! -d node_modules ]]; then
    echo "node_modules がないため、依存関係をインストールします"
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
    return 0
  fi

  if [[ -f package-lock.json && package-lock.json -nt node_modules ]]; then
    echo "package-lock.json が更新されているため、依存関係を再インストールします"
    npm ci
    return 0
  fi

  if [[ package.json -nt node_modules ]]; then
    echo "package.json が更新されているため、依存関係を確認します"
    npm install
    return 0
  fi

  echo "依存関係は既に準備済みです"
}

run_build() {
  echo "ビルドを実行します"
  npm run build
}

start_frontend() {
  local pid
  pid="$(read_pid_file "$FRONTEND_PID_FILE")"

  if [[ -n "$pid" ]] && pid_is_running "$pid"; then
    echo "frontend: already running pid=$pid"
    return 0
  fi

  echo "frontend: starting npm run dev -- --host ${FRONTEND_HOST}"
  : > "$FRONTEND_LOG_FILE"
  nohup npm run dev -- --host "$FRONTEND_HOST" >"$FRONTEND_LOG_FILE" 2>&1 &
  echo "$!" > "$FRONTEND_PID_FILE"
}

start_api() {
  local pid
  pid="$(read_pid_file "$API_PID_FILE")"

  if [[ -n "$pid" ]] && pid_is_running "$pid"; then
    echo "api: already running pid=$pid"
    return 0
  fi

  echo "api: starting npm run server"
  : > "$API_LOG_FILE"
  nohup npm run server >"$API_LOG_FILE" 2>&1 &
  echo "$!" > "$API_PID_FILE"
}

show_status() {
  local frontend_pid
  local api_pid

  frontend_pid="$(read_pid_file "$FRONTEND_PID_FILE")"
  api_pid="$(read_pid_file "$API_PID_FILE")"

  if [[ -n "$frontend_pid" ]] && pid_is_running "$frontend_pid"; then
    echo "frontend: running pid=$frontend_pid"
    echo "frontend url: http://${FRONTEND_HOST}:${FRONTEND_PORT}/?mode=local-edit"
  else
    echo "frontend: stopped"
  fi

  if [[ -n "$api_pid" ]] && pid_is_running "$api_pid"; then
    echo "api: running pid=$api_pid"
    echo "api url: http://${FRONTEND_HOST}:${API_PORT}/"
  else
    echo "api: stopped"
  fi
}

show_logs() {
  touch "$FRONTEND_LOG_FILE" "$API_LOG_FILE"
  tail -f "$FRONTEND_LOG_FILE" "$API_LOG_FILE"
}

start_all() {
  ensure_node
  install_dependencies_if_needed
  run_build
  start_api
  start_frontend
  sleep 1
  show_status
  echo "ログ確認: ./mynote.sh logs"
  echo "停止: ./mynote.sh stop"
}

main() {
  local command="${1:-start}"

  case "$command" in
    start)
      start_all
      ;;
    stop)
      stop_known_processes
      ;;
    restart)
      stop_known_processes
      start_all
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs
      ;;
    build)
      ensure_node
      install_dependencies_if_needed
      run_build
      ;;
    -h|--help|help)
      print_usage
      ;;
    *)
      echo "ERROR: unknown command: $command" >&2
      print_usage
      exit 1
      ;;
  esac
}

main "$@"
