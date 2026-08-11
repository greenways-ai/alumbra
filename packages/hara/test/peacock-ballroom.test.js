import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digestChunkSnapshot } from "@greenways/alumbra-core";
import {
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_BLOCK_IDS,
  PEACOCK_BALLROOM_BLOCK_PACK,
  PEACOCK_BALLROOM_GENERATOR,
  PEACOCK_BALLROOM_LANDMARK_IDS,
  PEACOCK_BALLROOM_PACKAGE,
  PEACOCK_BALLROOM_PROVIDER_ID,
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_VERSION,
  PEACOCK_BALLROOM_VIEWS,
  PEACOCK_BALLROOM_WORLD,
  createPeacockBallroomChunkPlan,
  createPeacockBallroomChunks,
  createPeacockBallroomProviderDescriptor,
  createPeacockBallroomRegistry,
  describePeacockBallroomChunks,
  normalizePeacockBallroomWorld,
  peacockBallroomBlockAt,
  peacockBallroomChunkCoordinates,
  peacockBallroomView,
} from "../src/peacock-ballroom.js";

const haraSource = readFileSync(
  new URL("../src/gw/alumbra/peacock_ballroom.hal", import.meta.url),
  "utf8",
);

test("declares the bounded forty-eight chunk ballroom envelope", () => {
  const coordinates = peacockBallroomChunkCoordinates();
  assert.equal(coordinates.length, 48);
  assert.equal(new Set(coordinates.map((coordinate) => coordinate.join(","))).size, 48);
  assert.deepEqual(new Set(coordinates.map(([x]) => x)), new Set([-2, -1, 0, 1]));
  assert.deepEqual(new Set(coordinates.map(([, y]) => y)), new Set([0, 1, 2]));
  assert.deepEqual(new Set(coordinates.map(([, , z]) => z)), new Set([-2, -1, 0, 1]));
  assert.deepEqual(coordinates[0], [-2, 0, -2]);
  assert.deepEqual(coordinates.at(-1), [1, 2, 1]);
});

test("publishes a Hodos-compatible semantic provider descriptor", () => {
  assert.deepEqual(createPeacockBallroomProviderDescriptor(), {
    "provider/id": PEACOCK_BALLROOM_PROVIDER_ID,
    "provider/activity": PEACOCK_BALLROOM_ACTIVITY_ID,
    "provider/package": `${PEACOCK_BALLROOM_PACKAGE}@${PEACOCK_BALLROOM_VERSION}`,
    "provider/default-state": "ballroom/day",
    "provider/states": PEACOCK_BALLROOM_STATE_IDS,
  });
  assert.ok(Object.isFrozen(createPeacockBallroomProviderDescriptor()));
});

test("keeps the architectural descriptor closed and internally consistent", () => {
  assert.equal(PEACOCK_BALLROOM_WORLD.envelope.chunkCount, 48);
  assert.equal(PEACOCK_BALLROOM_WORLD.blocks.length, 10);
  assert.deepEqual(PEACOCK_BALLROOM_WORLD.blocks, PEACOCK_BALLROOM_BLOCK_IDS);
  assert.deepEqual(
    PEACOCK_BALLROOM_WORLD.landmarks.map(({ id }) => id),
    PEACOCK_BALLROOM_LANDMARK_IDS,
  );
  assert.ok(PEACOCK_BALLROOM_WORLD.states.includes(PEACOCK_BALLROOM_WORLD.defaultState));
  assert.equal(PEACOCK_BALLROOM_WORLD.provenance.relationship, "visual-inspiration");
  assert.equal(PEACOCK_BALLROOM_WORLD.provenance.assets, "original");
  assert.throws(
    () => normalizePeacockBallroomWorld({ ...PEACOCK_BALLROOM_WORLD, callback: "launch" }),
    /unknown field callback/,
  );
  assert.throws(
    () => normalizePeacockBallroomWorld({
      ...PEACOCK_BALLROOM_WORLD,
      chunkCoordinates: Array(48).fill([-2, 0, -2]),
    }),
    /must be unique/,
  );
});

