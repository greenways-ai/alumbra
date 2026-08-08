import assert from "node:assert/strict";
import test from "node:test";
import {
  AlumbraValidationError,
  createBlockRegistry,
  createChunk,
  decodeChunkSnapshot,
  digestChunkSnapshot,
  encodeChunkSnapshot,
  setBlock,
} from "../src/index.js";

const makeRegistry = () => createBlockRegistry([
  { id: "alumbra/air", empty: true },
  { id: "alumbra/soil" },
  { id: "alumbra/stone" },
]);

test("canonical snapshots ignore internal palette insertion order", async () => {
  const registry = makeRegistry();
  let left = createChunk({ registry, coord: [-2, 1, 4], shape: [4, 4, 4], revision: 7 });
  left = setBlock(left, [0, 0, 0], "alumbra/stone", registry, { revision: 7 });
  left = setBlock(left, [1, 0, 0], "alumbra/soil", registry, { revision: 7 });

  let right = createChunk({ registry, coord: [-2, 1, 4], shape: [4, 4, 4], revision: 7 });
  right = setBlock(right, [1, 0, 0], "alumbra/soil", registry, { revision: 7 });
  right = setBlock(right, [0, 0, 0], "alumbra/stone", registry, { revision: 7 });

  const leftBytes = encodeChunkSnapshot(left);
  const rightBytes = encodeChunkSnapshot(right);
  assert.deepEqual(leftBytes, rightBytes);
  assert.equal(await digestChunkSnapshot(leftBytes), await digestChunkSnapshot(right));

  const decoded = decodeChunkSnapshot(leftBytes, { registry });
  assert.deepEqual(encodeChunkSnapshot(decoded), leftBytes);
});

test("snapshot decoder rejects truncation and trailing bytes", () => {
  const registry = makeRegistry();
  const bytes = encodeChunkSnapshot(createChunk({ registry, shape: [2, 2, 2] }));
  assert.throws(() => decodeChunkSnapshot(bytes.subarray(0, bytes.length - 1), { registry }), AlumbraValidationError);
  const trailing = new Uint8Array(bytes.length + 1);
  trailing.set(bytes);
  assert.throws(() => decodeChunkSnapshot(trailing, { registry }), AlumbraValidationError);
});
