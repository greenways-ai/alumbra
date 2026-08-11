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
  local state="${2:-}"
  local slug="${activity//\//-}"
  if [[ -n "$state" ]]; then slug="${slug}-${state//\//-}"; fi
  local dom="$TMP/${slug}.html"
  local log="$TMP/${slug}.log"
  local url="http://127.0.0.1:${PORT}/apps/lab/?activity=${activity}"
  if [[ -n "$state" ]]; then url="${url}&state=${state}"; fi

  if ! "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --enable-webgl \
    --ignore-gpu-blocklist \
    --enable-unsafe-swiftshader \
    --use-gl=angle \
    --use-angle=swiftshader \
    --virtual-time-budget=45000 \
    --dump-dom \
    "$url" >"$dom" 2>"$log"; then
    cat "$log" >&2
    echo "Headless Chromium failed for ${activity}${state:+ / ${state}}." >&2
    return 1
  fi

  if ! grep -Fq 'data-lab-ready="true"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "Alumbra lab did not become ready for ${activity}${state:+ / ${state}}." >&2
    return 1
  fi
  if ! grep -Fq "data-browser-activity=\"${activity}\"" "$dom"; then
    cat "$dom" >&2
    echo "Catalog did not open the requested installed activity ${activity}." >&2
    return 1
  fi
  if ! grep -Fq 'data-browser-check="passed"' "$dom"; then
    cat "$dom" >&2
    echo "Bounded Catalog checks did not pass for ${activity}${state:+ / ${state}}." >&2
    return 1
  fi
  if grep -Fq 'data-lab-error="true"' "$dom"; then
    cat "$log" >&2
    cat "$dom" >&2
    echo "The Alumbra browser story reported a page or console error for ${activity}${state:+ / ${state}}." >&2
    return 1
  fi

  if [[ "$activity" == "alumbra-hara/peacock-ballroom" ]]; then
    if ! grep -Fq "data-browser-state=\"${state}\"" "$dom"; then
      cat "$dom" >&2
      echo "Peacock Ballroom did not open named state ${state}." >&2
      return 1
    fi
    for proof in peacock-ballroom peacock-lighting peacock-boundary disposal; do
      if ! grep -Fq "data-browser-${proof}=\"passed\"" "$dom"; then
        cat "$log" >&2
        cat "$dom" >&2
        echo "The Catalog-mounted Peacock Ballroom proof ${proof} did not pass." >&2
        return 1
      fi
    done
  fi

  if [[ "$activity" == "alumbra-viewport-playcanvas/lit-world" ]]; then
    if ! grep -Fq 'data-browser-lit-world="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The live lit-world host did not become ready." >&2
      return 1
    fi
    if [[ -n "$state" ]] && ! grep -Fq "data-browser-state=\"${state}\"" "$dom"; then
      cat "$dom" >&2
      echo "The lit-world host did not open named state ${state}." >&2
      return 1
    fi
    for proof in lit-boundary lit-colors lit-visibility lit-mutation lit-stale lit-ordinary disposal; do
      if ! grep -Fq "data-browser-${proof}=\"passed\"" "$dom"; then
        cat "$dom" >&2
        echo "The lit-world browser proof ${proof} did not pass." >&2
        return 1
      fi
    done
  fi

  if [[ "$activity" == "alumbra-renderer-playcanvas/chunk-residency" \
    || "$activity" == "alumbra-renderer-playcanvas/stale-mesh-rejection" ]]; then
    if ! grep -Fq 'data-browser-residency="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The live renderer residency host did not reach its requested activity." >&2
      return 1
    fi
    if ! grep -Fq 'data-browser-disposal="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The residency GPU disposal probe did not return resources to baseline." >&2
      return 1
    fi
    if [[ "$activity" == "alumbra-renderer-playcanvas/chunk-residency" ]] \
      && ! grep -Fq 'data-browser-residency-move="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The keyboard-controlled residency viewpoint did not cross the next chunk boundary." >&2
      return 1
    fi
  fi

  if [[ "$activity" == "alumbra-renderer-playcanvas/material-matrix" \
    || "$activity" == "alumbra-renderer-playcanvas/environment-profile" ]]; then
    if ! grep -Fq 'data-browser-material="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The live material host did not reach its requested activity." >&2
      return 1
    fi
    if ! grep -Fq 'data-browser-disposal="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The material/environment disposal probe did not return resources to baseline." >&2
      return 1
    fi
    if [[ -n "$state" ]] && ! grep -Fq "data-browser-state=\"${state}\"" "$dom"; then
      cat "$dom" >&2
      echo "Material story did not open named state ${state}." >&2
      return 1
    fi
    if [[ "$state" == "materials/unknown-profile-error" ]] \
      && ! grep -Fq 'data-browser-material-error="passed"' "$dom"; then
      cat "$dom" >&2
      echo "Unknown material profile did not fail before GPU allocation." >&2
      return 1
    fi
  fi

  if [[ "$activity" == "alumbra-hodos/renderer-workspace" ]]; then
    local expected_layout="wide"
    if [[ "$state" == "workspace/compact" ]]; then expected_layout="compact"; fi
    if ! grep -Fq 'data-browser-workspace="passed"' "$dom"; then
      cat "$dom" >&2
      echo "The integrated Hodos renderer Workspace did not become ready." >&2
      return 1
    fi
    if ! grep -Fq "data-browser-state=\"${state}\"" "$dom"; then
      cat "$dom" >&2
      echo "Renderer Workspace did not open named state ${state}." >&2
      return 1
    fi
    if ! grep -Fq "data-browser-workspace-layout=\"${expected_layout}\"" "$dom"; then
      cat "$dom" >&2
      echo "Renderer Workspace did not project the expected ${expected_layout} layout." >&2
      return 1
    fi
    if ! grep -Fq 'data-browser-disposal="passed"' "$dom"; then
      cat "$dom" >&2
      echo "Renderer Workspace activity switching did not return the previous viewport to baseline." >&2
      return 1
    fi
  fi

  if [[ "$activity" == "alumbra-hara/packaged-height-field" ]]; then
    if ! grep -Fq "data-browser-state=\"${state}\"" "$dom"; then
      cat "$dom" >&2
      echo "Packaged Hara story did not open named state ${state}." >&2
      return 1
    fi
    if ! grep -Fq 'data-browser-disposal="passed"' "$dom"; then
      cat "$dom" >&2
      echo "Packaged Hara viewport disposal did not return resources to baseline." >&2
      return 1
    fi
  fi

  echo "Browser story passed: ${activity}${state:+ / ${state}}"
}

