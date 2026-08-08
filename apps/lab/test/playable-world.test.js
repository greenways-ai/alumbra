import assert from "node:assert/strict";
import test from "node:test";
import {createPlayableWorldController} from "../src/playable-world.js";
import {digestWorldContent} from "../src/world-save.js";
import {createWorld} from "./fixtures.js";

function rendererSpy() {
  const chunks = [];
  return {
    chunks,
    setChunk(chunk) { chunks.push(chunk); },
  };
}

test("playable controller applies one canonical break and remeshes only affected chunks", async () => {
  const {world} = createWorld();
  const renderer = rendererSpy();
  const controller = createPlayableWorldController({world, renderer});
  const before = await digestWorldContent(world);
  const result = controller.applyAction({
    type: "break",
    origin: [2.5,2.6,4.5],
    hit: {voxel: [2,1,2], face: "south", normal: [0,0,1], previous: [2,1,3]},
  });
  assert.equal(result.transaction.id, "build/1/break");
  assert.deepEqual(result.affected, ["0,0,0"]);
  assert.equal(renderer.chunks.length, 1);
  assert.equal(renderer.chunks[0], world.getChunk([0,0,0]));
  assert.notEqual(await digestWorldContent(world), before);
  assert.deepEqual(controller.state, {
    transactionSequence: 1,
    worldRevision: 1,
    journalLength: 1,
    undoDepth: 1,
  });
});

test("playable undo appends an inverse journal entry and restores content after reload-style history", async () => {
  const {world} = createWorld();
  const renderer = rendererSpy();
  const controller = createPlayableWorldController({world, renderer});
  const before = await digestWorldContent(world);
  controller.applyAction({
    type: "break",
    origin: [2.5,2.6,4.5],
    hit: {voxel: [2,1,2]},
  });
  const history = controller.history();

  // Recreate the app-owned history controller as it would be reconstructed from a save.
  const restored = createPlayableWorldController({
    world,
    renderer,
    journal: history.journal,
    undoStack: history.undoStack,
    transactionSequence: controller.state.transactionSequence,
    worldRevision: controller.state.worldRevision,
  });
  const undone = restored.undo();
  assert.equal(undone.undone, "build/1/break");
  assert.equal(undone.transaction.id, "build/2/undo");
  assert.equal(await digestWorldContent(world), before);
  assert.equal(restored.history().journal.length, 2);
  assert.equal(restored.history().undoStack.length, 0);
  assert.equal(renderer.chunks.length, 2);
});

test("rejected place does not mutate, remesh or consume transaction identity", async () => {
  const {world} = createWorld();
  const renderer = rendererSpy();
  const controller = createPlayableWorldController({world, renderer});
  const before = await digestWorldContent(world);
  assert.throws(() => controller.applyAction({
    type: "place",
    origin: [2.5,2.6,4.5],
    hit: {voxel: [2,1,2], face: "east", normal: [1,0,0], previous: [3,1,2]},
    block: "alumbra/basalt",
    playerPosition: [3.5,1,2.5],
  }), /intersects the player/);
  assert.equal(await digestWorldContent(world), before);
  assert.equal(renderer.chunks.length, 0);
  assert.equal(controller.state.transactionSequence, 0);
  assert.equal(controller.history().journal.length, 0);

  const accepted = controller.applyAction({
    type: "break",
    origin: [2.5,2.6,4.5],
    hit: {voxel: [2,1,2]},
  });
  assert.equal(accepted.transaction.id, "build/1/break");
});

test("controller preserves sequence and revision across restoration and disposes", () => {
  const {world} = createWorld();
  const renderer = rendererSpy();
  const controller = createPlayableWorldController({
    world,
    renderer,
    transactionSequence: 9,
    worldRevision: 14,
  });
  const result = controller.applyAction({
    type: "break",
    origin: [2.5,2.6,4.5],
    hit: {voxel: [2,1,2]},
  });
  assert.equal(result.transaction.id, "build/10/break");
  assert.equal(result.worldRevision, 15);
  controller.destroy();
  controller.destroy();
  assert.throws(() => controller.undo(), /destroyed/);
});
