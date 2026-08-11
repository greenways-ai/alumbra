import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_BLOCK_IDS,
  PEACOCK_BALLROOM_LANDMARK_IDS,
  PEACOCK_BALLROOM_PACKAGE,
  PEACOCK_BALLROOM_PROVIDER_ID,
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_VERSION,
  PEACOCK_BALLROOM_WORLD,
  createPeacockBallroomProviderDescriptor,
  normalizePeacockBallroomWorld,
  peacockBallroomChunkCoordinates,
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

test("keeps the palette and semantic identities authored in Hara", () => {
  assert.match(haraSource, /^\(ns gw\.alumbra\.peacock-ballroom\)/);
  assert.match(haraSource, /\(defn peacock-ballroom-block-pack \[\]/);
  assert.match(haraSource, /\(defn peacock-ballroom-world \[\]/);
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
