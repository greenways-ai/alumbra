import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import { buildChunkMesh } from "@greenways/alumbra-renderer-playcanvas";
import {
  VIEWPORT_LIGHTING_EVIDENCE_FORMAT,
  createViewportLightingCoordinator,
} from "../src/lighting-coordinator.js";

const registry = () => createBlockRegistry([
  {
    id: "viewport-light/air",
    empty: true,
    metadata: {
      physics: { solid: false },
      render: { visible: false, opaque: false },
    },
  },
  {
    id: "viewport-light/stone",
    metadata: {
      physics: { solid: true },
      render: { color: [0.42, 0.46, 0.52], opaque: true },
    },
  },
  {
    id: "viewport-light/lamp",
    metadata: {
      physics: { solid: true },
      render: { color: [1, 0.55, 0.16], emissive: [1, 0.3, 0.05], opaque: true },
      light: { emission: 15 },
    },
  },
], {
  id: "viewport-light/test-registry",
  version: "0.1.0",
});

const airChunk = (blockRegistry, coord, shape = [4, 4, 4]) => createChunk({
  registry: blockRegistry,
  coord,
  shape,
  fill: "viewport-light/air",
});

function litPair(blockRegistry) {
  const left = patchChunk(airChunk(blockRegistry, [-1, 0, 0]), [{
    local: [3, 1, 1],
    value: "viewport-light/lamp",
  }], blockRegistry, { revision: 1 });
  const right = patchChunk(airChunk(blockRegistry, [0, 0, 0]), [{
    local: [1, 1, 1],
    value: "viewport-light/stone",
  }], blockRegistry, { revision: 1 });
  return [left, right];
}

function fakeRenderer() {
  const records = new Map();
  const installs = [];
  let destroyed = 0;
  return {
    records,
    installs,
    installChunkMesh({ chunk, mesh }) {
      records.set(chunk.key, { chunk, mesh });
      installs.push({ key: chunk.key, revision: chunk.revision, mesh });
      return { key: chunk.key, revision: chunk.revision };
    },
    removeChunk(coordOrKey) {
      const key = Array.isArray(coordOrKey) ? coordOrKey.join(",") : String(coordOrKey);
      return { removed: records.delete(key), resources: 0 };
    },
    stats() {
      const meshes = records.size;
      return {
        chunks: records.size,
        quads: [...records.values()].reduce((sum, record) => sum + record.mesh.quadCount, 0),
        triangles: [...records.values()].reduce((sum, record) => sum + record.mesh.triangleCount, 0),
        meshPool: { resources: meshes, references: meshes },
        materialPool: { resources: meshes, references: meshes },
      };
    },
    destroy() {
      destroyed += 1;
      records.clear();
    },
    get destroyed() { return destroyed; },
  };
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
};

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition not reached");
};

test("coordinator projects cross-chunk Engine light into deterministic renderer meshes", async () => {
  const blockRegistry = registry();
  const chunks = litPair(blockRegistry);
  const renderer = fakeRenderer();
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks,
    renderer,
    autoProject: false,
  });

  const evidence = await coordinator.project();
  assert.equal(evidence.format, VIEWPORT_LIGHTING_EVIDENCE_FORMAT);
  assert.equal(evidence.status, "ready");
  assert.equal(evidence.loadedChunks, 2);
  assert.equal(evidence.installedChunks, 2);
  assert.equal(evidence.maximumEmitted, 15);
  assert.equal(evidence.maximumCombined, 15);
  assert.deepEqual(renderer.installs.map(({ key }) => key), ["-1,0,0", "0,0,0"]);

  const right = renderer.records.get("0,0,0").mesh;
  assert.ok(right.lighting);
  assert.ok(right.groups.every((group) => group.sunlight.length === group.vertexCount));
  assert.ok(right.groups.every((group) => group.emitted.length === group.vertexCount));
  assert.ok(right.groups.some((group) => [...group.emitted].some((value) => value > 0)));

  const portable = JSON.parse(JSON.stringify(evidence));
  assert.equal(portable.loadedChunks, 2);
  assert.equal("chunks" in portable.lighting, false);
  assert.equal("fields" in portable, false);

  const disposed = await coordinator.destroy();
  assert.equal(disposed.baseline, true);
  assert.equal(renderer.destroyed, 1);
});

test("one chunk update remeshes only the bounded affected set", async () => {
  const blockRegistry = registry();
  const chunks = [0, 1, 2].map((x) => patchChunk(
    airChunk(blockRegistry, [x, 0, 0], [16, 16, 16]),
    [{ local: [8, 0, 8], value: "viewport-light/stone" }],
    blockRegistry,
    { revision: 1 },
  ));
  const renderer = fakeRenderer();
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks,
    renderer,
    autoProject: false,
  });
  await coordinator.project();
  const before = new Map(renderer.installs.map(({ key }) => [
    key,
    renderer.installs.filter((entry) => entry.key === key).length,
  ]));

  const changed = patchChunk(chunks[0], [{
    local: [15, 1, 1],
    value: "viewport-light/lamp",
  }], blockRegistry, { revision: 2 });
  const invalidation = coordinator.updateChunk(changed);
  assert.deepEqual(invalidation.affected, ["0,0,0", "1,0,0"]);
  await coordinator.project();

  const after = new Map([0, 1, 2].map((x) => {
    const key = `${x},0,0`;
    return [key, renderer.installs.filter((entry) => entry.key === key).length];
  }));
  assert.equal(after.get("0,0,0"), before.get("0,0,0") + 1);
  assert.equal(after.get("1,0,0"), before.get("1,0,0") + 1);
  assert.equal(after.get("2,0,0"), before.get("2,0,0"));
  assert.equal(coordinator.evidence().discardedMeshResults, 0);
  await coordinator.destroy();
});

