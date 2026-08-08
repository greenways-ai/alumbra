#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ALUMBRA_BROWSER_PORT:-4173}"
TMP="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

if command -v google-chrome >/dev/null 2>&1; then
  CHROME="$(command -v google-chrome)"
elif command -v chromium >/dev/null 2>&1; then
  CHROME="$(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
  CHROME="$(command -v chromium-browser)"
else
  echo "Headless Chromium is required for the Alumbra browser merge gate." >&2
  exit 1
fi

cd "$ROOT"
PORT="$PORT" node scripts/serve-lab.js >"$TMP/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 100); do
  if curl --fail --silent "http://127.0.0.1:${PORT}/apps/lab/" >/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "$TMP/server.log" >&2
    exit 1
  fi
  sleep 0.1
done

if ! curl --fail --silent "http://127.0.0.1:${PORT}/apps/lab/" >/dev/null; then
  cat "$TMP/server.log" >&2
  echo "Alumbra lab server did not become ready." >&2
  exit 1
fi

run_activity() {
  local activity="$1"
  local slug="${activity//\//-}"
  local dom="$TMP/${slug}.html"
  local log="$TMP/${slug}.log"
  local url="http://127.0.0.1:${PORT}/apps/lab/?activity=${activity}"

  if ! "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --enable-webgl \
    --ignore-gpu-blocklist \
    --enable-unsafe-swiftshader \
    --use-gl=angle \
    --use-angle=swiftshader \
    --virtual-time-budget=20000 \
    --dump-dom \
    "$url" >"$dom" 2>"$log"; then
    cat "$log" >&2
    echo "Headless Chromium failed for ${activity}." >&2
    return 1
  fi

  if ! grep -Fq 'data-lab-ready="true"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "Alumbra lab did not become ready for ${activity}." >&2
    return 1
  fi
  if ! grep -Fq "data-browser-activity=\"${activity}\"" "$dom"; then
    cat "$dom" >&2
    echo "Catalog did not open the requested installed activity ${activity}." >&2
    return 1
  fi
  if ! grep -Fq 'data-browser-check="passed"' "$dom"; then
    cat "$dom" >&2
    echo "Bounded Catalog checks did not pass for ${activity}." >&2
    return 1
  fi
  if grep -Fq 'data-lab-error="true"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "The Alumbra browser story reported a page or console error for ${activity}." >&2
    return 1
  fi

  echo "Browser story passed: ${activity}"
}

run_activity "alumbra-hodos/renderer-catalog"
run_activity "alumbra-viewport-playcanvas/playable-world"
run_activity "alumbra-viewport-playcanvas/two-sessions"
