import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkCoordinateForPosition,
  visibleChunkCoordinates,
  visibleChunkKeys,
} from "../src/visibility.js";

test("camera positions use mathematical chunk coordinates", () => {
  assert.deepEqual(chunkCoordinateForPosition([-0.01, 31.9, -32.01], [32, 32, 32]), [-1, 0, -2]);
});

test("horizontal distance one returns center and four cardinal chunks", () => {
  const coords = visibleChunkCoordinates({
    position: [0, 0, 0],
    shape: [16, 16, 16],
    horizontalDistance: 1,
    verticalDistance: 0,
  });
  assert.equal(coords.length, 5);
  assert.deepEqual(coords[0], [0, 0, 0]);
  assert.deepEqual(new Set(coords.map((coord) => coord.join(","))), new Set([
    "0,0,0", "-1,0,0", "1,0,0", "0,0,-1", "0,0,1",
  ]));
  assert.deepEqual(visibleChunkKeys({
    position: [0, 0, 0], shape: [16, 16, 16], horizontalDistance: 0, verticalDistance: 0,
  }), new Set(["0,0,0"]));
});
