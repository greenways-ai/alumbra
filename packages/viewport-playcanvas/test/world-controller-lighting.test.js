import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import { createWorldRuntime } from "@greenways/alumbra-engine";
import {
  VIEWPORT_LIGHTING_TRANSACTION_FORMAT,
  createPlayableWorldController,
  createViewportLitRenderer,
} from "../src/index.js";

function createRegistry() {
  return createBlockRegistry([
    {
      id: "ordinary-edit/air",
      empty: true,
      metadata: {
        physics: { solid: false, replaceable: true },
        render: { visible: false, opaque: false },
        light: { opacity: 0, emission: 0 },
      },
    },
    {
      id: "ordinary-edit/stone",
      metadata: {
        physics: { solid: true, breakable: true, replaceable: false },
        render: { color: [0.34, 0.38, 0.44], opaque: true },
        light: { opacity: 15, emission: 0 },
      },
    },
    {
      id: "ordinary-edit/stone-alt",
      metadata: {
        physics: { solid: true, breakable: true, replaceable: false },
        render: { color: [0.46, 0.42, 0.36], opaque: true },
        light: { opacity: 15, emission: 0 },
      },
    },
    {
      id: "ordinary-edit/lamp",
      metadata: {
        physics: { solid: true, breakable: true, replaceable: false },
        render: {
          profile: "alumbra/material-emissive",
          color: [0.9, 0.3, 0.08],
          emissive: [1, 0.2, 0.03],
          opaque: true,
        },
        light: { opacity: 15, emission: 15 },
      },
    },
  ], { id: "ordinary-edit/registry", version: "0.1.0" });
}

function floorUpdates() {
  const updates = [];
  for (let z = 0; z < 4; z += 1) {
    for (let x = 0; x < 4; x += 1) updates.push({ local: [x, 0, z], value: "ordinary-edit/stone" });
  }
  return updates;
}

function createFixture() {
  const registry = createRegistry();
  const shape = [4, 4, 4];
  const left = patchChunk(createChunk({
    registry,
    coord: [-1, 0, 0],
    shape,
    fill: "ordinary-edit/air",
  }), [
    ...floorUpdates(),
    { local: [2, 1, 3], value: "ordinary-edit/stone" },
  ], registry, { revision: 1 });
  const shaft = [];
  for (const y of [1, 2]) {
    shaft.push(
      { local: [0, y, 1], value: "ordinary-edit/stone" },
      { local: [2, y, 1], value: "ordinary-edit/stone" },
      { local: [1, y, 0], value: "ordinary-edit/stone" },
      { local: [1, y, 2], value: "ordinary-edit/stone" },
    );
  }
  const right = patchChunk(createChunk({
    registry,
    coord: [0, 0, 0],
    shape,
    fill: "ordinary-edit/air",
  }), [
    ...floorUpdates(),
    ...shaft,
    { local: [1, 3, 1], value: "ordinary-edit/stone" },
  ], registry, { revision: 1 });
  const distant = patchChunk(createChunk({
    registry,
    coord: [5, 0, 0],
    shape,
    fill: "ordinary-edit/air",
  }), [
    ...floorUpdates(),
    { local: [1, 1, 1], value: "ordinary-edit/stone" },
  ], registry, { revision: 1 });
  const chunks = [left, right, distant];
  const world = createWorldRuntime({
    registry,
    chunks,
    missingChunkPolicy: "empty",
    worldId: "world:ordinary-edit-lighting",
  });
  return { registry, chunks, world };
}

function fakeRenderer() {
  const records = new Map();
  let serial = 0;
  let destroyed = 0;
  return {
    installChunkMesh({ chunk, mesh }) {
      const handle = Object.freeze({ serial: ++serial, key: chunk.key, revision: chunk.revision });
      records.set(chunk.key, { chunk, mesh, handle });
      return handle;
    },
    removeChunk(key) {
      return { removed: records.delete(String(key)), resources: 0 };
    },
    record(key) { return records.get(String(key)) ?? null; },
    stats() {
      const resources = records.size;
      return {
        chunks: records.size,
        quads: [...records.values()].reduce((sum, record) => sum + record.mesh.quadCount, 0),
        triangles: [...records.values()].reduce((sum, record) => sum + record.mesh.triangleCount, 0),
        meshPool: { resources, references: resources },
        materialPool: { resources, references: resources },
      };
    },
    destroy() {
      destroyed += 1;
      records.clear();
    },
    get destroyed() { return destroyed; },
  };
}