test("out-of-order lighting completion cannot install a stale canonical revision", async () => {
  const blockRegistry = registry();
  const initial = patchChunk(airChunk(blockRegistry, [0, 0, 0]), [{
    local: [1, 1, 1],
    value: "viewport-light/stone",
  }], blockRegistry, { revision: 1 });
  const renderer = fakeRenderer();
  const runs = [];
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks: [initial],
    renderer,
    autoProject: false,
    runLighting(job) {
      const gate = deferred();
      runs.push({ job, gate });
      return gate.promise;
    },
  });

  const projection = coordinator.project();
  await waitFor(() => runs.length === 1);
  const current = patchChunk(initial, [{
    local: [2, 1, 1],
    value: "viewport-light/lamp",
  }], blockRegistry, { revision: 2 });
  coordinator.updateChunk(current);
  runs[0].gate.resolve(runs[0].job.run());
  await waitFor(() => runs.length === 2);
  runs[1].gate.resolve(runs[1].job.run());
  const evidence = await projection;

  assert.deepEqual(renderer.installs.map(({ revision }) => revision), [2]);
  assert.equal(evidence.discardedLightingResults, 1);
  assert.equal(evidence.status, "ready");
  assert.equal(coordinator.getField([0, 0, 0]).sourceRevision, 2);
  await coordinator.destroy();
});


test("out-of-order mesh completion cannot install a stale light sidecar", async () => {
  const blockRegistry = registry();
  const initial = patchChunk(airChunk(blockRegistry, [0, 0, 0]), [{
    local: [1, 1, 1],
    value: "viewport-light/stone",
  }], blockRegistry, { revision: 1 });
  const renderer = fakeRenderer();
  const meshes = [];
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks: [initial],
    renderer,
    autoProject: false,
    runMeshing(request) {
      const gate = deferred();
      meshes.push({ request, gate });
      return gate.promise;
    },
  });

  const projection = coordinator.project();
  await waitFor(() => meshes.length === 1);
  const current = patchChunk(initial, [{
    local: [2, 1, 1],
    value: "viewport-light/lamp",
  }], blockRegistry, { revision: 2 });
  coordinator.updateChunk(current);
  meshes[0].gate.resolve(buildChunkMesh(meshes[0].request));
  await waitFor(() => meshes.length === 2);
  meshes[1].gate.resolve(buildChunkMesh(meshes[1].request));
  const evidence = await projection;

  assert.deepEqual(renderer.installs.map(({ revision }) => revision), [2]);
  assert.equal(evidence.discardedMeshResults, 1);
  assert.equal(evidence.status, "ready");
  await coordinator.destroy();
});

test("chunk eviction releases its projection and remeshes only loaded neighbours", async () => {
  const blockRegistry = registry();
  const [left, right] = litPair(blockRegistry);
  const renderer = fakeRenderer();
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks: [left, right],
    renderer,
    autoProject: false,
  });
  await coordinator.project();
  const rightBefore = renderer.installs.filter(({ key }) => key === right.key).length;

  const removal = coordinator.removeChunk(left.key);
  assert.equal(removal.removed, true);
  assert.equal(renderer.records.has(left.key), false);
  await coordinator.project();
  const evidence = coordinator.evidence();

  assert.equal(evidence.loadedChunks, 1);
  assert.equal(evidence.installedChunks, 1);
  assert.equal(evidence.removalCount, 1);
  assert.equal(renderer.installs.filter(({ key }) => key === right.key).length, rightBefore + 1);
  await coordinator.destroy();
});

test("suspend fences in-flight work, resume projects current state, and destroy is idempotent", async () => {
  const blockRegistry = registry();
  const chunk = patchChunk(airChunk(blockRegistry, [0, 0, 0]), [{
    local: [1, 1, 1],
    value: "viewport-light/lamp",
  }], blockRegistry, { revision: 1 });
  const renderer = fakeRenderer();
  const runs = [];
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks: [chunk],
    renderer,
    autoProject: false,
    runLighting(job) {
      const gate = deferred();
      runs.push({ job, gate });
      return gate.promise;
    },
  });

  const first = coordinator.project();
  await waitFor(() => runs.length === 1);
  coordinator.suspend("hidden");
  runs[0].gate.resolve(runs[0].job.run());
  const suspended = await first;
  assert.equal(suspended.status, "suspended");
  assert.equal(renderer.installs.length, 0);

  coordinator.resume("visible");
  const second = coordinator.project();
  await waitFor(() => runs.length === 2);
  runs[1].gate.resolve(runs[1].job.run());
  const ready = await second;
  assert.equal(ready.status, "ready");
  assert.equal(ready.suspensionCount, 1);
  assert.equal(ready.resumeCount, 1);
  assert.equal(renderer.installs.length, 1);

  const disposed = await coordinator.destroy();
  const repeated = await coordinator.destroy();
  assert.deepEqual(repeated, disposed);
  assert.equal(disposed.baseline, true);
  assert.equal(renderer.destroyed, 1);
});
