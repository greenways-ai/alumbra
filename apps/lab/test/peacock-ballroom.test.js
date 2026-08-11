import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  buildVoxelLightFields,
  createWorldRuntime,
} from "@greenways/alumbra-engine";
import {
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_WORLD_ID,
  createPeacockBallroomChunks,
  createPeacockBallroomRegistry,
  peacockBallroomView,
} from "@greenways/alumbra-hara";

const page = readFileSync(new URL("../peacock-ballroom.html", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/peacock-ballroom-entry.js", import.meta.url), "utf8");

function safeSpawn(world, view) {
  const [x, y, z] = view.position;
  const voxelX = Math.floor(x);
  const voxelY = Math.floor(y);
  const voxelZ = Math.floor(z);
  return !world.isSolidBlock(world.getBlock([voxelX, voxelY, voxelZ]))
    && !world.isSolidBlock(world.getBlock([voxelX, voxelY + 1, voxelZ]))
    && world.isSolidBlock(world.getBlock([voxelX, voxelY - 1, voxelZ]));
}

test("builds the full preview world with sunlight and emitted chandelier light", () => {
  const registry = createPeacockBallroomRegistry();
  const chunks = createPeacockBallroomChunks({registry});
  const fields = buildVoxelLightFields({registry, chunks});
  const evidence = fields.evidence();
  assert.equal(chunks.length, 48);
  assert.equal(evidence.chunks, 48);
  assert.equal(evidence.maxSunlight, 15);
  assert.equal(evidence.maxEmitted, 14);
  assert.equal(fields.sample([-1, 15, 0]).emitted, 14);
  assert.equal(fields.sample([-5, 47, 0]).sunlight, 15);
});

test("keeps every named preview spawn collision-safe", () => {
  const registry = createPeacockBallroomRegistry();
  const chunks = createPeacockBallroomChunks({registry});
  const world = createWorldRuntime({
    registry,
    chunks,
    missingChunkPolicy: "empty",
    worldId: PEACOCK_BALLROOM_WORLD_ID,
  });
  for (const stateId of PEACOCK_BALLROOM_STATE_IDS) {
    assert.equal(safeSpawn(world, peacockBallroomView(stateId)), true, stateId);
  }
});

test("publishes a standalone Lab preview with three semantic views and bounded browser evidence", () => {
  assert.match(page, /id="peacock-ballroom-canvas"/);
  assert.match(page, /data-peacock-ballroom-ready="false"/);
  assert.match(page, /src="\.\/src\/peacock-ballroom-entry\.js"/);
  for (const stateId of PEACOCK_BALLROOM_STATE_IDS) {
    assert.ok(page.includes(`data-ballroom-state="${stateId}"`));
  }
  assert.match(entry, /createPeacockBallroomPreviewHost/);
  assert.match(entry, /dataset\.peacockBallroomLighting/);
  assert.doesNotMatch(entry, /projectPath|meshBuffer|shaderSource/);
});
