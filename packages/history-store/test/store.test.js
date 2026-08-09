import assert from "node:assert/strict";
import test from "node:test";
import { digestBlobBytes } from "../src/bytes.js";
import {
  bindHistoryBlobStore,
  createMemoryHistoryBlobStore,
} from "../src/store.js";

test("memory store copies bytes and verifies content-addressed writes", async () => {
  const raw = Uint8Array.from([1, 2, 3, 4]);
  const digest = await digestBlobBytes(raw);
  const store = createMemoryHistoryBlobStore();
  const bound = bindHistoryBlobStore(store);
  await bound.put(digest, raw);
  raw[0] = 99;
  const restored = await bound.get(digest);
  assert.deepEqual([...restored], [1, 2, 3, 4]);
  restored[1] = 88;
  assert.deepEqual([...(await bound.get(digest))], [1, 2, 3, 4]);
  assert.deepEqual(store.stats(), { blobs: 1, writes: 1, uniqueWrites: 1, deleted: 0 });
  await assert.rejects(bound.put(`sha256:${"0".repeat(64)}`, Uint8Array.of(1)), /digest does not match/);
});
