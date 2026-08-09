import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MATERIAL_PROFILES,
  MATERIAL_PROFILE_FORMAT,
  MATERIAL_PROFILE_IDS,
  createMaterialProfileRegistry,
  describeMaterialGroup,
  inferMaterialProfileId,
  normalizeMaterialProfile,
} from "./material-profile.js";

const registry = {
  values: new Map(),
  has(id) { return this.values.has(id); },
  get(id) { return this.values.get(id); },
};
const put = (id, render, metadata = {}) => registry.values.set(id, { id, metadata: { ...metadata, render } });

put("test/opaque", { color: [0.2, 0.3, 0.4] });
put("test/cutout", { profile: MATERIAL_PROFILE_IDS.cutout, alphaCutoff: 0.5, color: [0.3, 0.7, 0.2, 0.8] });
put("test/transparent", { opaque: false, opacity: 0.4, color: [0.4, 0.7, 0.9] });
put("test/emissive", { emissive: [0.8, 0.2, 0.1], color: [0.5, 0.1, 0.05] });
put("test/overlay", { selectionOverlay: true, opacity: 0.25, color: [1, 0.8, 0.2] });

test("default material registry installs the five closed renderer passes", () => {
  const profiles = createMaterialProfileRegistry(DEFAULT_MATERIAL_PROFILES);
  assert.equal(profiles.profiles.length, 5);
  assert.deepEqual(new Set(profiles.profiles.map((profile) => profile.pass)), new Set([
    "opaque", "cutout", "transparent", "emissive", "overlay",
  ]));
  assert.ok(Object.isFrozen(profiles.profiles));
});

test("material declarations infer deterministic installed profiles", () => {
  assert.equal(inferMaterialProfileId({ blockRegistry: registry, material: "test/opaque" }), MATERIAL_PROFILE_IDS.opaque);
  assert.equal(inferMaterialProfileId({ blockRegistry: registry, material: "test/cutout" }), MATERIAL_PROFILE_IDS.cutout);
  assert.equal(inferMaterialProfileId({ blockRegistry: registry, material: "test/transparent" }), MATERIAL_PROFILE_IDS.transparent);
  assert.equal(inferMaterialProfileId({ blockRegistry: registry, material: "test/emissive" }), MATERIAL_PROFILE_IDS.emissive);
  assert.equal(inferMaterialProfileId({ blockRegistry: registry, material: "test/overlay" }), MATERIAL_PROFILE_IDS.selectionOverlay);
  const descriptor = describeMaterialGroup({ blockRegistry: registry, material: "test/transparent", group: { material: "test/transparent" } });
  assert.equal(descriptor.pass, "transparent");
  assert.equal(descriptor.depthWrite, false);
  assert.equal(descriptor.opacity, 0.4);
  assert.match(descriptor.resourceKey, /material-transparent/);
});

test("material profiles reject unknown fields and unknown installed identities", () => {
  assert.throws(
    () => normalizeMaterialProfile({ format: MATERIAL_PROFILE_FORMAT, id: "test/profile", pass: "opaque", shader: "void main(){}" }),
    /unknown field shader/,
  );
  const profiles = createMaterialProfileRegistry(DEFAULT_MATERIAL_PROFILES);
  assert.throws(
    () => profiles.get("test/not-installed"),
    (error) => error.code === "renderer/material-profile-not-installed",
  );
});
