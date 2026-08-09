import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkToRegionAddress,
  normalizeRegionShape,
  regionKey,
} from "../src/region.js";

test("chunk-to-region addressing uses mathematical floor division", () => {
  assert.deepEqual(chunkToRegionAddress([-1, -1, -1], [8, 4, 8]), {
    chunk: [-1, -1, -1],
    region: [-1, -1, -1],
    local: [7, 3, 7],
    regionKey: "-1,-1,-1",
  });
  assert.deepEqual(chunkToRegionAddress([-9, 0, 8], [8, 4, 8]), {
    chunk: [-9, 0, 8],
    region: [-2, 0, 1],
    local: [7, 0, 0],
    regionKey: "-2,0,1",
  });
  assert.deepEqual(chunkToRegionAddress([8, 4, 8], [8, 4, 8]), {
    chunk: [8, 4, 8],
    region: [1, 1, 1],
    local: [0, 0, 0],
    regionKey: "1,1,1",
  });
});

test("region shapes and keys are bounded and deterministic", () => {
  assert.deepEqual(normalizeRegionShape([8, 4, 8]), [8, 4, 8]);
  assert.equal(regionKey([-2, 0, 1]), "-2,0,1");
  assert.throws(() => normalizeRegionShape([8, 0, 8]), /between 1/);
  assert.throws(() => normalizeRegionShape([2048, 1, 1]), /between 1/);
});
