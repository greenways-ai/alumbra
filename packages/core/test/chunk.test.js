import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  getBlock,
  setBlock,
} from "../src/index.js";

test("chunk palette widens after more than 256 distinct block values", () => {
  const registry = createBlockRegistry([
    { id: "alumbra/air", empty: true },
    {
      id: "alumbra/stateful",
      states: {
        value: { type: "integer", min: 0, max: 300, default: 0 },
      },
    },
  ]);
  let chunk = createChunk({ registry, shape: [16, 16, 2] });
  for (let value = 0; value <= 256; value += 1) {
    const x = value % 16;
    const y = Math.floor(value / 16) % 16;
    const z = Math.floor(value / 256);
    chunk = setBlock(chunk, [x, y, z], {
      id: "alumbra/stateful",
      state: { value },
    }, registry, { revision: chunk.revision });
  }
  assert.equal(chunk.palette.length, 258);
  assert.equal(chunk.indexWidth, 2);
  assert.ok(chunk.indices instanceof Uint16Array);
  assert.deepEqual(getBlock(chunk, [0, 0, 1]), {
    id: "alumbra/stateful",
    state: { value: 256 },
  });
});
