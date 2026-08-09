import assert from "node:assert/strict";
import test from "node:test";
import {
  MESH_LIGHT_COLOR_PROFILE_FORMAT,
  normalizeMeshLightColorProfile,
  projectMeshLightColors,
} from "../src/mesh-light-color.js";

const lighting = Object.freeze({
  format: "alumbra.mesh-lighting/1",
  profileId: "alumbra/lighting-default",
  generation: 2,
  epoch: 1,
  maxLevel: 15,
  targetKey: "0,0,0",
  shape: [2, 1, 1],
  sourceFields: [{ key: "0,0,0", coord: [0, 0, 0], sourceRevision: 3 }],
});

const group = (sunlight, emitted) => ({
  positions: new Float32Array(sunlight.length * 3),
  sunlight: Uint8Array.from(sunlight),
  emitted: Uint8Array.from(emitted),
});

test("mesh light color profiles are closed, bounded and canonically keyed", () => {
  const profile = normalizeMeshLightColorProfile({
    id: "alumbra/test-light-color",
    ambient: 0.1,
    sunlightScale: 0.8,
    emittedScale: 1.2,
  });
  assert.equal(profile.format, MESH_LIGHT_COLOR_PROFILE_FORMAT);
  assert.equal(
    profile.resourceKey,
    "alumbra/test-light-color|0.1|0.8|1.2",
  );
  assert.throws(
    () => normalizeMeshLightColorProfile({ shader: "custom" }),
    (error) => error.code === "mesh-light-color/field",
  );
  assert.throws(
    () => normalizeMeshLightColorProfile({ ambient: 2 }),
    (error) => error.code === "mesh-light-color/range",
  );
});

test("sunlight and emitted attributes project to deterministic grayscale RGBA bytes", () => {
  const sunlight = projectMeshLightColors({
    group: group([0, 15], [0, 0]),
    lighting,
    profile: {
      id: "alumbra/sun-only",
      ambient: 0,
      sunlightScale: 1,
      emittedScale: 0,
    },
  });
  assert.deepEqual([...sunlight.colors], [
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]);
  assert.deepEqual(sunlight.evidence, {
    format: "alumbra.mesh-light-color-evidence/1",
    profileId: "alumbra/lighting-default",
    generation: 2,
    epoch: 1,
    colorProfileId: "alumbra/sun-only",
    vertices: 2,
    sunlightVertices: 1,
    emittedVertices: 0,
    minimumByte: 0,
    maximumByte: 255,
  });

  const emitted = projectMeshLightColors({
    group: group([0], [15]),
    lighting,
    profile: {
      id: "alumbra/emitted-only",
      ambient: 0,
      sunlightScale: 0,
      emittedScale: 1,
    },
  });
  assert.deepEqual([...emitted.colors], [255, 255, 255, 255]);
});

test("color projection rejects missing or out-of-range light attributes", () => {
  assert.throws(
    () => projectMeshLightColors({
      group: { positions: new Float32Array(3), sunlight: Uint8Array.of(1) },
      lighting,
    }),
    (error) => error.code === "mesh-light/group-bytes",
  );
  assert.throws(
    () => projectMeshLightColors({
      group: group([16], [0]),
      lighting,
    }),
    (error) => error.code === "mesh-light/group-level",
  );
});
