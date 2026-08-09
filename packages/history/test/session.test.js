import assert from "node:assert/strict";
import test from "node:test";
import {
  createHistorySession,
  replayHistory,
} from "../src/session.js";
import {
  createHistoryRegistry,
  firstChange,
  historyChunks,
} from "./fixtures.js";

const world = {
  id: "world:history-session",
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

test("history session appends accepted transactions and replays from a named checkpoint", async () => {
  const registry = createHistoryRegistry();
  const initial = historyChunks(registry);
  const session = createHistorySession({
    world,
    registry,
    chunks: initial,
    pins,
    regionShape: [8, 4, 8],
  });
  const base = await session.checkpoint({
    id: "history/session-base",
    name: "history/base",
    setBase: true,
  });
  const before = await session.headDigest();
  const accepted = await session.append({
    sequence: 1,
    transaction: firstChange(initial),
  });
  const after = await session.headDigest();

  assert.notEqual(after, before);
  assert.equal(accepted.record.sequence, 1);
  assert.deepEqual(accepted.record.affectedRegions, [[0, 0, 0]]);
  assert.equal(accepted.record.semanticHeadDigest, after);

  const replayed = await replayHistory({
    checkpoint: base.checkpoint,
    regions: base.regions,
    getSnapshot: base.getSnapshot,
    records: session.records(),
    registry,
  });
  assert.equal(replayed.sequence, 1);
  assert.equal(replayed.semanticHeadDigest, after);
  assert.equal(replayed.chunks.get("0,0,0").revision, initial.find((chunk) => chunk.key === "0,0,0").revision + 1);
});

test("stale history sequences fail atomically", async () => {
  const registry = createHistoryRegistry();
  const initial = historyChunks(registry);
  const session = createHistorySession({
    world,
    registry,
    chunks: initial,
    pins,
  });
  const before = await session.headDigest();

  await assert.rejects(
    session.append({
      sequence: 2,
      transaction: firstChange(initial),
    }),
    (error) => error.code === "history/sequence-conflict",
  );
  assert.equal(await session.headDigest(), before);
  assert.equal(session.records().length, 0);
});

test("named restore yields the exact prior semantic head", async () => {
  const registry = createHistoryRegistry();
  const initial = historyChunks(registry);
  const session = createHistorySession({
    world,
    registry,
    chunks: initial,
    pins,
  });
  await session.checkpoint({
    id: "history/named-start",
    name: "history/start",
  });
  const start = await session.headDigest();
  await session.append({
    sequence: 1,
    transaction: firstChange(initial),
  });
  assert.notEqual(await session.headDigest(), start);

  const restored = await session.restore("history/start");
  assert.equal(restored.sequence, 0);
  assert.equal(restored.semanticHeadDigest, start);
  assert.equal(await session.headDigest(), start);
  assert.equal(session.records().length, 0);
});

test("compaction resets the transaction prefix while preserving the semantic head", async () => {
  const registry = createHistoryRegistry();
  const initial = historyChunks(registry);
  const session = createHistorySession({
    world,
    registry,
    chunks: initial,
    pins,
  });
  await session.append({
    sequence: 1,
    transaction: firstChange(initial),
  });
  const before = await session.headDigest();
  const compacted = await session.compact({
    id: "history/compacted-head",
    name: "history/compacted",
    metadata: { reason: "bounded fixture compaction" },
  });

  assert.equal(compacted.semanticHeadDigest, before);
  assert.equal(compacted.transactionCount, 0);
  assert.equal(session.records().length, 0);
  const evidence = await session.evidence();
  assert.equal(evidence.baseCheckpointRoot, compacted.checkpoint.root);
  assert.equal(evidence.semanticHeadDigest, before);
  assert.equal(evidence.sequence, 1);
});

test("destroy releases in-memory history authority idempotently", async () => {
  const registry = createHistoryRegistry();
  const session = createHistorySession({
    world,
    registry,
    chunks: historyChunks(registry),
    pins,
  });
  const first = await session.destroy();
  const second = await session.destroy();
  assert.equal(first.status, "destroyed");
  assert.deepEqual(second, first);
  assert.throws(() => session.chunks(), /destroyed/);
});
