import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  PEACOCK_BALLROOM_RENDER_PLATE_FORMAT,
  PEACOCK_BALLROOM_RENDER_PLATE_ID,
  PEACOCK_BALLROOM_RENDER_PLATES,
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_VIEWS,
  createPeacockBallroomRenderPlateDescriptor,
} from "../src/index.js";

const haraSource = readFileSync(
  new URL("../src/gw/alumbra/peacock_ballroom_render_plates.hal", import.meta.url),
  "utf8",
);

test("describes exact rights-clean render masters without ambient delivery URLs", () => {
  assert.equal(PEACOCK_BALLROOM_RENDER_PLATES.format, PEACOCK_BALLROOM_RENDER_PLATE_FORMAT);
  assert.equal(PEACOCK_BALLROOM_RENDER_PLATES.id, PEACOCK_BALLROOM_RENDER_PLATE_ID);
  assert.equal(PEACOCK_BALLROOM_RENDER_PLATES.assets.length, 2);
  assert.deepEqual(
    PEACOCK_BALLROOM_RENDER_PLATES.assets.map(({appearance}) => appearance),
    ["day", "night"],
  );
  for (const asset of PEACOCK_BALLROOM_RENDER_PLATES.assets) {
    assert.equal(asset.repository, "greenways-ai/visual-language");
    assert.match(asset.path, /^artwork\/masters\/greenways\/peacock-ballroom-(?:day|night)\.png$/);
    assert.match(asset.blob, /^[0-9a-f]{40}$/);
    assert.equal(asset.mediaType, "image/png");
    assert.ok(asset.width >= 640);
    assert.ok(asset.height >= 360);
  }
  const serialized = JSON.stringify(PEACOCK_BALLROOM_RENDER_PLATES);
  assert.doesNotMatch(serialized, /https?:|url|callback|function|shader|PlayCanvas|meshInstance/i);
  assert.equal(Object.isFrozen(PEACOCK_BALLROOM_RENDER_PLATES), true);
});

test("calibrates every named state against the canonical navigable view", () => {
  assert.deepEqual(Object.keys(PEACOCK_BALLROOM_RENDER_PLATES.states), [...PEACOCK_BALLROOM_STATE_IDS]);
  for (const stateId of PEACOCK_BALLROOM_STATE_IDS) {
    const descriptor = createPeacockBallroomRenderPlateDescriptor(stateId, "desktop", "day");
    assert.equal(descriptor.stateId, stateId);
    assert.deepEqual(descriptor.anchor.position, PEACOCK_BALLROOM_VIEWS[stateId].position);
    assert.equal(descriptor.anchor.yaw, PEACOCK_BALLROOM_VIEWS[stateId].yaw);
    assert.equal(descriptor.anchor.pitch, PEACOCK_BALLROOM_VIEWS[stateId].pitch);
    assert.ok(descriptor.crop.zoom >= 1);
    assert.ok(descriptor.blend.plateOpacity > descriptor.blend.geometryOpacity);
    assert.ok(descriptor.parallax.fadeDistance > 0);
  }
});

test("switches appearance and mobile parallax without changing world authority", () => {
  const day = createPeacockBallroomRenderPlateDescriptor("ballroom/day", "desktop", "day");
  const night = createPeacockBallroomRenderPlateDescriptor("ballroom/day", "desktop", "night");
  const mobile = createPeacockBallroomRenderPlateDescriptor("ballroom/day", "mobile", "day");
  assert.notEqual(day.asset.id, night.asset.id);
  assert.equal(day.anchor, night.anchor);
  assert.equal(day.crop, night.crop);
  assert.equal(day.blend, night.blend);
  assert.equal(mobile.asset, day.asset);
  assert.equal(mobile.anchor, day.anchor);
  assert.ok(mobile.parallax.parallaxX < day.parallax.parallaxX);
  assert.ok(mobile.parallax.fadeDistance < day.parallax.fadeDistance);
  assert.ok(mobile.parallax.minimumOpacity > day.parallax.minimumOpacity);
  assert.throws(
    () => createPeacockBallroomRenderPlateDescriptor("ballroom/unknown"),
    /Unsupported Peacock Ballroom render state/,
  );
  assert.throws(
    () => createPeacockBallroomRenderPlateDescriptor("ballroom/day", "cinematic"),
    /Unsupported Peacock Ballroom render profile/,
  );
  assert.throws(
    () => createPeacockBallroomRenderPlateDescriptor("ballroom/day", "desktop", "dawn"),
    /Unsupported Peacock Ballroom render appearance/,
  );
});

test("keeps source identities, view calibration and blending values authoritative in Hara", () => {
  for (const token of [
    "alumbra.render-plate-set/1",
    "ballroom/reference-render-plates",
    "visual-language/greenways/peacock-ballroom-day",
    "visual-language/greenways/peacock-ballroom-night",
    "ceeb1917f99142f39f06e6de7424333e9d2df360",
    "fad7dff0d4bd7f21af0af6aa73508caeb4c177de",
    "ballroom/gallery-overlook",
    "plateOpacity",
    "geometryOpacity",
    "peacock-ballroom-render-plate",
  ]) {
    assert.ok(haraSource.includes(token), token);
  }
  assert.match(haraSource, /"position" \[-0\.5 2\.05 23\.5\] "yaw" 0 "pitch" -8/);
  assert.match(haraSource, /"desktop"[\s\S]+"minimumOpacity" 0\.16/);
  assert.doesNotMatch(haraSource, /https?:\/\//);
});
