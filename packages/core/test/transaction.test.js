import assert from "node:assert/strict";
import test from "node:test";
import {
  AlumbraConflictError,
  applyBlockTransaction,
  createBlockRegistry,
  createBlockTransaction,
  createChunk,
  digestChunkSnapshot,
  getBlock,
  invertBlockTransaction,
} from "../src/index.js";

const registry = createBlockRegistry([
  { id: "alumbra/air", empty: true },
  { id: "alumbra/soil" },
  { id: "alumbra/stone" },
]);

test("transactions apply atomically and increment each affected chunk once", () => {
  const chunks = [
    createChunk({ registry, coord: [0, 0, 0], shape: [4, 4, 4] }),
    createChunk({ registry, coord: [1, 0, 0], shape: [4, 4, 4] }),
  ];
  const transaction = createBlockTransaction({
    id: "transaction/build-step",
    expectedRevisions: [
      { chunk: [0, 0, 0], revision: 0 },
      { chunk: [1, 0, 0], revision: 0 },
    ],
    changes: [
      {
        chunk: [0, 0, 0],
        local: [1, 1, 1],
        before: "alumbra/air",
        after: "alumbra/stone",
      },
      {
        chunk: [0, 0, 0],
        local: [2, 1, 1],
        before: "alumbra/air",
        after: "alumbra/soil",
      },
      {
        chunk: [1, 0, 0],
        local: [0, 1, 1],
        before: "alumbra/air",
        after: "alumbra/stone",
      },
    ],
  }, registry);

  const result = applyBlockTransaction(chunks, transaction, registry);
  assert.equal(result.chunks.get("0,0,0").revision, 1);
  assert.equal(result.chunks.get("1,0,0").revision, 1);
  assert.equal(getBlock(result.chunks.get("0,0,0"), [1, 1, 1]).id, "alumbra/stone");
  assert.equal(getBlock(result.chunks.get("0,0,0"), [2, 1, 1]).id, "alumbra/soil");
});

test("transaction conflicts leave the input chunks unchanged", () => {
  const chunk = createChunk({ registry, shape: [4, 4, 4] });
  const transaction = createBlockTransaction({
    id: "transaction/conflict",
    changes: [{
      chunk: [0, 0, 0],
      local: [0, 0, 0],
      before: "alumbra/stone",
      after: "alumbra/soil",
    }],
  }, registry);
  assert.throws(() => applyBlockTransaction([chunk], transaction, registry), AlumbraConflictError);
  assert.equal(chunk.revision, 0);
  assert.equal(getBlock(chunk, [0, 0, 0]).id, "alumbra/air");
});

test("an inverse transaction restores the exact prior snapshot digest", async () => {
  const original = createChunk({ registry, shape: [4, 4, 4] });
  const beforeDigest = await digestChunkSnapshot(original);
  const transaction = createBlockTransaction({
    id: "transaction/place",
    expectedRevisions: [{ chunk: [0, 0, 0], revision: 0 }],
    changes: [{
      chunk: [0, 0, 0],
      local: [3, 2, 1],
      before: "alumbra/air",
      after: "alumbra/stone",
    }],
  }, registry);
  const applied = applyBlockTransaction([original], transaction, registry);
  const inverse = invertBlockTransaction(transaction, registry, {
    id: "transaction/undo-place",
    expectedRevisions: [{ chunk: [0, 0, 0], revision: 1 }],
  });
  const restored = applyBlockTransaction(applied.chunks, inverse, registry).chunks.get("0,0,0");

  // Revisions are durable ordering state, so compare voxel state at the original revision.
  const revisionReset = Object.freeze({ ...restored, revision: original.revision });
  assert.equal(await digestChunkSnapshot(revisionReset), beforeDigest);
});
