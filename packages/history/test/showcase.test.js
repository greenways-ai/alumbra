import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEdn } from "../../../scripts/lib/edn.mjs";
import { chunkToRegionAddress } from "../src/region.js";
import { createHistorySession } from "../src/session.js";
import { createHistoryRegistry, firstChange, historyChunks } from "./fixtures.js";

const packageRoot = new URL("../", import.meta.url);
const readEdn = async (relative) => parseEdn(await readFile(new URL(relative, packageRoot), "utf8"));
const world = { id: "world:history-showcase", version: "0.1.0" };
const pins = {
  generator: {
    package: "hara:greenways/alumbra-hara",
    version: "0.1.0",
    id: "alumbra/fixture-height-field",
    seed: "17",
  },
};

function sessionFixture() {
  const registry = createHistoryRegistry({ id: "alumbra/history-showcase" });
  const chunks = historyChunks(registry);
  const session = createHistorySession({
    world,
    registry,
    chunks,
    pins,
    regionShape: [8, 4, 8],
  });
  return { registry, chunks, session };
}

test("History Showcase derives checkpoint, replay and exact named restore evidence", async () => {
  const state = await readEdn("showcase/states/replay-restore-compact.edn");
  const { chunks, session } = sessionFixture();
  const base = await session.checkpoint({
    id: state["base-checkpoint"].id,
    name: state["base-checkpoint"].name,
    setBase: true,
  });
  const before = await session.headDigest();
  const accepted = await session.append({
    sequence: state["accepted-transaction"].sequence,
    transaction: firstChange(chunks),
  });
  const after = await session.headDigest();
  const named = await session.checkpoint({
    id: state["named-checkpoint"].id,
    name: state["named-checkpoint"].name,
  });
  const restored = await session.restore(state["named-restore"].name);

  assert.deepEqual(chunks.map((chunk) => chunk.coord), state.initial["chunk-coordinates"]);
  assert.deepEqual(
    chunks.map((chunk) => chunkToRegionAddress(chunk.coord, state["region-shape"]).region),
    state.initial["region-coordinates"],
  );
  assert.equal(base.regions.length, state.initial["region-count"]);
  assert.equal(base.snapshotDigests.length, state["base-checkpoint"]["snapshot-count"]);
  assert.deepEqual(accepted.record.affectedRegions, state["accepted-transaction"]["affected-regions"]);
  assert.equal(session.records().length, state["accepted-transaction"]["record-count"]);
  assert.equal(before !== after, state["accepted-transaction"]["head-changed"]);
  assert.equal(restored.sequence, state["named-restore"].sequence);
  assert.equal(restored.semanticHeadDigest === named.checkpoint.semanticHeadDigest, state["named-restore"]["head-matches-checkpoint"]);
});

test("History Showcase compaction preserves the semantic head and clears the prefix", async () => {
  const state = await readEdn("showcase/states/replay-restore-compact.edn");
  const { chunks, session } = sessionFixture();
  await session.append({ sequence: 1, transaction: firstChange(chunks) });
  const before = await session.headDigest();
  assert.equal(session.records().length, state.compaction["transaction-count-before"]);
  const compacted = await session.compact({
    id: state.compaction.id,
    name: state.compaction.name,
  });
  const evidence = await session.evidence();

  assert.equal(compacted.transactionCount, state.compaction["transaction-count-after"]);
  assert.equal(session.records().length, state.compaction["transaction-count-after"]);
  assert.equal(compacted.semanticHeadDigest === before, state.compaction["semantic-head-preserved"]);
  assert.equal(evidence.baseCheckpointRoot === compacted.checkpoint.root, state.compaction["base-checkpoint-replaced"]);
});

test("History Showcase records sequence conflict as an atomic rejection", async () => {
  const state = await readEdn("showcase/states/replay-restore-compact.edn");
  const { chunks, session } = sessionFixture();
  await session.append({ sequence: 1, transaction: firstChange(chunks) });
  const before = await session.headDigest();
  const records = session.records().length;
  await assert.rejects(
    session.append({ sequence: state["rejected-sequence"].requested, transaction: firstChange(chunks) }),
    (error) => error.code === state["rejected-sequence"]["error-code"],
  );
  assert.equal(await session.headDigest(), before);
  assert.equal(session.records().length, records);
  assert.equal(state["rejected-sequence"].accepted, false);
  assert.equal(state["rejected-sequence"]["state-changed"], false);
});
