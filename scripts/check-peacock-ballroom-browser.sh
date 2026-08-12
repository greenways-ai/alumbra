#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ALUMBRA_BALLROOM_BROWSER_PORT:-4174}"
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
  echo "Headless Chromium is required for the Peacock Ballroom browser gate." >&2
  exit 1
fi

cd "$ROOT"
PORT="$PORT" node scripts/serve-lab.js >"$TMP/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 120); do
  if curl --fail --silent "http://127.0.0.1:${PORT}/apps/lab/peacock-ballroom.html" >/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "$TMP/server.log" >&2
    exit 1
  fi
  sleep 0.1
done

run_state() {
  local state="$1"
  local input="${2:-desktop}"
  local slug="${state//\//-}-${input}"
  local dom="$TMP/${slug}.html"
  local log="$TMP/${slug}.log"
  local window_size="1280,720"
  local url="http://127.0.0.1:${PORT}/apps/lab/peacock-ballroom.html?state=${state}&input=${input}"
  if [[ "$input" == "touch" ]]; then
    window_size="390,844"
  fi

  if ! "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --enable-webgl \
    --ignore-gpu-blocklist \
    --enable-unsafe-swiftshader \
    --use-gl=angle \
    --use-angle=swiftshader \
    --window-size="$window_size" \
    --virtual-time-budget=45000 \
    --dump-dom \
    "$url" >"$dom" 2>"$log"; then
    cat "$log" >&2
    echo "Headless Chromium failed for Peacock Ballroom state ${state} (${input})." >&2
    return 1
  fi

  for expected in \
    'data-peacock-ballroom-ready="true"' \
    'data-peacock-ballroom-error="false"' \
    "data-peacock-ballroom-state=\"${state}\"" \
    'data-peacock-ballroom-chunks="48"' \
    'data-peacock-ballroom-lighting="passed"' \
    'data-peacock-ballroom-landmarks="passed"' \
    'data-peacock-ballroom-disposal="passed"' \
    'data-peacock-ballroom-mobile-controls="ready"'; do
    if ! grep -Fq "$expected" "$dom"; then
      cat "$log" >&2
      cat "$dom" >&2
      echo "Peacock Ballroom browser proof is missing ${expected}." >&2
      return 1
    fi
  done

  if [[ "$input" == "touch" ]]; then
    for expected in \
      'data-peacock-ballroom-input="touch"' \
      'data-peacock-ballroom-mobile-layout="passed"' \
      'data-peacock-ballroom-target='; do
      if ! grep -Fq "$expected" "$dom"; then
        cat "$log" >&2
        cat "$dom" >&2
        echo "Peacock Ballroom mobile proof is missing ${expected}." >&2
        return 1
      fi
    done
  fi

  echo "Peacock Ballroom browser story passed: ${state} (${input})"
}

run_state "ballroom/day" "desktop"
run_state "ballroom/gallery-overlook" "desktop"
run_state "ballroom/mosaic-floor" "desktop"
run_state "ballroom/day" "touch"
