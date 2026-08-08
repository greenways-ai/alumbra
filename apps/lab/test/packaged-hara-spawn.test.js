import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyIntersectsWorld,
  createPlayerRuntime,
  createWorldRuntime,
} from "@greenways/alumbra-engine";
import {
  PACKAGED_WORLD_STATE_IDS,
  createFixturePackagedWorldSession,
  loadPackagedHaraWorld,
  packagedWorldState,
} from "@greenways/alumbra-hara";

const PLAYER_BODY = Object.freeze({radius: 0.34, height: 1.8, eyeHeight: 1.62});
const IDLE_INPUT = Object.freeze({
  move: Object.freeze([0, 0]),
  look: Object.freeze([0, 0]),
  jump: false,
  actions: Object.freeze([]),
  selectedSlot: 0,
});

test("ready packaged-world states start inside their loaded chunk and outside solid terrain", async () => {
  const session = createFixturePackagedWorldSession();
  try {
    for (const stateId of [
      PACKAGED_WORLD_STATE_IDS.defaultSeed,
      PACKAGED_WORLD_STATE_IDS.negativeCoordinate,
    ]) {
      const result = await loadPackagedHaraWorld({
        session,
        state: packagedWorldState(stateId),
      });
      assert.equal(result.status, "ready");
      const world = createWorldRuntime({
        registry: result.registry,
        chunks: result.chunks,
        missingChunkPolicy: "solid",
        worldId: result.worldId,
      });
      assert.equal(bodyIntersectsWorld({
        position: result.spawn.position,
        body: PLAYER_BODY,
        getBlock: world.getBlock,
        isSolid: world.isSolidBlock,
        missingSolid: true,
      }), false, `${stateId} spawn must not intersect terrain or an unloaded neighbour`);

      const player = createPlayerRuntime({
        state: result.spawn,
        fixedStep: {tick: 1 / 60, maxFrame: 0.2, maxSteps: 10},
        config: {body: PLAYER_BODY},
        getBlock: world.getBlock,
        isSolid: world.isSolidBlock,
        missingSolid: true,
      });
      assert.doesNotThrow(
        () => player.advance(1 / 60, IDLE_INPUT),
        `${stateId} must advance through the headless Engine before browser mounting`,
      );
    }
  } finally {
    await session.dispose();
  }
});
