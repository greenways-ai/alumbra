import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  PEACOCK_BALLROOM_ARCHITECTURE,
  PEACOCK_BALLROOM_ARCHITECTURE_FORMAT,
  PEACOCK_BALLROOM_ARCHITECTURE_ID,
  createPeacockBallroomArchitectureDescriptor,
} from "../src/index.js";

const haraSource = readFileSync(
  new URL("../src/gw/alumbra/peacock_ballroom_architecture.hal", import.meta.url),
  "utf8",
);

test("describes a closed Hara-owned ornamental scene above the canonical world", () => {
  const desktop = createPeacockBallroomArchitectureDescriptor("desktop");
  assert.equal(desktop.format, PEACOCK_BALLROOM_ARCHITECTURE_FORMAT);
  assert.equal(desktop.id, PEACOCK_BALLROOM_ARCHITECTURE_ID);
  assert.equal(desktop.profile, "desktop");
  assert.equal(desktop.materials.length, 10);
  assert.deepEqual(desktop.layout.columns.x, [-18, 18]);
  assert.equal(desktop.layout.columns.z.length, 6);
  assert.equal(desktop.layout.arches.centerZ.length, 5);
  assert.equal(desktop.layout.chandeliers.z.length, 3);
  assert.equal(desktop.layout.mosaic.feathers, 12);
  assert.ok(desktop.detail.archSegments > 4);
  assert.equal(Object.isFrozen(PEACOCK_BALLROOM_ARCHITECTURE), true);
  assert.doesNotMatch(JSON.stringify(desktop), /callback|function|shader|PlayCanvas|meshInstance|url/i);
});

test("uses a bounded mobile LOD without changing the authored composition", () => {
  const desktop = createPeacockBallroomArchitectureDescriptor("desktop");
  const mobile = createPeacockBallroomArchitectureDescriptor("mobile");
  assert.equal(mobile.layout, desktop.layout);
  assert.equal(mobile.materials, desktop.materials);
  assert.ok(mobile.detail.archSegments < desktop.detail.archSegments);
  assert.ok(mobile.detail.domeSegments < desktop.detail.domeSegments);
  assert.ok(mobile.detail.foliageLeaves < desktop.detail.foliageLeaves);
  assert.equal(mobile.detail.shadows, false);
  assert.throws(
    () => createPeacockBallroomArchitectureDescriptor("cinematic"),
    /Unsupported Peacock Ballroom architecture profile/,
  );
});

test("keeps the scene dimensions and material identities authoritative in Hara", () => {
  for (const token of [
    "alumbra.architectural-scene/1",
    "ballroom/hybrid-ornamental-architecture",
    "architecture/ivory",
    "architecture/marble",
    "architecture/gold",
    "architecture/teal-glass",
    "peacock-ballroom-architecture",
  ]) {
    assert.ok(haraSource.includes(token), token);
  }
  assert.match(haraSource, /"x" \[-18 18\]/);
  assert.match(haraSource, /"z" \[-20\.5 -12\.5 -4\.5 4\.5 12\.5 20\.5\]/);
  assert.match(haraSource, /"profile" profile/);
});
