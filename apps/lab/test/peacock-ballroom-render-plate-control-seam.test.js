import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const entry = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-entry.js", import.meta.url),
  "utf8",
);

test("exposes only bounded day/night and rendered/structural controls", () => {
  assert.match(entry, /next !== "day" && next !== "night"/);
  assert.match(entry, /next !== "rendered" && next !== "structural"/);
  assert.match(entry, /__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__/);
  assert.match(entry, /__PEACOCK_BALLROOM_SET_PRESENTATION__/);
  assert.match(entry, /Unsupported Peacock Ballroom render appearance/);
  assert.match(entry, /Unsupported Peacock Ballroom presentation/);
});

test("keeps structural mode fully navigable while hiding the matte plate", () => {
  assert.match(entry, /host\.suspend\("structural-presentation"\)/);
  assert.match(entry, /canvas\.style\.opacity = "1"/);
  assert.match(entry, /peacockBallroomRenderPlatePresentation/);
  assert.match(entry, /rendered \? String\(evidence\.opacity\) : "0"/);
  assert.match(entry, /rendered && ready \? String\(evidence\.geometryOpacity\) : "1"/);
});

test("reopens the exact installed asset when appearance changes", () => {
  assert.match(entry, /activeAppearance = next/);
  assert.match(entry, /appearance: activeAppearance/);
  assert.match(entry, /return openState\(activeState\)/);
  assert.match(entry, /url\.searchParams\.set\("appearance", "night"\)/);
  assert.match(entry, /url\.searchParams\.delete\("appearance"\)/);
});

test("preserves semantic route identity and cleans up global controls", () => {
  assert.match(entry, /history\.replaceState/);
  assert.doesNotMatch(entry, /location\.assign|location\.reload/);
  assert.match(entry, /delete globalThis\.__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__/);
  assert.match(entry, /delete globalThis\.__PEACOCK_BALLROOM_SET_PRESENTATION__/);
});
