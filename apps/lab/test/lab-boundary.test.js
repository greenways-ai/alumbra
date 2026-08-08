import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const packagedHost = fs.readFileSync(new URL("../src/packaged-hara-host.js", import.meta.url), "utf8");
const input = fs.readFileSync(new URL("../../../packages/viewport-playcanvas/src/input.js", import.meta.url), "utf8");
const session = fs.readFileSync(new URL("../../../packages/viewport-playcanvas/src/session.js", import.meta.url), "utf8");
const save = fs.readFileSync(new URL("../src/world-save.js", import.meta.url), "utf8");

test("lab pins PlayCanvas and consumes reusable viewport and packaged-world hosts without Hodos", () => {
  assert.match(index, /playcanvas@2\.21\.3\/build\/playcanvas\/src\/index\.js/);
  assert.match(index, /@greenways\/alumbra-viewport-playcanvas/);
  assert.match(index, /@greenways\/alumbra-hara/);
  assert.match(main, /createWorldRuntime/);
  assert.match(main, /createPlayerRuntime/);
  assert.match(main, /createViewportSessionGroup/);
  assert.match(main, /createPlayableWorldController/);
  assert.match(main, /createWorldSave/);
  assert.match(main, /createPackagedHaraWorldHost/);
  assert.doesNotMatch(main, /createPlayCanvasVoxelRenderer/);
  assert.doesNotMatch(main, /new pc\.Application/);
  assert.doesNotMatch(main, /@greenways\/hodos/);
});

test("lab exposes one, two and package-pinned Hara viewport activities", () => {
  assert.match(index, /alumbra-canvas-secondary/);
  assert.match(index, /alumbra-canvas-hara/);
  assert.match(index, /data-packaged-world-error/);
  assert.match(index, /Left break/);
  assert.match(index, /Right place/);
  assert.match(index, /1–8/);
  assert.match(index, /Z undo/);
  assert.match(main, /alumbra-viewport-playcanvas\/playable-world/);
  assert.match(main, /alumbra-viewport-playcanvas\/two-sessions/);
  assert.match(packagedHost, /alumbra-hara\/packaged-height-field/);
  assert.match(main, /ensureSecondaryViewport/);
  assert.match(main, /queueSave\("autosave"\)/);
  assert.match(main, /visibilitychange/);
  assert.match(main, /viewports\.suspend/);
  assert.match(main, /viewports\.destroy\(\)/);
});

test("packaged Hara host materializes Core worlds while persistence remains app-owned", () => {
  assert.match(packagedHost, /loadPackagedHaraWorld/);
  assert.match(packagedHost, /createFixturePackagedWorldSession/);
  assert.match(packagedHost, /createWorldRuntime/);
  assert.match(packagedHost, /createPlayerRuntime/);
  assert.match(packagedHost, /createPlayableWorldController/);
  assert.match(packagedHost, /viewports\.remove\("hara", \{destroy: true\}\)/);
  assert.match(packagedHost, /releasedRenderer/);
  assert.doesNotMatch(packagedHost, /localStorage|createWorldSave|restoreWorldSave/);
  assert.doesNotMatch(packagedHost, /@greenways\/hodos/);
});

test("viewport owns input and projection lifecycle while storage stays in the app", () => {
  assert.match(input, /requestPointerLock/);
  assert.match(input, /pointerLockElement/);
  assert.match(input, /suspend\(\)/);
  assert.match(input, /resume\(\)/);
  assert.match(session, /createPlayCanvasVoxelRenderer/);
  assert.match(session, /viewportRenderer\.setSelection/);
  assert.match(session, /status = "suspended"/);
  assert.match(session, /viewportRenderer\.destroy/);
  assert.match(session, /app\.destroy/);
  assert.match(save, /alumbra\.world-save\/1/);
  assert.match(save, /encodeChunkSnapshot/);
  assert.match(save, /digestChunkSnapshot/);
  assert.match(save, /normalizeGeneratorIdentity/);
  assert.doesNotMatch(save, /PlayCanvas|pc\./);
});
