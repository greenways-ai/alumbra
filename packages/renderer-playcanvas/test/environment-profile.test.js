import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ENVIRONMENT_PROFILES,
  ENVIRONMENT_PROFILE_FORMAT,
  ENVIRONMENT_PROFILE_IDS,
  createEnvironmentProfileRegistry,
  createPlayCanvasEnvironmentController,
  normalizeEnvironmentProfile,
} from "../src/environment-profile.js";

class Color {
  constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
}
const pc = {
  Color,
  FOG_NONE: 0,
  FOG_LINEAR: 1,
  FOG_EXP: 2,
  FOG_EXP2: 3,
};
const vector = (x, y, z) => ({ x, y, z });

test("environment profiles are closed, bounded and include daylight, fog and emissive night", () => {
  const profiles = createEnvironmentProfileRegistry(DEFAULT_ENVIRONMENT_PROFILES);
  assert.deepEqual(profiles.profiles.map((profile) => profile.id), [
    ENVIRONMENT_PROFILE_IDS.daylight,
    ENVIRONMENT_PROFILE_IDS.fog,
    ENVIRONMENT_PROFILE_IDS.emissive,
  ]);
  assert.throws(
    () => normalizeEnvironmentProfile({ format: ENVIRONMENT_PROFILE_FORMAT, id: "test/env", shader: "gl_FragColor" }),
    /unknown field shader/,
  );
});

test("environment controller applies profiles and restores the exact baseline", () => {
  const scene = {
    ambientLight: new Color(0.1, 0.2, 0.3),
    exposure: 0.75,
    fog: 0,
    fogColor: new Color(0.02, 0.03, 0.04),
    fogStart: 4,
    fogEnd: 40,
    fogDensity: 0.004,
  };
  const app = { scene, renderNextFrame: false };
  const camera = { camera: { clearColor: new Color(0.05, 0.06, 0.07) } };
  const sun = {
    light: { color: new Color(0.8, 0.7, 0.6), intensity: 0.5, castShadows: false },
    angles: vector(1, 2, 3),
    getLocalEulerAngles() { return this.angles; },
    setLocalEulerAngles(x, y, z) { this.angles = vector(x, y, z); },
  };
  const controller = createPlayCanvasEnvironmentController({ pc, app, camera, sun });
  const fog = controller.apply(ENVIRONMENT_PROFILE_IDS.fog);
  assert.equal(fog.profileId, ENVIRONMENT_PROFILE_IDS.fog);
  assert.equal(fog.fogMode, "linear");
  assert.equal(scene.fog, pc.FOG_LINEAR);
  assert.equal(controller.apply(ENVIRONMENT_PROFILE_IDS.emissive).profileId, ENVIRONMENT_PROFILE_IDS.emissive);
  assert.throws(
    () => controller.apply("test/not-installed"),
    (error) => error.code === "renderer/environment-profile-not-installed",
  );
  const disposed = controller.destroy();
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.baseline, true);
  assert.deepEqual([scene.ambientLight.r, scene.ambientLight.g, scene.ambientLight.b], [0.1, 0.2, 0.3]);
  assert.deepEqual([camera.camera.clearColor.r, camera.camera.clearColor.g, camera.camera.clearColor.b], [0.05, 0.06, 0.07]);
  assert.equal(controller.destroy().baseline, true);
});
