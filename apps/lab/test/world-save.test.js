import assert from "node:assert/strict";
import test from "node:test";
import {applyBuildIntent} from "@greenways/alumbra-engine";
import {
  createWorldSave,
  digestWorldContent,
  resolveSafePlayerState,
  restoreWorldSave,
  WORLD_SAVE_FORMAT,
} from "../src/world-save.js";
import {createRegistry, createWorld, GENERATOR} from "./fixtures.js";

test("world save round-trips canonical chunks, identities, player and history", async () => {
  const {registry, world} = createWorld();
  const accepted = applyBuildIntent(world, {
    type: "break",
    id: "build/1/break",
    origin: [2.5, 2.6, 4.5],
    hit: {voxel: [2,1,2], face: "south", normal: [0,0,1], previous: [2,1,3]},
  });
  const save = await createWorldSave({
    world,
    generator: GENERATOR,
    registry,
    player: {position: [1.5,1,1.5], velocity: [0,0,0], grounded: true, yaw: 12, pitch: -5},
    journal: [accepted.transaction],
    undoStack: [accepted.transaction],
    saveSequence: 4,
    transactionSequence: 3,
    savedAt: "2026-08-08T00:00:00.000Z",
    worldRevision: 9,
  });
  assert.equal(save.format, WORLD_SAVE_FORMAT);
  assert.equal(save.chunks.length, 1);
  assert.match(save.chunks[0].digest, /^sha256:/);
  assert.match(save.chunks[0].contentDigest, /^sha256:/);

  const restored = await restoreWorldSave(save, {
    worldId: "world:alumbra/lab",
    generator: GENERATOR,
    registry,
  });
  assert.equal(restored.saveSequence, 4);
  assert.equal(restored.transactionSequence, 3);
  assert.equal(restored.worldRevision, 9);
  assert.equal(restored.player.yaw, 12);
  assert.equal(restored.journal.length, 1);
  assert.equal(restored.undoStack.length, 1);
  assert.equal(restored.chunks[0].revision, world.getChunk([0,0,0]).revision);
  assert.equal(await digestWorldContent(restored.chunks), save.world.digest);
});

test("world save rejects tampering and identity drift", async () => {
  const {registry, world} = createWorld();
  const save = await createWorldSave({
    world,
    generator: GENERATOR,
    registry,
    player: {position: [1.5,1,1.5]},
    saveSequence: 1,
    savedAt: "2026-08-08T00:00:00.000Z",
  });
  const tampered = structuredClone(save);
  const chars = tampered.chunks[0].bytes.split("");
  chars[12] = chars[12] === "A" ? "B" : "A";
  tampered.chunks[0].bytes = chars.join("");
  await assert.rejects(restoreWorldSave(tampered, {
    worldId: "world:alumbra/lab", generator: GENERATOR, registry,
  }), /digest mismatch|invalid|Snapshot/);

  await assert.rejects(restoreWorldSave(save, {
    worldId: "world:alumbra/other", generator: GENERATOR, registry,
  }), /targets/);
  await assert.rejects(restoreWorldSave(save, {
    worldId: "world:alumbra/lab",
    generator: {...GENERATOR, seed: "other"},
    registry,
  }), /Generator identity/);
  const definitions = createRegistry().definitions.map((entry) => ({...entry}));
  const otherRegistry = (await import("@greenways/alumbra-core")).createBlockRegistry(definitions, {
    id: "alumbra/lab-blocks", version: "0.2.0",
  });
  await assert.rejects(restoreWorldSave(save, {
    worldId: "world:alumbra/lab", generator: GENERATOR, registry: otherRegistry,
  }), /Block registry identity/);
});

test("content digest ignores revision while snapshot digest retains it", async () => {
  const {world} = createWorld();
  const original = await digestWorldContent(world);
  const accepted = applyBuildIntent(world, {
    type: "break",
    id: "build/content-1",
    origin: [2.5, 2.6, 4.5],
    hit: {voxel: [2,1,2]},
  });
  assert.notEqual(await digestWorldContent(world), original);
  world.undo({id: "build/content-undo"});
  assert.equal(await digestWorldContent(world), original);
  assert.equal(accepted.affected[0], "0,0,0");
});

test("unsafe restored players fall back to the first bounded safe position", () => {
  const {world} = createWorld();
  const resolved = resolveSafePlayerState({
    candidate: {position: [1.5,0.2,1.5]},
    fallback: {position: [1.5,0.2,1.5], yaw: 25},
    world,
    maxRise: 8,
  });
  assert.equal(resolved.restored, false);
  assert.ok(resolved.rise >= 1);
  assert.ok(resolved.state.position[1] >= 1.2);
  assert.equal(resolved.state.yaw, 25);
});
