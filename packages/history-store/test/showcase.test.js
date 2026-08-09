import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEdn } from "../../../scripts/lib/edn.mjs";
import { createHistorySession } from "@greenways/alumbra-history";
import { loadHistoryArchive, saveHistoryArchive } from "../src/archive.js";
import { createMemoryHistoryBlobStore } from "../src/store.js";
import { change, chunks, pins, registry, world } from "./fixtures.js";

const packageRoot = new URL("../", import.meta.url);
const readEdn = async (relative) => parseEdn(await readFile(new URL(relative, packageRoot), "utf8"));

async function fixture() {
  const blockRegistry = registry();
  const initial = chunks(blockRegistry);
  const session = createHistorySession({ world, registry: blockRegistry, chunks: initial, pins });
  const base = await session.checkpoint({
    id: "history-store/showcase-base",
    name: "history/base",
    setBase: true,
  });
  await session.append({ sequence: 1, transaction: change(initial) });
  return { blockRegistry, session, base };
}

test("History Store Showcase derives unique writes and deterministic reuse", async () => {
  const state = await readEdn("showcase/states/content-addressed-archive.edn");
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const options = {
    id: state.archive.id,
    base,
    records: session.records(),
    named: [{ name: state.archive["named-checkpoints"][0], bundle: base }],
    registry: blockRegistry,
    store,
  };
  const first = await saveHistoryArchive(options);
  const second = await saveHistoryArchive(options);

  assert.equal(base.snapshotDigests.length, state.archive["snapshot-count"]);
  assert.equal(first.writtenSnapshots, state["first-save"]["written-snapshots"]);
  assert.equal(first.reusedSnapshots, state["first-save"]["reused-snapshots"]);
  assert.equal(first.archiveWritten, state["first-save"]["archive-written"]);
  assert.equal(second.digest === first.digest, state["repeated-save"]["same-archive-identity"]);
  assert.equal(second.writtenSnapshots, state["repeated-save"]["written-snapshots"]);
  assert.equal(second.reusedSnapshots, state["repeated-save"]["reused-snapshots"]);
  assert.equal(second.archiveWritten, state["repeated-save"]["archive-written"]);
  assert.deepEqual(base.snapshotDigests.map((digest) => store.putCount(digest)), state["repeated-save"]["snapshot-write-counts"]);
});

test("History Store Showcase verifies replay and named restore before exposing state", async () => {
  const state = await readEdn("showcase/states/content-addressed-archive.edn");
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const saved = await saveHistoryArchive({
    id: state.archive.id,
    base,
    records: session.records(),
    named: [{ name: state.archive["named-checkpoints"][0], bundle: base }],
    registry: blockRegistry,
    store,
  });
  const loaded = await loadHistoryArchive({ digest: saved.digest, store, registry: blockRegistry });
  const restored = await loaded.restore(state.archive["named-checkpoints"][0]);

  assert.equal(loaded.sequence, state["verified-load"]["head-sequence"]);
  assert.equal(loaded.semanticHeadDigest === await session.headDigest(), state["verified-load"]["semantic-head-matches"]);
  assert.equal(restored.semanticHeadDigest === base.checkpoint.semanticHeadDigest, state["verified-load"]["named-restore-matches"]);
});

test("History Store Showcase failure cases remain fail closed and write-last", async () => {
  const state = await readEdn("showcase/states/content-addressed-archive.edn");
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const first = await saveHistoryArchive({
    id: state.archive.id,
    base,
    records: session.records(),
    registry: blockRegistry,
    metadata: { generation: 1 },
    store,
  });
  const missingDigest = base.snapshotDigests[0];
  await store.delete(missingDigest);
  const missing = state["failure-cases"].find((entry) => entry.case === "missing-snapshot");
  await assert.rejects(
    loadHistoryArchive({ digest: first.digest, store, registry: blockRegistry }),
    (error) => missing["accepted-error-codes"].includes(error.code),
  );

  const cleanStore = createMemoryHistoryBlobStore();
  const clean = await saveHistoryArchive({
    id: `${state.archive.id}-tamper`,
    base,
    records: session.records(),
    registry: blockRegistry,
    store: cleanStore,
  });
  const tamperedStore = {
    has: cleanStore.has,
    put: cleanStore.put,
    async get(digest) {
      const bytes = await cleanStore.get(digest);
      if (digest === missingDigest) bytes[0] ^= 0xff;
      return bytes;
    },
  };
  const tampered = state["failure-cases"].find((entry) => entry.case === "tampered-snapshot");
  await assert.rejects(
    loadHistoryArchive({ digest: clean.digest, store: tamperedStore, registry: blockRegistry }),
    (error) => error.code === tampered["error-code"],
  );

  const stableStore = createMemoryHistoryBlobStore();
  const stable = await saveHistoryArchive({
    id: `${state.archive.id}-stable`,
    base,
    records: session.records(),
    registry: blockRegistry,
    metadata: { generation: 1 },
    store: stableStore,
  });
  const failing = {
    has: stableStore.has,
    get: stableStore.get,
    async put(digest, bytes) {
      if (bytes[0] === 0x7b) throw new Error("Injected manifest publication failure");
      return stableStore.put(digest, bytes);
    },
  };
  await assert.rejects(saveHistoryArchive({
    id: `${state.archive.id}-stable`,
    base,
    records: session.records(),
    registry: blockRegistry,
    metadata: { generation: 2 },
    store: failing,
  }), /manifest publication failure/);
  const loaded = await loadHistoryArchive({ digest: stable.digest, store: stableStore, registry: blockRegistry });
  const manifestFailure = state["failure-cases"].find((entry) => entry.case === "manifest-publication-failure");
  assert.equal(loaded.semanticHeadDigest === stable.archive.semanticHeadDigest, manifestFailure["prior-archive-readable"]);
  assert.equal(manifestFailure["current-pointer-advanced"], false);
});
