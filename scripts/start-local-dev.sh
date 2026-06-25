#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-3501}"
FRONTEND_PORT="${FRONTEND_PORT:-3402}"
HOST="${HOST:-127.0.0.1}"

BACKEND_URL="http://localhost:${BACKEND_PORT}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

require_path() {
  local path="$1"
  local message="$2"

  if [[ ! -e "$path" ]]; then
    echo "$message" >&2
    exit 1
  fi
}

require_path "$BACKEND_DIR/.venv/bin/python" "Missing backend virtualenv. From backend/: python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt"
require_path "$FRONTEND_DIR/node_modules" "Missing frontend dependencies. From frontend/: npm install"

echo "Starting backend on ${BACKEND_URL}"
(
  cd "$BACKEND_DIR"
  ./.venv/bin/python -m uvicorn app.main:app --host "$HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:${FRONTEND_PORT}"
(
  cd "$FRONTEND_DIR"
  VITE_API_URL="${BACKEND_URL}/api/v1/stellina" \
  VITE_CORE_API_URL="${BACKEND_URL}/api/v1/core" \
    npm run dev -- --host "$HOST" --port "$FRONTEND_PORT" --strictPort
) &
FRONTEND_PID=$!

echo
echo "Frontend: http://localhost:${FRONTEND_PORT}"
echo "Backend health: ${BACKEND_URL}/health"
echo "Backend docs: ${BACKEND_URL}/docs"
echo
echo "Press Ctrl-C to stop both services."

wait -n "$BACKEND_PID" "$FRONTEND_PID"
