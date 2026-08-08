import assert from "node:assert/strict";
import test from "node:test";
import { raycastVoxels } from "../src/raycast.js";

const key = (value) => value.join(",");
const block = Object.freeze({ id: "alumbra/stone", state: Object.freeze({}) });

function cast(blocks, options) {
  return raycastVoxels({
    ...options,
    getBlock: (world) => blocks.has(key(world)) ? block : null,
  });
}

test("DDA returns the entered face, previous voxel and exact distance", () => {
  const hit = cast(new Set(["0,0,0"]), {
    origin: [0.5, 0.5, -2],
    direction: [0, 0, 1],
    maxDistance: 8,
  });
  assert.deepEqual(hit.voxel, [0, 0, 0]);
  assert.deepEqual(hit.previous, [0, 0, -1]);
  assert.deepEqual(hit.normal, [0, 0, -1]);
  assert.equal(hit.face, "north");
  assert.equal(hit.distance, 2);
  assert.deepEqual(hit.position, [0.5, 0.5, 0]);
});

test("DDA handles negative coordinates and negative directions", () => {
  const hit = cast(new Set(["-3,1,2"]), {
    origin: [0.2, 1.5, 2.5],
    direction: [-1, 0, 0],
    maxDistance: 10,
  });
  assert.deepEqual(hit.voxel, [-3, 1, 2]);
  assert.equal(hit.face, "east");
  assert.deepEqual(hit.normal, [1, 0, 0]);
  assert.equal(hit.distance, 2.2);
});

test("starting inside a solid voxel produces a zero-distance inside hit", () => {
  const hit = cast(new Set(["1,2,3"]), {
    origin: [1.25, 2.25, 3.25],
    direction: [1, 0, 0],
  });
  assert.equal(hit.inside, true);
  assert.equal(hit.distance, 0);
  assert.equal(hit.face, null);
});

test("DDA respects the maximum reach", () => {
  const hit = cast(new Set(["5,0,0"]), {
    origin: [0.5, 0.5, 0.5],
    direction: [1, 0, 0],
    maxDistance: 4,
  });
  assert.equal(hit, null);
});
