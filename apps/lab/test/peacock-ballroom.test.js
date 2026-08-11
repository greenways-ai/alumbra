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
const styles = readFileSync(new URL("../src/peacock-ballroom.css", import.meta.url), "utf8");

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

test("publishes safe-area-aware touch navigation and declared mobile actions", () => {
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /data-peacock-ballroom-mobile-controls="pending"/);
  assert.match(page, /data-peacock-ballroom-mobile-layout="pending"/);
  assert.match(page, /documentElement\.dataset\.peacockBallroomInput/);
  assert.match(page, /requestedInput === "touch"/);
  assert.match(page, /data-ballroom-mobile-controls/);
  for (const action of ["jump", "break", "place", "undo"]) {
    assert.ok(page.includes(`data-ballroom-action="${action}"`), action);
  }
  assert.match(entry, /PLAYABLE_VIRTUAL_INPUT_EVENT/);
  assert.match(entry, /dataset\.peacockBallroomMobileControls = "ready"/);
  assert.match(entry, /dataset\.peacockBallroomMobileLayout = passed \? "passed" : "failed"/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /data-peacock-ballroom-input="touch"[^}]+ballroom-mobile-controls/s);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("keeps expected no-target actions out of the runtime-error channel", () => {
  assert.match(entry, /setTargetAvailability\(frame\.hit\)/);
  assert.match(entry, /button\.disabled = !available/);
  assert.match(entry, /reason === "no-reachable-target" && type === "break"/);
  assert.match(entry, /outcome\?\.status === "noop" \|\| outcome\?\.status === "rejected"/);
  assert.match(entry, /setStatus\(actionFeedback\(action, outcome\), \{tone: "hint"\}\)/);
  assert.doesNotMatch(entry, /Cannot \$\{action\.type\}.*error: true/s);
  assert.match(styles, /ballroom-mobile-action:disabled/);
  assert.match(styles, /data-peacock-ballroom-target="ready"/);
  assert.match(styles, /data-peacock-ballroom-error="true"[^}]+ballroom-bottom/s);
});
