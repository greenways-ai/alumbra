import assert from "node:assert/strict";
import test from "node:test";
import { MESH_LIGHT_SNAPSHOT_FORMAT } from "../src/mesh-light.js";
import { buildChunkMesh } from "../src/mesh.js";
import { createLocalMeshWorker } from "../src/mesh-worker.js";
import { createTestRegistry, solidChunk } from "./fixtures.js";

const snapshot = (chunk, {
  generation = 1,
  epoch = 0,
  sunlight = 9,
  emitted = 2,
  sourceRevision = chunk.revision,
} = {}) => ({
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId: "alumbra/lighting-default",
  generation,
  epoch,
  maxLevel: 15,
  key: chunk.key,
  coord: chunk.coord,
  shape: chunk.shape,
  sourceRevision,
  sunlight: new Uint8Array(chunk.volume).fill(sunlight),
  emitted: new Uint8Array(chunk.volume).fill(emitted),
});

test("local mesh worker captures and returns exact light-field evidence", async () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { shape: [2, 2, 2], revision: 3 });
  const worker = createLocalMeshWorker({
    buildMesh: ({ chunk: current, lightSnapshots }) => buildChunkMesh({
      chunk: current,
      registry,
      lightSnapshots,
    }),
  });
  const result = await worker.submit({
    id: "mesh/light-1",
    chunkKey: chunk.key,
    revision: chunk.revision,
    chunk,
    lightSnapshots: [snapshot(chunk)],
  });

  assert.equal(result.chunkKey, chunk.key);
  assert.equal(result.revision, 3);
  assert.deepEqual(result.lighting, result.mesh.lighting);
  assert.deepEqual([...new Set(result.mesh.groups[0].sunlight)], [9]);
  assert.deepEqual([...new Set(result.mesh.groups[0].emitted)], [2]);
  assert.deepEqual(worker.stats(), {
    pending: 0,
    running: 0,
    completed: 1,
    cancelled: 0,
    failed: 0,
  });
  await worker.destroy();
});

test("local mesh worker rejects stale target snapshots before queueing", async () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { revision: 4 });
  const worker = createLocalMeshWorker({
    buildMesh: ({ chunk: current, lightSnapshots }) => buildChunkMesh({
      chunk: current,
      registry,
      lightSnapshots,
    }),
  });
  assert.throws(
    () => worker.submit({
      id: "mesh/stale-light",
      chunkKey: chunk.key,
      revision: chunk.revision,
      chunk,
      lightSnapshots: [snapshot(chunk, { sourceRevision: 3 })],
    }),
    (error) => error.code === "mesh-light/target-revision",
  );
  await worker.destroy();
});

test("local mesh worker rejects a result with substituted lighting evidence", async () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { revision: 2 });
  const worker = createLocalMeshWorker({
    buildMesh: ({ chunk: current, lightSnapshots }) => {
      const mesh = buildChunkMesh({ chunk: current, registry, lightSnapshots });
      return {
        ...mesh,
        lighting: {
          ...mesh.lighting,
          generation: mesh.lighting.generation + 1,
        },
      };
    },
  });
  await assert.rejects(
    worker.submit({
      id: "mesh/substituted-light",
      chunkKey: chunk.key,
      revision: chunk.revision,
      chunk,
      lightSnapshots: [snapshot(chunk)],
    }),
    /light-field evidence does not match/,
  );
  assert.equal(worker.stats().failed, 1);
  await worker.destroy();
});

test("unlit worker jobs preserve the previous request and result shape", async () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry);
  let requestKeys = null;
  const worker = createLocalMeshWorker({
    buildMesh: (request) => {
      requestKeys = Object.keys(request).sort();
      return buildChunkMesh({ chunk: request.chunk, registry });
    },
  });
  const result = await worker.submit({
    id: "mesh/unlit",
    chunkKey: chunk.key,
    revision: chunk.revision,
    chunk,
  });
  assert.deepEqual(requestKeys, ["chunk", "chunkKey", "context", "revision", "signal"]);
  assert.equal(Object.hasOwn(result, "lighting"), false);
  assert.equal(Object.hasOwn(result.mesh, "lighting"), false);
  await worker.destroy();
});
