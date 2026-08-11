#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ALUMBRA_BALLROOM_BROWSER_PORT:-4174}"
ARTIFACT_DIR="${ALUMBRA_BALLROOM_ARTIFACT_DIR:-$ROOT/artifacts/peacock-ballroom}"
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

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/*.png

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
  local slug="${state//\//-}"
  local dom="$TMP/${slug}.html"
  local log="$TMP/${slug}.log"
  local screenshot="$ARTIFACT_DIR/${slug}.png"
  local url="http://127.0.0.1:${PORT}/apps/lab/peacock-ballroom.html?state=${state}"

  if ! "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --enable-webgl \
    --ignore-gpu-blocklist \
    --enable-unsafe-swiftshader \
    --use-gl=angle \
    --use-angle=swiftshader \
    --window-size=1440,900 \
    --virtual-time-budget=45000 \
    --screenshot="$screenshot" \
    --dump-dom \
    "$url" >"$dom" 2>"$log"; then
    cat "$log" >&2
    echo "Headless Chromium failed for Peacock Ballroom state ${state}." >&2
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
    'data-peacock-ballroom-mobile-controls="ready"' \
    'data-peacock-ballroom-architecture="passed"'; do
    if ! grep -Fq "$expected" "$dom"; then
      cat "$log" >&2
      cat "$dom" >&2
      echo "Peacock Ballroom browser proof is missing ${expected}." >&2
      return 1
    fi
  done

  if ! grep -Eq 'data-peacock-ballroom-architecture-entities="[1-9][0-9]*"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "Peacock Ballroom browser proof did not publish ornamental architecture entities." >&2
    return 1
  fi

  if [[ ! -s "$screenshot" ]]; then
    cat "$log" >&2
    echo "Peacock Ballroom review screenshot was not written for ${state}." >&2
    return 1
  fi

  echo "Peacock Ballroom browser story passed: ${state}"
}

run_state "ballroom/day"
run_state "ballroom/gallery-overlook"
run_state "ballroom/mosaic-floor"
