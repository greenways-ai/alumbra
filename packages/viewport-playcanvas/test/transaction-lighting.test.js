import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  getBlock,
  patchChunk,
} from "@greenways/alumbra-core";
import { createWorldRuntime } from "@greenways/alumbra-engine";
import {
  VIEWPORT_LIGHTING_TRANSACTION_FORMAT,
  createViewportLightingCoordinator,
  routeAcceptedLightingTransaction,
} from "../src/index.js";

const registry = () => createBlockRegistry([
  {
    id: "transaction-light/air",
    empty: true,
    metadata: {
      physics: { solid: false },
      render: { visible: false, opaque: false },
      light: { opacity: 0, emission: 0 },
    },
  },
  {
    id: "transaction-light/stone",
    metadata: {
      physics: { solid: true },
      render: { color: [0.4, 0.45, 0.5], opaque: true },
      light: { opacity: 15, emission: 0 },
    },
  },
  {
    id: "transaction-light/lamp",
    metadata: {
      physics: { solid: true },
      render: { color: [1, 0.45, 0.12], emissive: [1, 0.25, 0.04], opaque: true },
      light: { opacity: 15, emission: 15 },
    },
  },
], { id: "transaction-light/registry", version: "0.1.0" });

const chunks = (blockRegistry) => {
  const shape = [4, 4, 4];
  const left = patchChunk(createChunk({
    registry: blockRegistry,
    coord: [-1, 0, 0],
    shape,
    fill: "transaction-light/air",
  }), [
    { local: [3, 1, 1], value: "transaction-light/lamp" },
    { local: [0, 0, 0], value: "transaction-light/stone" },
  ], blockRegistry, { revision: 1 });
  const right = patchChunk(createChunk({
    registry: blockRegistry,
    coord: [0, 0, 0],
    shape,
    fill: "transaction-light/air",
  }), [{ local: [3, 0, 3], value: "transaction-light/stone" }], blockRegistry, { revision: 1 });
  return [left, right];
};

function fakeRenderer() {
  const records = new Map();
  let destroyed = 0;
  return {
    installChunkMesh({ chunk, mesh }) {
      records.set(chunk.key, { chunk, mesh });
      return { key: chunk.key, revision: chunk.revision };
    },
    removeChunk(key) {
      return { removed: records.delete(String(key)), resources: 0 };
    },
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

const removeLamp = (chunk) => ({
  id: "transaction-light/remove-lamp",
  expectedRevisions: [{ chunk: chunk.coord, revision: chunk.revision }],
  changes: [{
    chunk: chunk.coord,
    local: [3, 1, 1],
    before: "transaction-light/lamp",
    after: "transaction-light/air",
  }],
  metadata: { action: "remove-boundary-lamp" },
});

test("accepted Core transactions route exact post chunks into bounded lighting invalidation", async () => {
  const blockRegistry = registry();
  const initial = chunks(blockRegistry);
  const world = createWorldRuntime({
    registry: blockRegistry,
    chunks: initial,
    missingChunkPolicy: "empty",
    worldId: "world:transaction-light",
  });
  const renderer = fakeRenderer();
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks: initial,
    renderer,
    autoProject: false,
  });
  await coordinator.project();
  assert.equal(coordinator.getField([0, 0, 0]).emittedAt([0, 1, 1]), 14);

  const removed = world.apply(removeLamp(world.getChunk([-1, 0, 0])));
  const receipt = routeAcceptedLightingTransaction({
    acceptance: removed,
    getChunk: world.getChunk,
    coordinator,
  });
  assert.equal(receipt.format, VIEWPORT_LIGHTING_TRANSACTION_FORMAT);
  assert.equal(receipt.applied, true);
  assert.equal(receipt.transactionId, "transaction-light/remove-lamp");
  assert.deepEqual(receipt.changedKeys, ["-1,0,0"]);
  assert.deepEqual(receipt.affectedKeys, ["-1,0,0", "0,0,0"]);
  assert.deepEqual(receipt.revisions, [{ key: "-1,0,0", before: 1, after: 2 }]);
  assert.equal(receipt.after.requestVersion, receipt.before.requestVersion + 1);

  await coordinator.project();
  assert.equal(coordinator.getField([0, 0, 0]).emittedAt([0, 1, 1]), 0);
  assert.equal(getBlock(world.getChunk([-1, 0, 0]), [3, 1, 1]).id, "transaction-light/air");

  const restored = world.undo({ id: "transaction-light/restore-lamp" });
  const restoreReceipt = routeAcceptedLightingTransaction({
    acceptance: restored,
    getChunk: world.getChunk,
    coordinator,
  });
  assert.equal(restoreReceipt.applied, true);
  assert.deepEqual(restoreReceipt.affectedKeys, ["-1,0,0", "0,0,0"]);
  await coordinator.project();
  assert.equal(coordinator.getField([0, 0, 0]).emittedAt([0, 1, 1]), 14);

  const repeated = routeAcceptedLightingTransaction({
    acceptance: restored,
    getChunk: world.getChunk,
    coordinator,
  });
  assert.equal(repeated.applied, false);
  assert.deepEqual(repeated.affectedKeys, []);

  await coordinator.destroy();
  assert.equal(renderer.destroyed, 1);
});

test("stale or malformed acceptance fails before mutating coordinator state", async () => {
  const blockRegistry = registry();
  const initial = chunks(blockRegistry);
  const world = createWorldRuntime({ registry: blockRegistry, chunks: initial, missingChunkPolicy: "empty" });
  const coordinator = createViewportLightingCoordinator({
    registry: blockRegistry,
    chunks: initial,
    renderer: fakeRenderer(),
    autoProject: false,
  });
  await coordinator.project();
  const before = coordinator.evidence();
  const removed = world.apply(removeLamp(world.getChunk([-1, 0, 0])));
  world.undo({ id: "transaction-light/restore-lamp" });

  assert.throws(
    () => routeAcceptedLightingTransaction({
      acceptance: removed,
      getChunk: world.getChunk,
      coordinator,
    }),
    (error) => error.code === "viewport-lighting-transaction/chunk-revision",
  );
  assert.equal(coordinator.evidence().requestVersion, before.requestVersion);

  assert.throws(
    () => routeAcceptedLightingTransaction({
      acceptance: { ...removed, affected: [] },
      getChunk: world.getChunk,
      coordinator,
    }),
    (error) => error.code === "viewport-lighting-transaction/affected",
  );
  assert.equal(coordinator.evidence().requestVersion, before.requestVersion);
  await coordinator.destroy();
});
