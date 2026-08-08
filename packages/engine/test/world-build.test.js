import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBuildIntent,
  createBreakBlockTransaction,
  createPlaceBlockTransaction,
  createWorldRuntime,
} from "../src/index.js";
import {createBlockTransaction, getBlock} from "@greenways/alumbra-core";
import {chunkWithBlocks, createTestRegistry} from "./fixtures.js";

function fixture() {
  const registry = createTestRegistry();
  const chunk = chunkWithBlocks(registry, {
    shape: [8, 8, 8],
    blocks: [
      {local: [2, 1, 2], value: "alumbra/stone"},
      {local: [4, 1, 2], value: "alumbra/bedrock"},
      {local: [5, 1, 2], value: "alumbra/grass"},
    ],
  });
  return {registry, chunk, world: createWorldRuntime({registry, chunks: [chunk], missingChunkPolicy: "solid"})};
}

test("break intent creates and applies one revision-checked Core transaction", () => {
  const {registry, world} = fixture();
  const transaction = createBreakBlockTransaction({
    id: "build/break-1",
    world,
    origin: [2.5, 2.6, 4.5],
    hit: {voxel: [2, 1, 2], face: "south", normal: [0, 0, 1], previous: [2, 1, 3]},
  });
  assert.deepEqual(transaction.expectedRevisions, [{chunk: [0, 0, 0], revision: 0}]);
  assert.equal(transaction.changes[0].before.id, "alumbra/stone");
  assert.equal(transaction.changes[0].after.id, registry.emptyBlock);

  const result = world.apply(transaction);
  assert.deepEqual(result.affected, ["0,0,0"]);
  assert.equal(world.getBlock([2, 1, 2]).id, registry.emptyBlock);
  assert.equal(world.historyLength, 1);
  const undone = world.undo({id: "build/undo-break-1"});
  assert.equal(undone.undone, "build/break-1");
  assert.equal(world.getBlock([2, 1, 2]).id, "alumbra/stone");
  assert.equal(world.historyLength, 0);
});

test("place intent validates reach, replacement and player occupancy", () => {
  const {world} = fixture();
  const hit = {voxel: [2, 1, 2], face: "east", normal: [1, 0, 0], previous: [3, 1, 2]};
  const transaction = createPlaceBlockTransaction({
    id: "build/place-1",
    world,
    origin: [2.5, 2.6, 4.5],
    hit,
    block: "alumbra/stone",
    playerPosition: [1.5, 1, 2.5],
  });
  assert.equal(transaction.changes[0].before.id, "alumbra/air");
  assert.equal(transaction.changes[0].after.id, "alumbra/stone");
  applyBuildIntent(world, {
    type: "place",
    id: "build/place-2",
    origin: [2.5, 2.6, 4.5],
    hit,
    block: "alumbra/stone",
    playerPosition: [1.5, 1, 2.5],
  });
  assert.equal(world.getBlock([3, 1, 2]).id, "alumbra/stone");

  assert.throws(() => createPlaceBlockTransaction({
    id: "build/place-body",
    world: fixture().world,
    origin: [2.5, 2.6, 4.5],
    hit,
    block: "alumbra/stone",
    playerPosition: [3.5, 1, 2.5],
  }), /intersects the player/);
  assert.throws(() => createPlaceBlockTransaction({
    id: "build/place-reach",
    world: fixture().world,
    origin: [30, 30, 30],
    hit,
    block: "alumbra/stone",
  }), /out of reach/);
  assert.throws(() => createPlaceBlockTransaction({
    id: "build/place-solid",
    world: fixture().world,
    origin: [2.5, 2.6, 4.5],
    hit: {voxel: [3, 1, 2], face: "east", normal: [1, 0, 0], previous: [4, 1, 2]},
    block: "alumbra/stone",
  }), /not replaceable/);
});

test("break rejects empty, protected and unloaded targets", () => {
  const {world} = fixture();
  assert.throws(() => createBreakBlockTransaction({
    id: "build/empty",
    world,
    origin: [3.5, 2, 3.5],
    hit: {voxel: [3, 1, 3]},
  }), /empty/);
  assert.throws(() => createBreakBlockTransaction({
    id: "build/protected",
    world,
    origin: [4.5, 2, 3.5],
    hit: {voxel: [4, 1, 2]},
  }), /not breakable/);
  assert.throws(() => createBreakBlockTransaction({
    id: "build/unloaded",
    world,
    origin: [8.5, 2, 0.5],
    hit: {voxel: [8, 1, 0]},
  }), /unloaded/);
});

test("failed undo preserves history and canonical chunks", () => {
  const {registry, world} = fixture();
  applyBuildIntent(world, {
    type: "break",
    id: "build/history-1",
    origin: [2.5, 2.6, 4.5],
    hit: {voxel: [2, 1, 2]},
  });
  const current = world.getChunk([0, 0, 0]);
  const external = createBlockTransaction({
    id: "build/external",
    expectedRevisions: [{chunk: current.coord, revision: current.revision}],
    changes: [{
      chunk: current.coord,
      local: [1, 1, 1],
      before: getBlock(current, [1, 1, 1]),
      after: "alumbra/stone",
    }],
  }, registry);
  world.apply(external, {record: false});
  assert.equal(world.historyLength, 1);
  assert.throws(() => world.undo(), /conflict/);
  assert.equal(world.historyLength, 1);
  assert.equal(world.getBlock([1, 1, 1]).id, "alumbra/stone");
  assert.equal(world.getBlock([2, 1, 2]).id, "alumbra/air");
});

test("world runtime requires uniform chunk shapes and exposes missing policy", () => {
  const registry = createTestRegistry();
  assert.throws(() => createWorldRuntime({
    registry,
    chunks: [
      chunkWithBlocks(registry, {coord: [0, 0, 0], shape: [4, 4, 4]}),
      chunkWithBlocks(registry, {coord: [1, 0, 0], shape: [8, 8, 8]}),
    ],
  }), /same shape/);
  const emptyWorld = createWorldRuntime({registry, chunks: [], missingChunkPolicy: "empty"});
  assert.equal(emptyWorld.getBlock([100, 100, 100]).id, registry.emptyBlock);
  const errorWorld = createWorldRuntime({registry, chunks: [], missingChunkPolicy: "error"});
  assert.throws(() => errorWorld.getBlock([0, 0, 0]), /unloaded/);
});

test("place intent rejects inconsistent or non-adjacent hit evidence", () => {
  const {world} = fixture();
  const base = {
    id: "build/invalid-hit",
    world,
    origin: [2.5, 2.6, 4.5],
    block: "alumbra/stone",
  };
  assert.throws(() => createPlaceBlockTransaction({
    ...base,
    hit: {voxel: [2, 1, 2], face: "east", normal: [-1, 0, 0]},
  }), /do not agree/);
  assert.throws(() => createPlaceBlockTransaction({
    ...base,
    hit: {voxel: [2, 1, 2], previous: [4, 1, 2]},
  }), /face adjacent/);
  assert.throws(() => createPlaceBlockTransaction({
    ...base,
    hit: {voxel: [2, 1, 2], normal: [1, 0, 0], previous: [1, 1, 2]},
  }), /do not agree/);
});
