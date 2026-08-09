import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getBlock } from "@greenways/alumbra-core";
import {
  LIT_WORLD_EDIT,
  LIT_WORLD_ID,
  LIT_WORLD_LAMP,
  LIT_WORLD_SHAPE,
  LIT_WORLD_STATE_IDS,
  createLitWorldChunks,
  createLitWorldRegistry,
  deriveLitWorldHeadlessEvidence,
} from "../src/lit-world-host.js";

const source = fs.readFileSync(new URL("../src/lit-world-host.js", import.meta.url), "utf8");

test("lit-world fixture spans the negative-to-zero boundary with a lamp and open corridor", () => {
  const registry = createLitWorldRegistry();
  const chunks = createLitWorldChunks(registry);
  assert.deepEqual(chunks.map((chunk) => chunk.key), ["-1,0,0", "0,0,0"]);
  assert.deepEqual(chunks.map((chunk) => chunk.shape), [LIT_WORLD_SHAPE, LIT_WORLD_SHAPE]);
  assert.equal(chunks.every((chunk) => chunk.revision === 1), true);

  const left = chunks[0];
  const right = chunks[1];
  assert.equal(getBlock(left, LIT_WORLD_LAMP.local).id, "lit/lamp");
  assert.equal(getBlock(right, LIT_WORLD_LAMP.adjacentLocal).id, "lit/air");
  assert.equal(getBlock(right, LIT_WORLD_EDIT.roof.local).id, "lit/stone");
  assert.equal(getBlock(left, LIT_WORLD_EDIT.lamp.local).id, "lit/air");
  assert.equal(getBlock(left, [8, 0, 4]).id, "lit/stone");
  assert.equal(getBlock(left, [8, 0, 4]).id, "lit/stone");
  assert.equal(getBlock(right, [8, 7, 4]).id, "lit/air");
});

test("the real headless lighting and meshing path crosses the boundary with aligned light channels", () => {
  const evidence = deriveLitWorldHeadlessEvidence();
  assert.deepEqual(evidence.chunkKeys, ["-1,0,0", "0,0,0"]);
  assert.equal(evidence.worldId, LIT_WORLD_ID);
  assert.equal(evidence.negativeToZero, true);
  assert.equal(evidence.boundaryEmission, 14);
  assert.ok(evidence.roofSunlight < 15);
  assert.ok(evidence.editLampEmission < 15);
  assert.equal(evidence.maximumSunlight, 15);
  assert.equal(evidence.maximumEmitted, 15);
  assert.ok(evidence.meshGroups > 0);
  assert.ok(evidence.vertices > 0);
  assert.equal(evidence.alignedVertexChannels, true);

  const serialized = JSON.stringify(evidence);
  for (const forbidden of [
    "Uint8Array",
    "meshBuffer",
    "callback",
    "PlayCanvas",
    "projectPath",
    "capability",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("AR-12 and AR-13 keep deterministic direct and ordinary-edit states on one lighting path", () => {
  assert.deepEqual(LIT_WORLD_STATE_IDS, {
    live: "lighting/live",
    removed: "lighting/lamp-removed",
    restored: "lighting/lamp-restored",
    stale: "lighting/stale-generation-rejected",
    roofOpen: "world/edit-roof-open",
    lampPlaced: "world/edit-lamp-place",
    lampRemoved: "world/edit-lamp-remove",
    editStale: "world/edit-stale-rebuild-rejected",
  });
  assert.ok(source.includes("world.apply(lampTransaction"));
  assert.match(source, /routeAcceptedLightingTransaction/);
  assert.match(source, /createPlayableWorldController/);
  assert.ok(source.includes("session.controller.applyAction"));
  assert.match(source, /viewportReceipt/);
  assert.match(source, /roofBreakIntent/);
  assert.match(source, /editLampPlaceIntent/);
  assert.ok(source.includes("gate.arm()"));
  assert.match(source, /discardedLightingResults/);
  assert.match(source, /rejectedEditUnchanged/);
  assert.doesNotMatch(source, /localStorage|indexedDB|Hestia|Ignatius|Tahto/);
});
