import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import {
  affectedLightingChunkKeys,
  createLightingRuntime,
} from "../src/lighting-runtime.js";

const registry = () => createBlockRegistry([
  {
    id: "lighting-runtime/air",
    empty: true,
    metadata: { render: { visible: false, opaque: false } },
  },
  {
    id: "lighting-runtime/stone",
    metadata: { render: { opaque: true } },
  },
  {
    id: "lighting-runtime/lamp",
    metadata: { render: { opaque: true }, emittedLight: 15 },
  },
], {
  id: "lighting-runtime/test-registry",
  version: "0.1.0",
});

const createChunks = (blockRegistry) => [0, 1, 2].map((x) => createChunk({
  registry: blockRegistry,
  coord: [x, 0, 0],
  shape: [16, 16, 16],
  fill: "lighting-runtime/air",
}));

test("lighting invalidation is bounded by the maximum propagation radius", () => {
  const blockRegistry = registry();
  const chunks = createChunks(blockRegistry);
  assert.deepEqual(affectedLightingChunkKeys({
    changed: [[0, 0, 0]],
    chunks,
    shape: [16, 16, 16],
    radius: 15,
  }), ["0,0,0", "1,0,0"]);

  const negative = [-2, -1, 0].map((x) => createChunk({
    registry: blockRegistry,
    coord: [x, 0, 0],
    shape: [16, 16, 16],
    fill: "lighting-runtime/air",
  }));
  assert.deepEqual(affectedLightingChunkKeys({
    changed: [[-1, 0, 0]],
    chunks: negative,
    shape: [16, 16, 16],
    radius: 15,
  }), ["-2,0,0", "-1,0,0", "0,0,0"]);
});

test("runtime preserves unaffected fields and rejects stale revision and generation results", () => {
  const blockRegistry = registry();
  const chunks = createChunks(blockRegistry);
  const runtime = createLightingRuntime({ registry: blockRegistry, chunks });
  const initial = runtime.rebuild();

  assert.equal(initial.installation.installed, true);
  assert.equal(runtime.evidence().status, "ready");
  assert.equal(runtime.evidence().validFieldChunks, 3);
  const unaffected = runtime.getField([2, 0, 0]);

  const firstRevision = patchChunk(chunks[0], [{
    local: [15, 1, 1],
    value: "lighting-runtime/lamp",
  }], blockRegistry, { revision: 1 });
  const invalidation = runtime.updateChunk(firstRevision);
  assert.deepEqual(invalidation.affected, ["0,0,0", "1,0,0"]);
  assert.equal(runtime.getField([0, 0, 0]), null);
  assert.equal(runtime.getField([1, 0, 0]), null);
  assert.equal(runtime.getField([2, 0, 0]), unaffected);

  const staleJob = runtime.plan();
  const secondRevision = patchChunk(firstRevision, [{
    local: [1, 1, 1],
    value: "lighting-runtime/stone",
  }], blockRegistry, { revision: 2 });
  runtime.updateChunk(secondRevision);
  const staleResult = staleJob.run();
  const staleRevision = runtime.install(staleResult);
  assert.equal(staleRevision.installed, false);
  assert.equal(staleRevision.reason, "stale-revision");

  const currentJob = runtime.plan();
  const currentResult = currentJob.run();
  const current = runtime.install(currentResult);
  assert.equal(current.installed, true);
  assert.equal(runtime.getField([0, 0, 0]).sourceRevision, 2);
  assert.equal(runtime.getField([1, 0, 0]).emittedAt([0, 1, 1]), 14);

  const staleGeneration = runtime.install(staleResult);
  assert.equal(staleGeneration.installed, false);
  assert.equal(staleGeneration.reason, "stale-generation");
  assert.equal(runtime.evidence().rejectedStaleResults, 2);
});

test("manual invalidation fences an otherwise revision-current job by epoch", () => {
  const blockRegistry = registry();
  const chunks = createChunks(blockRegistry);
  const runtime = createLightingRuntime({ registry: blockRegistry, chunks });
  runtime.rebuild();

  const job = runtime.plan();
  runtime.invalidate([[2, 0, 0]]);
  const rejected = runtime.install(job.run());
  assert.equal(rejected.installed, false);
  assert.equal(rejected.reason, "stale-epoch");

  const rebuilt = runtime.rebuild();
  assert.equal(rebuilt.installation.installed, true);
  assert.equal(runtime.evidence().invalidatedChunks, 0);
});

test("destroy releases all hot field and canonical-chunk references idempotently", () => {
  const blockRegistry = registry();
  const runtime = createLightingRuntime({
    registry: blockRegistry,
    chunks: createChunks(blockRegistry),
  });
  runtime.rebuild();
  const first = runtime.destroy();
  const second = runtime.destroy();

  assert.equal(first.status, "disposed");
  assert.equal(first.loadedChunks, 0);
  assert.equal(first.installedFieldChunks, 0);
  assert.equal(first.invalidatedChunks, 0);
  assert.equal(first.baseline, true);
  assert.deepEqual(second, first);
  assert.throws(
    () => runtime.getField([0, 0, 0]),
    (error) => error.code === "lighting/runtime-destroyed",
  );
});