test("materializes the original palette and a deterministic generated-chunk plan", () => {
  const registry = createPeacockBallroomRegistry();
  assert.equal(registry.definitions.length, PEACOCK_BALLROOM_BLOCK_IDS.length);
  assert.equal(registry.emptyBlock, "ballroom/air");
  assert.equal(PEACOCK_BALLROOM_BLOCK_PACK.blocks.length, 10);
  assert.equal(PEACOCK_BALLROOM_GENERATOR.id, "ballroom/architectural-generator");

  const first = createPeacockBallroomChunkPlan({coord: [0, 0, 0]}, registry);
  const second = createPeacockBallroomChunkPlan({coord: [0, 0, 0]}, registry);
  assert.deepEqual(first, second);
  assert.equal(first.format, "alumbra.generated-chunk/1");
  assert.equal(first.revision, 1);
  assert.equal(first.regions.length, 0);
  assert.equal(first.overrides.length, 576);
  assert.equal(first.metadata.authoredBy, "gw.alumbra.peacock-ballroom");
});

test("recognizes the first architectural landmarks from multiple coordinates", () => {
  assert.equal(peacockBallroomBlockAt(-1, 1, 0), "ballroom/brushed-gold");
  assert.equal(peacockBallroomBlockAt(-1, 15, 0), "ballroom/amber-lamp");
  assert.equal(peacockBallroomBlockAt(-1, 30, 0), "ballroom/brushed-gold");
  assert.equal(peacockBallroomBlockAt(-18, 15, 4), "ballroom/brushed-gold");
  assert.equal(peacockBallroomBlockAt(25, 10, 4), "ballroom/emerald-enamel");
  assert.equal(peacockBallroomBlockAt(-1, 2, 23), "ballroom/air");
});

test("materializes the complete canonical world deterministically", async () => {
  const registry = createPeacockBallroomRegistry();
  const first = createPeacockBallroomChunks({registry});
  const second = createPeacockBallroomChunks({registry});
  const evidence = describePeacockBallroomChunks(first);
  assert.equal(first.length, 48);
  assert.equal(evidence.uniqueChunkCount, 48);
  assert.equal(evidence.negativeAndPositive, true);
  assert.deepEqual(evidence.revisions, [1]);
  assert.ok(evidence.paletteIds.includes("ballroom/teal-glass"));
  assert.ok(evidence.paletteIds.includes("ballroom/amber-lamp"));
  const [firstDigests, secondDigests] = await Promise.all([
    Promise.all(first.map(digestChunkSnapshot)),
    Promise.all(second.map(digestChunkSnapshot)),
  ]);
  assert.deepEqual(firstDigests, secondDigests);
});

test("keeps named views bounded and authored alongside the Hara world", () => {
  assert.deepEqual(Object.keys(PEACOCK_BALLROOM_VIEWS), PEACOCK_BALLROOM_STATE_IDS);
  for (const stateId of PEACOCK_BALLROOM_STATE_IDS) {
    const view = peacockBallroomView(stateId);
    assert.equal(view.position.length, 3);
    assert.equal(view.velocity.length, 3);
    assert.equal(view.grounded, false);
    assert.ok(view.label.length > 0);
  }
  assert.throws(() => peacockBallroomView("ballroom/unknown"), /Unknown Peacock Ballroom state/);
});

test("keeps the palette, generator and semantic identities authored in Hara", () => {
  assert.match(haraSource, /^\(ns gw\.alumbra\.peacock-ballroom\)/);
  assert.match(haraSource, /\(defn peacock-ballroom-block-pack \[\]/);
  assert.match(haraSource, /\(defn peacock-ballroom-generator \[\]/);
  assert.match(haraSource, /\(defn peacock-ballroom-chunk-plan \[generator coord shape\]/);
  assert.match(haraSource, /\(defn ballroom-block-at \[world-x world-y world-z\]/);
  assert.match(haraSource, /\(defn state-view \[state-id\]/);
  for (const id of [
    ...PEACOCK_BALLROOM_BLOCK_IDS,
    ...PEACOCK_BALLROOM_STATE_IDS,
    ...PEACOCK_BALLROOM_LANDMARK_IDS,
    PEACOCK_BALLROOM_PROVIDER_ID,
    PEACOCK_BALLROOM_ACTIVITY_ID,
  ]) {
    assert.ok(haraSource.includes(`"${id}"`), `Hara source must contain ${id}`);
  }
});
