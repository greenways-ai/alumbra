import assert from "node:assert/strict";
import test from "node:test";
import {createOrderedJsonStore} from "../src/ordered-store.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

test("ordered store never lets an older queued write overwrite a newer request", async () => {
  let value = null;
  const writes = [];
  const gates = [];
  const backend = {
    getItem: async () => value,
    setItem: async (_key, next) => {
      writes.push(next);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      value = next;
    },
  };
  const store = createOrderedJsonStore({backend, key: "world"});
  const first = store.save({revision: 1}, {sequence: 1});
  while (writes.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const second = store.save({revision: 2}, {sequence: 2});
  assert.equal(writes.length, 1);
  gates[0].resolve();
  const firstResult = await first;
  assert.equal(firstResult.current, false);
  while (writes.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 2);
  gates[1].resolve();
  const secondResult = await second;
  assert.equal(secondResult.current, true);
  assert.deepEqual(JSON.parse(value), {revision: 2});
  assert.deepEqual(await store.load(), {revision: 2});
});

test("ordered store skips stale requests before they reach the backend", async () => {
  const writes = [];
  const backend = {
    getItem: () => null,
    setItem: (_key, value) => { writes.push(value); },
  };
  const store = createOrderedJsonStore({backend, key: "world"});
  const second = await store.save({revision: 2}, {sequence: 2});
  const stale = await store.save({revision: 1}, {sequence: 1});
  assert.equal(second.accepted, true);
  assert.equal(stale.accepted, false);
  assert.equal(writes.length, 1);
  assert.deepEqual(store.state, {latestRequested: 2, latestCommitted: 2, destroyed: false});
});

test("ordered store clear, flush and destroy are deterministic", async () => {
  const records = new Map();
  const backend = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
  const store = createOrderedJsonStore({backend, key: "world"});
  await store.save({ok: true}, {sequence: 1});
  assert.deepEqual(await store.flush(), {latestRequested: 1, latestCommitted: 1});
  await store.clear();
  assert.equal(await store.load(), null);
  store.destroy();
  assert.throws(() => store.save({}, {sequence: 2}), /destroyed/);
  store.destroy();
});
