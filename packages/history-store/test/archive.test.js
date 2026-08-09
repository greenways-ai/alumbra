import assert from "node:assert/strict";
import test from "node:test";
import {
  createHistorySession,
} from "@greenways/alumbra-history";
import {
  loadHistoryArchive,
  saveHistoryArchive,
} from "../src/archive.js";
import { createMemoryHistoryBlobStore } from "../src/store.js";
import {
  change,
  chunks,
  pins,
  registry,
  world,
} from "./fixtures.js";

async function fixture() {
  const blockRegistry = registry();
  const initial = chunks(blockRegistry);
  const session = createHistorySession({
    world,
    registry: blockRegistry,
    chunks: initial,
    pins,
  });
  const base = await session.checkpoint({
    id: "history-store/base",
    name: "history/base",
    setBase: true,
  });
  await session.append({ sequence: 1, transaction: change(initial) });
  return { blockRegistry, initial, session, base };
}

test("archive saves once by digest and reloads the exact replayed head", async () => {
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const saved = await saveHistoryArchive({
    id: "history-store/archive-1",
    base,
    records: session.records(),
    named: [{ name: "history/start", bundle: base }],
    registry: blockRegistry,
    pins,
    store,
  });

  assert.equal(saved.writtenSnapshots, base.snapshotDigests.length);
  assert.equal(saved.reusedSnapshots, 0);
  assert.equal(saved.archiveWritten, true);
  for (const digest of base.snapshotDigests) assert.equal(store.putCount(digest), 1);

  const loaded = await loadHistoryArchive({ digest: saved.digest, store, registry: blockRegistry });
  assert.equal(loaded.sequence, 1);
  assert.equal(loaded.semanticHeadDigest, await session.headDigest());
  assert.deepEqual(loaded.namedCheckpoints, [{ name: "history/start", root: base.checkpoint.root }]);
  const restoredStart = await loaded.restore("history/start");
  assert.equal(restoredStart.semanticHeadDigest, base.checkpoint.semanticHeadDigest);
});

test("archive identity is deterministic and repeated saves reuse snapshot blobs", async () => {
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const first = await saveHistoryArchive({
    id: "history-store/archive-deterministic",
    base,
    records: session.records(),
    named: [
      { name: "history/zeta", bundle: base },
      { name: "history/alpha", bundle: base },
    ],
    registry: blockRegistry,
    store,
  });
  const second = await saveHistoryArchive({
    id: "history-store/archive-deterministic",
    base,
    records: session.records(),
    named: [
      { name: "history/alpha", bundle: base },
      { name: "history/zeta", bundle: base },
    ],
    registry: blockRegistry,
    store,
  });
  assert.equal(second.digest, first.digest);
  assert.equal(second.writtenSnapshots, 0);
  assert.equal(second.reusedSnapshots, base.snapshotDigests.length);
  assert.equal(second.archiveWritten, false);
  for (const digest of base.snapshotDigests) assert.equal(store.putCount(digest), 1);
});

test("missing or tampered snapshot blobs fail before returning world state", async () => {
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const saved = await saveHistoryArchive({
    id: "history-store/archive-corruption",
    base,
    records: session.records(),
    registry: blockRegistry,
    store,
  });
  const missing = base.snapshotDigests[0];
  await store.delete(missing);
  await assert.rejects(
    loadHistoryArchive({ digest: saved.digest, store, registry: blockRegistry }),
    (error) => error.code === "history/snapshot-missing" || error.code === "history-store/archive-head",
  );

  const cleanStore = createMemoryHistoryBlobStore();
  const clean = await saveHistoryArchive({
    id: "history-store/archive-tamper",
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
      if (digest === base.snapshotDigests[0]) bytes[0] ^= 0xff;
      return bytes;
    },
  };
  await assert.rejects(
    loadHistoryArchive({ digest: clean.digest, store: tamperedStore, registry: blockRegistry }),
    (error) => error.code === "history-store/blob-digest",
  );
});

test("a failed write-last manifest publication leaves the prior archive readable", async () => {
  const { blockRegistry, session, base } = await fixture();
  const store = createMemoryHistoryBlobStore();
  const first = await saveHistoryArchive({
    id: "history-store/archive-stable",
    base,
    records: session.records(),
    registry: blockRegistry,
    metadata: { generation: 1 },
    store,
  });
  const failing = {
    has: store.has,
    get: store.get,
    async put(digest, bytes) {
      if (bytes[0] === 0x7b) throw new Error("Injected manifest publication failure");
      return store.put(digest, bytes);
    },
  };
  await assert.rejects(
    saveHistoryArchive({
      id: "history-store/archive-stable",
      base,
      records: session.records(),
      registry: blockRegistry,
      metadata: { generation: 2 },
      store: failing,
    }),
    /manifest publication failure/,
  );
  const loaded = await loadHistoryArchive({ digest: first.digest, store, registry: blockRegistry });
  assert.equal(loaded.semanticHeadDigest, first.archive.semanticHeadDigest);
});