function delayOnce() {
  let armed = false;
  let used = false;
  let start;
  let release;
  return {
    arm() {
      armed = true;
      used = false;
      const started = new Promise((resolve) => { start = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      this.started = started;
      this.released = released;
    },
    async run(job) {
      if (!armed || used) return job.run();
      used = true;
      start({ generation: job.generation, epoch: job.epoch });
      await this.released;
      armed = false;
      return job.run();
    },
    release() { release(); },
    started: Promise.resolve(null),
    released: Promise.resolve(),
  };
}

async function createHarness({ gate = null } = {}) {
  const fixture = createFixture();
  const renderer = fakeRenderer();
  const projection = createViewportLitRenderer({
    registry: fixture.registry,
    chunks: fixture.chunks,
    renderer,
    autoProject: false,
    ...(gate == null ? {} : { runLighting: (job) => gate.run(job) }),
  });
  await projection.project();
  const controller = createPlayableWorldController({ world: fixture.world, renderer: projection });
  return { ...fixture, renderer, projection, controller };
}

const breakRoof = () => ({
  type: "break",
  origin: [1.5, 4.5, 1.5],
  hit: { voxel: [1, 3, 1], face: "up", normal: [0, 1, 0], previous: [1, 4, 1] },
});

const placeBoundaryLamp = () => ({
  type: "place",
  origin: [-1.5, 2.6, 3.5],
  hit: { voxel: [-2, 1, 3], face: "east", normal: [1, 0, 0], previous: [-1, 1, 3] },
  block: "ordinary-edit/lamp",
  playerPosition: [1.5, 1, 1.5],
});

const breakBoundaryLamp = () => ({
  type: "break",
  origin: [-1.5, 2.6, 3.5],
  hit: { voxel: [-1, 1, 3], face: "east", normal: [1, 0, 0], previous: [0, 1, 3] },
});

test("ordinary roof break routes its accepted Core result into bounded sunlight reprojection", async () => {
  const { world, renderer, projection, controller } = await createHarness();
  const distantHandle = renderer.record("5,0,0").handle;
  const beforeSunlight = projection.getField([0, 0, 0]).sunlightAt([1, 2, 1]);
  assert.equal(beforeSunlight, 0);
  const beforeVersion = projection.lightingEvidence().requestVersion;

  const opened = controller.applyAction(breakRoof());
  assert.equal(opened.transaction.id, "build/1/break");
  assert.equal(opened.viewportReceipt.format, VIEWPORT_LIGHTING_TRANSACTION_FORMAT);
  assert.equal(opened.viewportReceipt.applied, true);
  assert.deepEqual(opened.viewportReceipt.changedKeys, ["0,0,0"]);
  assert.deepEqual(opened.viewportReceipt.affectedKeys, ["-1,0,0", "0,0,0"]);
  assert.equal(opened.viewportReceipt.after.requestVersion, beforeVersion + 1);
  assert.equal(renderer.record("5,0,0").handle, distantHandle);

  await projection.project();
  assert.ok(projection.getField([0, 0, 0]).sunlightAt([1, 2, 1]) > beforeSunlight);
  assert.equal(renderer.record("5,0,0").handle, distantHandle);

  const restored = controller.undo();
  assert.equal(restored.transaction.id, "build/2/undo");
  assert.equal(restored.viewportReceipt.format, VIEWPORT_LIGHTING_TRANSACTION_FORMAT);
  await projection.project();
  assert.equal(projection.getField([0, 0, 0]).sunlightAt([1, 2, 1]), beforeSunlight);
  assert.equal(renderer.record("5,0,0").handle, distantHandle);
  assert.equal(world.getChunk([0, 0, 0]).revision, 3);

  await projection.destroy();
  assert.equal(renderer.destroyed, 1);
});

test("ordinary lamp place and break update emitted light across the negative boundary", async () => {
  const { renderer, projection, controller } = await createHarness();
  const distantHandle = renderer.record("5,0,0").handle;
  const beforeEmission = projection.getField([0, 0, 0]).emittedAt([0, 1, 3]);
  assert.equal(beforeEmission, 0);

  const placed = controller.applyAction(placeBoundaryLamp());
  assert.equal(placed.transaction.id, "build/1/place");
  assert.deepEqual(placed.viewportReceipt.changedKeys, ["-1,0,0"]);
  assert.deepEqual(placed.viewportReceipt.affectedKeys, ["-1,0,0", "0,0,0"]);
  await projection.project();
  assert.ok(projection.getField([0, 0, 0]).emittedAt([0, 1, 3]) > beforeEmission);
  assert.equal(renderer.record("5,0,0").handle, distantHandle);

  const removed = controller.applyAction(breakBoundaryLamp());
  assert.equal(removed.transaction.id, "build/2/break");
  assert.equal(removed.viewportReceipt.format, VIEWPORT_LIGHTING_TRANSACTION_FORMAT);
  await projection.project();
  assert.equal(projection.getField([0, 0, 0]).emittedAt([0, 1, 3]), beforeEmission);
  assert.equal(renderer.record("5,0,0").handle, distantHandle);

  await projection.destroy();
});

test("rejected ordinary edits do not invalidate and an older rebuild cannot install", async () => {
  const gate = delayOnce();
  const { world, renderer, projection, controller } = await createHarness({ gate });
  const beforeRevision = world.getChunk([-1, 0, 0]).revision;
  const beforeLighting = projection.lightingEvidence();
  const beforeHandle = renderer.record("5,0,0").handle;

  assert.throws(() => controller.applyAction({
    ...placeBoundaryLamp(),
    playerPosition: [-0.5, 1, 3.5],
  }), /intersects the player/);
  assert.equal(world.getChunk([-1, 0, 0]).revision, beforeRevision);
  assert.equal(projection.lightingEvidence().requestVersion, beforeLighting.requestVersion);
  assert.equal(controller.state.transactionSequence, 0);

  gate.arm();
  const placed = controller.applyAction(placeBoundaryLamp());
  const staleProjection = projection.project();
  const delayed = await gate.started;
  const removed = controller.applyAction(breakBoundaryLamp());
  assert.ok(removed.viewportReceipt.after.requestVersion > placed.viewportReceipt.after.requestVersion);
  gate.release();
  await staleProjection;
  await projection.drain();

  const after = projection.lightingEvidence();
  assert.ok(delayed.generation > 0);
  assert.ok(after.discardedLightingResults > beforeLighting.discardedLightingResults);
  assert.equal(after.lighting.requestedGeneration, after.lighting.installedGeneration);
  assert.equal(projection.getField([-1, 0, 0]).sourceRevision, world.getChunk([-1, 0, 0]).revision);
  assert.equal(projection.getField([0, 0, 0]).emittedAt([0, 1, 3]), 0);
  assert.equal(renderer.record("5,0,0").handle, beforeHandle);

  await projection.destroy();
});

test("ordinary place retains a loaded candidate whose sampled projection inputs are exact", async () => {
  const registry = createRegistry();
  const shape = [8, 4, 8];
  const left = createChunk({
    registry,
    coord: [-1, 0, 0],
    shape,
    revision: 1,
    fill: "ordinary-edit/stone",
  });
  const right = patchChunk(createChunk({
    registry,
    coord: [0, 0, 0],
    shape,
    revision: 1,
    fill: "ordinary-edit/stone",
  }), [{ local: [6, 1, 6], value: "ordinary-edit/air" }], registry, { revision: 2 });
  const distant = createChunk({
    registry,
    coord: [5, 0, 0],
    shape,
    revision: 1,
    fill: "ordinary-edit/stone",
  });
  const chunks = [left, right, distant];
  const world = createWorldRuntime({
    registry,
    chunks,
    missingChunkPolicy: "empty",
    worldId: "world:ordinary-edit-retention",
  });
  const renderer = fakeRenderer();
  const projection = createViewportLitRenderer({
    registry,
    chunks,
    renderer,
    autoProject: false,
  });
  await projection.project();
  const controller = createPlayableWorldController({ world, renderer: projection });
  const leftHandle = renderer.record("-1,0,0").handle;
  const rightHandle = renderer.record("0,0,0").handle;
  const distantHandle = renderer.record("5,0,0").handle;
  const before = projection.lightingEvidence();

  const accepted = controller.applyAction({
    type: "place",
    origin: [6.5, 2.5, 6.5],
    hit: { voxel: [6, 0, 6], face: "up", normal: [0, 1, 0], previous: [6, 1, 6] },
    block: "ordinary-edit/stone-alt",
    playerPosition: [2.5, 1, 2.5],
  });
  assert.deepEqual(accepted.viewportReceipt.affectedKeys, ["-1,0,0", "0,0,0"]);
  await projection.project();

  const after = projection.lightingEvidence();
  assert.equal(renderer.record("-1,0,0").handle, leftHandle);
  assert.notEqual(renderer.record("0,0,0").handle, rightHandle);
  assert.equal(renderer.record("5,0,0").handle, distantHandle);
  assert.equal(after.meshInstalls, before.meshInstalls + 1);
  assert.equal(after.retainedProjections, before.retainedProjections + 1);
  assert.deepEqual(after.lastRetainedKeys, ["-1,0,0"]);
  assert.equal(world.getChunk([0, 0, 0]).revision, 3);

  await projection.destroy();
  assert.equal(projection.lightingEvidence().baseline, true);
});
