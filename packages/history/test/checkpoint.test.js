import assert from "node:assert/strict";
import test from "node:test";
import {
  digestChunkSnapshot,
} from "@greenways/alumbra-core";
import {
  createWorldCheckpoint,
  restoreWorldCheckpoint,
} from "../src/checkpoint.js";
import {
  createHistoryRegistry,
  historyChunks,
} from "./fixtures.js";

const world = {
  id: "world:history-fixture",
  version: "0.1.0",
};
const pins = {
  generator: {
    package: "hara:greenways/alumbra-hara",
    version: "0.1.0",
    id: "alumbra/fixture-height-field",
    seed: "17",
  },
};

test("checkpoint roots are deterministic across input order and negative regions", async () => {
  const registry = createHistoryRegistry();
  const chunks = historyChunks(registry);
  const left = await createWorldCheckpoint({
    id: "history/checkpoint-1",
    world,
    chunks,
    registry,
    regionShape: [8, 4, 8],
    pins,
    metadata: { label: "fixture" },
  });
  const right = await createWorldCheckpoint({
    id: "history/checkpoint-1",
    world,
    chunks: [...chunks].reverse(),
    registry,
    regionShape: [8, 4, 8],
    pins,
    metadata: { label: "fixture" },
  });

  assert.equal(left.checkpoint.root, right.checkpoint.root);
  assert.equal(left.checkpoint.semanticHeadDigest, right.checkpoint.semanticHeadDigest);
  assert.deepEqual(
    left.regions.map((region) => region.region),
    [[-2, 0, -1], [-1, 0, 0], [0, 0, 0], [1, 0, 0]],
  );
  assert.equal(left.checkpoint.snapshotCount, chunks.length);
  assert.equal(left.snapshotDigests.length, chunks.length);
  assert.ok(Object.isFrozen(left.checkpoint));
  assert.ok(Object.isFrozen(left.regions));
});

test("checkpoint reconstruction verifies every root and restores exact chunks", async () => {
  const registry = createHistoryRegistry();
  const chunks = historyChunks(registry);
  const bundle = await createWorldCheckpoint({
    id: "history/checkpoint-restore",
    world,
    sequence: 7,
    chunks,
    registry,
    pins,
  });
  const restored = await restoreWorldCheckpoint({
    checkpoint: bundle.checkpoint,
    regions: bundle.regions,
    getSnapshot: bundle.getSnapshot,
    registry,
  });

  assert.equal(restored.checkpoint.sequence, 7);
  assert.equal(restored.semanticHeadDigest, bundle.checkpoint.semanticHeadDigest);
  assert.deepEqual(
    [...restored.chunks.keys()].sort(),
    chunks.map((chunk) => chunk.key).sort(),
  );
  for (const chunk of chunks) {
    assert.equal(
      await digestChunkSnapshot(restored.chunks.get(chunk.key)),
      await digestChunkSnapshot(chunk),
    );
  }
});

test("checkpoint restoration fails before returning tampered or missing state", async () => {
  const registry = createHistoryRegistry();
  const bundle = await createWorldCheckpoint({
    id: "history/checkpoint-corruption",
    world,
    chunks: historyChunks(registry),
    registry,
    pins,
  });
  const corruptDigest = bundle.snapshotDigests[0];

  await assert.rejects(
    restoreWorldCheckpoint({
      checkpoint: bundle.checkpoint,
      regions: bundle.regions,
      getSnapshot(digest) {
        const bytes = bundle.getSnapshot(digest);
        if (digest === corruptDigest) bytes[0] ^= 0xff;
        return bytes;
      },
      registry,
    }),
    (error) => error.code === "history/snapshot-digest",
  );

  await assert.rejects(
    restoreWorldCheckpoint({
      checkpoint: bundle.checkpoint,
      regions: bundle.regions,
      getSnapshot(digest) {
        return digest === corruptDigest ? null : bundle.getSnapshot(digest);
      },
      registry,
    }),
    (error) => error.code === "history/snapshot-missing",
  );
});

test("registry drift is rejected and descriptive metadata does not alter the semantic head", async () => {
  const registry = createHistoryRegistry();
  const chunks = historyChunks(registry);
  const first = await createWorldCheckpoint({
    id: "history/checkpoint-metadata-a",
    world,
    chunks,
    registry,
    pins,
    metadata: { label: "A" },
  });
  const second = await createWorldCheckpoint({
    id: "history/checkpoint-metadata-b",
    world,
    chunks,
    registry,
    pins,
    metadata: { label: "B" },
  });

  assert.notEqual(first.checkpoint.root, second.checkpoint.root);
  assert.equal(first.checkpoint.semanticHeadDigest, second.checkpoint.semanticHeadDigest);

  const drifted = createHistoryRegistry({ version: "0.2.0" });
  await assert.rejects(
    restoreWorldCheckpoint({
      checkpoint: first.checkpoint,
      regions: first.regions,
      getSnapshot: first.getSnapshot,
      registry: drifted,
    }),
    (error) => error.code === "history/registry-mismatch",
  );
});