run_activity "alumbra-hodos/renderer-catalog"
run_activity "alumbra-engine/voxel-light-fields"
run_activity "alumbra-engine/lighting-runtime-fences"
run_activity "alumbra-viewport-playcanvas/playable-world"
run_activity "alumbra-viewport-playcanvas/two-sessions"
run_activity "alumbra-viewport-playcanvas/lit-world" "lighting/live"
run_activity "alumbra-viewport-playcanvas/lit-world" "lighting/lamp-removed"
run_activity "alumbra-viewport-playcanvas/lit-world" "lighting/lamp-restored"
run_activity "alumbra-viewport-playcanvas/lit-world" "lighting/stale-generation-rejected"
run_activity "alumbra-viewport-playcanvas/lit-world" "world/edit-roof-open"
run_activity "alumbra-viewport-playcanvas/lit-world" "world/edit-lamp-place"
run_activity "alumbra-viewport-playcanvas/lit-world" "world/edit-lamp-remove"
run_activity "alumbra-viewport-playcanvas/lit-world" "world/edit-stale-rebuild-rejected"
run_activity "alumbra-renderer-playcanvas/chunk-residency"
run_activity "alumbra-renderer-playcanvas/stale-mesh-rejection"
run_activity "alumbra-renderer-playcanvas/material-matrix"
run_activity "alumbra-renderer-playcanvas/environment-profile" "materials/daylight"
run_activity "alumbra-renderer-playcanvas/environment-profile" "materials/fog"
run_activity "alumbra-renderer-playcanvas/environment-profile" "materials/emissive"
run_activity "alumbra-renderer-playcanvas/environment-profile" "materials/unknown-profile-error"
run_activity "alumbra-renderer-playcanvas/light-aware-meshing"
run_activity "alumbra-renderer-playcanvas/light-field-handoff"
run_activity "alumbra-hodos/renderer-workspace" "workspace/wide"
run_activity "alumbra-hodos/renderer-workspace" "workspace/compact"
run_activity "alumbra-hara/packaged-height-field" "world/default-seed"
run_activity "alumbra-hara/packaged-height-field" "world/negative-coordinate"
run_activity "alumbra-hara/packaged-height-field" "world/package-mismatch"
run_activity "alumbra-hara/peacock-ballroom" "ballroom/day"
run_activity "alumbra-hara/peacock-ballroom" "ballroom/gallery-overlook"
run_activity "alumbra-hara/peacock-ballroom" "ballroom/mosaic-floor"
