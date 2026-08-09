import assert from "node:assert/strict";
import test from "node:test";
import { createChunkResidencyScheduler } from "../src/residency.js";
import { RESIDENCY_EVIDENCE_FORMAT } from "../src/residency-evidence.js";

const chunk = (coord, revision) => Object.freeze({
  key: coord.join(","),
  coord: Object.freeze([...coord]),
  shape: Object.freeze([8, 8, 8]),
  revision,
});

const mesh = (value) => Object.freeze({
  format: "alumbra.chunk-mesh/1",
  chunkKey: value.key,
  coord: value.coord,
  shape: value.shape,
  revision: value.revision,
  groups: Object.freeze([]),
  quadCount: 0,
  triangleCount: 0,
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition not reached");
};

test("residency generates, meshes, installs and evicts in deterministic priority order", async () => {
  const generated = [];
  const installed = [];
  const evicted = [];
  const scheduler = createChunkResidencyScheduler({
    generationConcurrency: 1,
    meshConcurrency: 1,
    generateChunk: async ({coord}) => {
      generated.push(coord.join(","));
      return chunk(coord, 0);
    },
    buildMesh: async ({chunk: value}) => mesh(value),
    installMesh: ({key, revision}) => installed.push(`${key}@${revision}`),
    evictChunk: ({key}) => {
      evicted.push(key);
      return 2;
    },
  });

  scheduler.setDesired([[0, 0, 0], [1, 0, 0]]);
  const ready = await scheduler.drain();
  assert.deepEqual(generated, ["0,0,0", "1,0,0"]);
  assert.deepEqual(installed, ["0,0,0@0", "1,0,0@0"]);
  assert.deepEqual(ready, {
    format: RESIDENCY_EVIDENCE_FORMAT,
    status: "active",
    desiredChunks: 2,
    residentChunks: 2,
    pendingGeneration: 0,
    runningGeneration: 0,
    pendingMeshes: 0,
    runningMeshes: 0,
    meshInstalls: 2,
    discardedStaleJobs: 0,
    evictedResources: 0,
    failedJobs: 0,
  });

  scheduler.setDesired([[1, 0, 0]]);
  assert.deepEqual(evicted, ["0,0,0"]);
  assert.equal(scheduler.evidence().residentChunks, 1);
  assert.equal(scheduler.evidence().evictedResources, 2);
  const disposed = await scheduler.destroy();
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.residentChunks, 0);
  assert.deepEqual(evicted, ["0,0,0", "1,0,0"]);
});

test("a completed stale mesh job cannot replace the current canonical revision", async () => {
  const resolvers = new Map();
  const installed = [];
  const scheduler = createChunkResidencyScheduler({
    generationConcurrency: 1,
    meshConcurrency: 2,
    generateChunk: async ({coord}) => chunk(coord, 0),
    buildMesh: ({chunk: value}) => new Promise((resolve) => {
      resolvers.set(value.revision, () => resolve(mesh(value)));
    }),
    installMesh: ({revision}) => installed.push(revision),
    evictChunk: () => 1,
  });

  scheduler.setDesired([[0, 0, 0]]);
  await waitFor(() => resolvers.has(0));
  scheduler.updateChunk(chunk([0, 0, 0], 1));
  await waitFor(() => resolvers.has(1));

  resolvers.get(1)();
  await waitFor(() => installed.length === 1);
  resolvers.get(0)();
  const evidence = await scheduler.drain();

  assert.deepEqual(installed, [1]);
  assert.equal(evidence.residentChunks, 1);
  assert.equal(evidence.meshInstalls, 1);
  assert.equal(evidence.discardedStaleJobs, 1);
  await scheduler.destroy();
});

test("residency evidence is closed bounded data with no chunks, meshes or handles", async () => {
  const scheduler = createChunkResidencyScheduler({
    generateChunk: async ({coord}) => chunk(coord, 0),
    buildMesh: async ({chunk: value}) => mesh(value),
    installMesh: () => undefined,
  });
  scheduler.setView({
    position: [8, 0, 0],
    shape: [8, 8, 8],
    horizontalDistance: 0,
    verticalDistance: 0,
  });
  const evidence = await scheduler.drain();
  assert.equal(evidence.desiredChunks, 1);
  const allowed = new Set([
    "format", "status", "desiredChunks", "residentChunks",
    "pendingGeneration", "runningGeneration", "pendingMeshes", "runningMeshes",
    "meshInstalls", "discardedStaleJobs", "evictedResources", "failedJobs",
  ]);
  assert.deepEqual(new Set(Object.keys(evidence)), allowed);
  assert.ok(Object.values(evidence).every((value) => typeof value === "string" || typeof value === "number"));
  await scheduler.destroy();
});
