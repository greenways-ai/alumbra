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
  local input="${2:-desktop}"
  local appearance="${3:-day}"
  local presentation="${4:-rendered}"
  local slug="${state//\//-}-${input}-${appearance}-${presentation}"
  local dom="$TMP/${slug}.html"
  local log="$TMP/${slug}.log"
  local screenshot="$ARTIFACT_DIR/${slug}.png"
  local window_size="1280,720"
  local virtual_time_budget="90000"
  local asset_id="visual-language/greenways/peacock-ballroom-${appearance}"
  local asset_blob="ceeb1917f99142f39f06e6de7424333e9d2df360"
  local asset_path="peacock-ballroom-${appearance}.webp"
  local url="http://127.0.0.1:${PORT}/apps/lab/peacock-ballroom.html?state=${state}&input=${input}&appearance=${appearance}&presentation=${presentation}"
  if [[ "$appearance" == "night" ]]; then
    asset_blob="fad7dff0d4bd7f21af0af6aa73508caeb4c177de"
  fi
  if [[ "$input" == "touch" ]]; then
    window_size="390,844"
    virtual_time_budget="120000"
  fi

  if ! "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-features=CalculateNativeWinOcclusion \
    --run-all-compositor-stages-before-draw \
    --enable-webgl \
    --ignore-gpu-blocklist \
    --enable-unsafe-swiftshader \
    --use-gl=angle \
    --use-angle=swiftshader \
    --window-size="$window_size" \
    --virtual-time-budget="$virtual_time_budget" \
    --screenshot="$screenshot" \
    --dump-dom \
    "$url" >"$dom" 2>"$log"; then
    cat "$log" >&2
    echo "Headless Chromium failed for Peacock Ballroom state ${state} (${input}, ${appearance}, ${presentation})." >&2
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
    'data-peacock-ballroom-architecture="passed"' \
    'data-peacock-ballroom-progress="100"' \
    'data-peacock-ballroom-progress-stage="ready"' \
    'data-peacock-ballroom-render-progress="passed"' \
    'data-peacock-ballroom-render-plate="passed"' \
    'data-peacock-ballroom-render-plate-loaded="true"' \
    "data-peacock-ballroom-render-plate-state=\"${state}\"" \
    "data-peacock-ballroom-render-plate-asset=\"${asset_id}\"" \
    "data-peacock-ballroom-render-plate-blob=\"${asset_blob}\"" \
    "data-peacock-ballroom-render-plate-appearance=\"${appearance}\"" \
    "data-peacock-ballroom-render-plate-presentation=\"${presentation}\"" \
    'data-peacock-ballroom-render-plate-pose="ready"' \
    'data-peacock-ballroom-render-controls="ready"' \
    'data-ballroom-progress-stage="render"' \
    'class="ballroom-render-plate-image"' \
    "$asset_path"; do
    if ! grep -Fq "$expected" "$dom"; then
      cat "$log" >&2
      cat "$dom" >&2
      echo "Peacock Ballroom render-backed browser proof is missing ${expected}." >&2
      return 1
    fi
  done

  if grep -Fq 'data-peacock-ballroom-page-error="true"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "Peacock Ballroom reported a browser page error." >&2
    return 1
  fi

  if [[ "$(grep -o 'data-ballroom-progress-stage=' "$dom" | wc -l | tr -d ' ')" != "6" ]]; then
    cat "$dom" >&2
    echo "Peacock Ballroom must expose exactly six world-assembly stages." >&2
    return 1
  fi

  if ! grep -Eq 'data-peacock-ballroom-architecture-entities="[1-9][0-9]*"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "Peacock Ballroom browser proof did not publish ornamental architecture entities." >&2
    return 1
  fi

  if [[ "$presentation" == "structural" ]]; then
    for expected in \
      'data-peacock-ballroom-render-plate-opacity="0"' \
      'data-peacock-ballroom-render-plate-geometry-opacity="1"'; do
      grep -Fq "$expected" "$dom" || {
        cat "$dom" >&2
        echo "Structural Peacock presentation is missing ${expected}." >&2
        return 1
      }
    done
  else
    if ! grep -Eq 'data-peacock-ballroom-render-plate-opacity="0\.[0-9]+"' "$dom"; then
      cat "$dom" >&2
      echo "Rendered Peacock presentation did not publish a visible matte-plate opacity." >&2
      return 1
    fi
    if ! grep -Eq 'data-peacock-ballroom-render-plate-geometry-opacity="0\.[0-9]+"' "$dom"; then
      cat "$dom" >&2
      echo "Rendered Peacock presentation did not publish a subordinate geometry opacity." >&2
      return 1
    fi
  fi

  if [[ ! -s "$screenshot" ]]; then
    cat "$log" >&2
    echo "Peacock Ballroom review screenshot was not written for ${state} (${input}, ${appearance}, ${presentation})." >&2
    return 1
  fi

  if [[ "$input" == "touch" ]]; then
    for expected in \
      'data-peacock-ballroom-input="touch"' \
      'data-peacock-ballroom-mobile-layout="passed"' \
      'data-peacock-ballroom-render-plate-profile="mobile"' \
      'data-peacock-ballroom-target='; do
      if ! grep -Fq "$expected" "$dom"; then
        cat "$log" >&2
        cat "$dom" >&2
        echo "Peacock Ballroom mobile proof is missing ${expected}." >&2
        return 1
      fi
    done
  fi

  echo "Peacock Ballroom render-backed browser story passed: ${state} (${input}, ${appearance}, ${presentation})"
}

run_state "ballroom/day" "desktop" "day" "rendered"
run_state "ballroom/gallery-overlook" "desktop" "day" "rendered"
run_state "ballroom/mosaic-floor" "desktop" "day" "rendered"
run_state "ballroom/day" "desktop" "night" "rendered"
run_state "ballroom/day" "desktop" "day" "structural"
run_state "ballroom/day" "touch" "day" "rendered"
