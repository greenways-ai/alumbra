import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const browserGate = readFileSync(
  new URL("../../../scripts/check-peacock-ballroom-browser.sh", import.meta.url),
  "utf8",
);

test("reviews every calibrated state plus night, structural and touch presentations", () => {
  for (const invocation of [
    'run_state "ballroom/day" "desktop" "day" "rendered"',
    'run_state "ballroom/gallery-overlook" "desktop" "day" "rendered"',
    'run_state "ballroom/mosaic-floor" "desktop" "day" "rendered"',
    'run_state "ballroom/day" "desktop" "night" "rendered"',
    'run_state "ballroom/day" "desktop" "day" "structural"',
    'run_state "ballroom/day" "touch" "day" "rendered"',
  ]) {
    assert.ok(browserGate.includes(invocation), invocation);
  }
});

test("requires exact visual-language asset identities and the six-stage progress rail", () => {
  for (const token of [
    "visual-language/greenways/peacock-ballroom-${appearance}",
    "ceeb1917f99142f39f06e6de7424333e9d2df360",
    "fad7dff0d4bd7f21af0af6aa73508caeb4c177de",
    "data-peacock-ballroom-render-plate-asset",
    "data-peacock-ballroom-render-plate-blob",
    "data-peacock-ballroom-render-progress=\"passed\"",
    "data-ballroom-progress-stage=\"render\"",
    "data-ballroom-progress-stage=",
  ]) {
    assert.ok(browserGate.includes(token), token);
  }
  assert.match(browserGate, /!= "6"/);
});

test("proves the original render is visible while geometry remains available", () => {
  for (const token of [
    'data-peacock-ballroom-render-plate-opacity="0\\.[0-9]+"',
    'data-peacock-ballroom-render-plate-geometry-opacity="0\\.[0-9]+"',
    'data-peacock-ballroom-render-plate-opacity="0"',
    'data-peacock-ballroom-render-plate-geometry-opacity="1"',
    'class="ballroom-render-plate-image"',
    'peacock-ballroom-${appearance}.webp',
  ]) {
    assert.ok(browserGate.includes(token), token);
  }
});

test("writes distinct review screenshots and rejects page-level browser errors", () => {
  assert.match(browserGate, /ARTIFACT_DIR/);
  assert.match(browserGate, /--screenshot="\$screenshot"/);
  assert.match(browserGate, /data-peacock-ballroom-page-error=\"true\"/);
  assert.match(browserGate, /data-peacock-ballroom-input=\"touch\"/);
  assert.match(browserGate, /data-peacock-ballroom-render-plate-profile=\"mobile\"/);
});
