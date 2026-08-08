import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkToWorld,
  indexToLocal,
  localToIndex,
  worldToChunk,
} from "../src/index.js";

test("world to chunk conversion uses mathematical floor division", () => {
  assert.deepEqual(worldToChunk([-1, -33, 32], [32, 32, 32]), {
    chunk: [-1, -2, 1],
    local: [31, 31, 0],
  });
  assert.deepEqual(chunkToWorld([-1, -2, 1], [31, 31, 0], [32, 32, 32]), [-1, -33, 32]);
});

test("local indices round trip in X-major order", () => {
  const shape = [4, 3, 2];
  for (let index = 0; index < 24; index += 1) {
    assert.equal(localToIndex(indexToLocal(index, shape), shape), index);
  }
  assert.equal(localToIndex([1, 2, 1], shape), 21);
});
