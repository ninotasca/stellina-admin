#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

FRONTEND_PORT="${FRONTEND_PORT:-3401}"
HOST="${HOST:-127.0.0.1}"
UNOVENTI_API_URL="${UNOVENTI_API_URL:-http://127.0.0.1:3301}"

cleanup() {
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

require_path "$FRONTEND_DIR/node_modules" "Missing frontend dependencies. From frontend/: npm install"

if ! curl --silent --show-error --fail "${UNOVENTI_API_URL}/health" >/dev/null; then
  echo "Unoventi API is not available at ${UNOVENTI_API_URL}." >&2
  echo "Start /Users/ninotasca/dev/unoventi/unoventi-api on port 3301, then retry." >&2
  exit 1
fi

echo "Starting frontend on http://localhost:${FRONTEND_PORT}"
(
  cd "$FRONTEND_DIR"
  STELLINA_API_PROXY_TARGET="${UNOVENTI_API_URL}" \
    npm run dev -- --host "$HOST" --port "$FRONTEND_PORT" --strictPort
) &
FRONTEND_PID=$!

echo
echo "Frontend: http://localhost:${FRONTEND_PORT}"
echo "Shared API health: ${UNOVENTI_API_URL}/health"
echo "Shared API docs: ${UNOVENTI_API_URL}/docs"
echo
echo "Press Ctrl-C to stop the frontend."

wait "$FRONTEND_PID"
