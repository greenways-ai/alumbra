import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const input = fs.readFileSync(new URL("../src/playable-input.js", import.meta.url), "utf8");
const save = fs.readFileSync(new URL("../src/world-save.js", import.meta.url), "utf8");

test("lab pins PlayCanvas and composes Core, Engine and renderer without Hodos", () => {
  assert.match(index, /playcanvas@2\.21\.3\/build\/playcanvas\/src\/index\.js/);
  assert.match(main, /createWorldRuntime/);
  assert.match(main, /createPlayerRuntime/);
  assert.match(main, /createPlayCanvasVoxelRenderer/);
  assert.match(main, /createPlayableWorldController/);
  assert.match(main, /createWorldSave/);
  assert.doesNotMatch(main, /createFirstPersonController/);
  assert.doesNotMatch(main, /@greenways\/hodos/);
});

test("lab exposes the complete build loop and deterministic host disposal", () => {
  assert.match(index, /Left break/);
  assert.match(index, /Right place/);
  assert.match(index, /1–8/);
  assert.match(index, /Z undo/);
  assert.match(main, /controller\.applyAction/);
  assert.match(main, /controller\.undo/);
  assert.match(main, /renderer\.setChunk/);
  assert.match(main, /visibilitychange/);
  assert.match(main, /pagehide/);
  assert.match(main, /input\.destroy\(\)/);
  assert.match(main, /controller\.destroy\(\)/);
  assert.match(main, /renderer\.destroy\(\)/);
  assert.match(main, /app\.destroy\(\)/);
});

test("storage and input remain browser-owned application services", () => {
  assert.match(input, /requestPointerLock/);
  assert.match(input, /pointerLockElement/);
  assert.match(input, /keydown/);
  assert.match(save, /alumbra\.world-save\/1/);
  assert.match(save, /encodeChunkSnapshot/);
  assert.match(save, /digestChunkSnapshot/);
  assert.match(save, /normalizeGeneratorIdentity/);
  assert.doesNotMatch(save, /PlayCanvas|pc\./);
});
