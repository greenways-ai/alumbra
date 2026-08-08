import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

test("lab pins PlayCanvas and loads only repository-owned Alumbra modules", () => {
  assert.match(index, /playcanvas@2\.21\.3\/build\/playcanvas\/src\/index\.js/);
  assert.match(index, /@greenways\/alumbra-core\/blocks/);
  assert.doesNotMatch(index, /@greenways\/hodos/);
  assert.match(main, /createPlayCanvasVoxelRenderer/);
  assert.match(main, /raycastVoxels/);
  assert.match(main, /for \(let z = -2; z < 2/);
  assert.match(main, /for \(let x = -2; x < 2/);
  assert.doesNotMatch(main, /setBlock|applyBlockTransaction/);
});

test("lab advertises controls and deterministic host disposal", () => {
  assert.match(index, /WASD move/);
  assert.match(main, /controller\.destroy\(\)/);
  assert.match(main, /renderer\.destroy\(\)/);
  assert.match(main, /app\.destroy\(\)/);
  assert.match(main, /pagehide/);
});
