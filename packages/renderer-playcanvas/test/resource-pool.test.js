import assert from "node:assert/strict";
import test from "node:test";
import { createReferencePool } from "../src/resource-pool.js";

test("reference pool shares resources and destroys them at the final release", () => {
  const destroyed = [];
  const pool = createReferencePool({
    keyOf: (input) => input.id,
    create: (input) => ({ id: input.id }),
    destroy: (value) => destroyed.push(value.id),
  });
  const first = pool.acquire({ id: "shared" });
  const second = pool.acquire({ id: "shared" });
  assert.equal(first.value, second.value);
  assert.deepEqual(pool.stats(), { resources: 1, references: 2 });
  pool.release(first.key);
  assert.deepEqual(destroyed, []);
  pool.release(second.key);
  assert.deepEqual(destroyed, ["shared"]);
  assert.deepEqual(pool.stats(), { resources: 0, references: 0 });
});

test("destroy is deterministic and idempotent", () => {
  let count = 0;
  const pool = createReferencePool({
    keyOf: (value) => value,
    create: (value) => value,
    destroy: () => { count += 1; },
  });
  pool.acquire("one");
  pool.acquire("two");
  pool.destroy();
  pool.destroy();
  assert.equal(count, 2);
  assert.throws(() => pool.acquire("three"), /destroyed/);
});
