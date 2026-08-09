export const ENVIRONMENT_PROFILE_FORMAT = "alumbra.environment-profile/1";
export const ENVIRONMENT_EVIDENCE_FORMAT = "alumbra.environment-evidence/1";

const PROFILE_ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const PROFILE_FIELDS = new Set(["format", "id", "label", "ambient", "clearColor", "exposure", "fog", "sun"]);
const FOG_FIELDS = new Set(["mode", "color", "start", "end", "density"]);
const SUN_FIELDS = new Set(["color", "intensity", "euler", "castShadows"]);
const FOG_MODES = new Set(["none", "linear", "exp", "exp2"]);
const BASELINE_EPSILON = 1e-4;

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const exactObject = (value, label, fields) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new TypeError(`${label} contains unknown field ${key}`);
  }
  return value;
};

const requiredString = (value, label, maximum = 192) => {
  const output = String(value ?? "").trim();
  if (!output || output.length > maximum) throw new TypeError(`${label} is invalid`);
  return output;
};

const finite = (value, minimum, maximum, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
};

const color = (value, fallback, label) => {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  if (source.length < 3 || source.length > 4) throw new TypeError(`${label} must contain three or four channels`);
  return Object.freeze(Array.from(source, (entry, index) => finite(
    entry ?? (index === 3 ? 1 : fallback[index]),
    0,
    1,
    `${label}[${index}]`,
  )));
};

const vector3 = (value, fallback, label) => {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  if (source.length !== 3) throw new TypeError(`${label} must contain three values`);
  return Object.freeze(Array.from(source, (entry, index) => finite(entry, -360, 360, `${label}[${index}]`)));
};

export const ENVIRONMENT_PROFILE_IDS = deepFreeze({
  daylight: "alumbra/daylight",
  fog: "alumbra/fog",
  emissive: "alumbra/emissive-night",
});

function normalizeFog(value, id) {
  const input = exactObject(value ?? {}, `Environment ${id} fog`, FOG_FIELDS);
  const mode = requiredString(input.mode ?? "none", `Environment ${id} fog mode`, 32);
  if (!FOG_MODES.has(mode)) throw new TypeError(`Unsupported fog mode: ${mode}`);
  const start = finite(input.start ?? 24, 0, 100000, `Environment ${id} fog start`);
  const end = finite(input.end ?? 140, 0, 100000, `Environment ${id} fog end`);
  if (mode === "linear" && end <= start) throw new Error(`Environment ${id} linear fog end must exceed start`);
  return deepFreeze({
    mode,
    color: color(input.color, [0.48, 0.58, 0.67], `Environment ${id} fog color`).slice(0, 3),
    start,
    end,
    density: finite(input.density ?? 0.012, 0, 10, `Environment ${id} fog density`),
  });
}

function normalizeSun(value, id) {
  const input = exactObject(value ?? {}, `Environment ${id} sun`, SUN_FIELDS);
  return deepFreeze({
    color: color(input.color, [1, 0.92, 0.78], `Environment ${id} sun color`).slice(0, 3),
    intensity: finite(input.intensity ?? 1.35, 0, 100, `Environment ${id} sun intensity`),
    euler: vector3(input.euler, [48, 28, 0], `Environment ${id} sun euler`),
    castShadows: input.castShadows == null ? true : Boolean(input.castShadows),
  });
}

export function normalizeEnvironmentProfile(value) {
  const input = exactObject(value, "Environment profile", PROFILE_FIELDS);
  if (input.format != null && input.format !== ENVIRONMENT_PROFILE_FORMAT) {
    throw new Error(`Unsupported environment profile format: ${input.format}`);
  }
  const id = requiredString(input.id, "Environment profile id");
  if (!PROFILE_ID_PATTERN.test(id)) throw new TypeError(`Invalid environment profile id: ${id}`);
  return deepFreeze({
    format: ENVIRONMENT_PROFILE_FORMAT,
    id,
    label: requiredString(input.label ?? id.split("/").at(-1).replaceAll("-", " "), `Environment ${id} label`, 128),
    ambient: color(input.ambient, [0.34, 0.38, 0.46], `Environment ${id} ambient`).slice(0, 3),
    clearColor: color(input.clearColor, [0.36, 0.53, 0.68], `Environment ${id} clear color`).slice(0, 3),
    exposure: finite(input.exposure ?? 1, 0, 16, `Environment ${id} exposure`),
    fog: normalizeFog(input.fog, id),
    sun: normalizeSun(input.sun, id),
  });
}

export const DEFAULT_ENVIRONMENT_PROFILES = Object.freeze([
  normalizeEnvironmentProfile({
    id: ENVIRONMENT_PROFILE_IDS.daylight,
    label: "Daylight",
    ambient: [0.34, 0.38, 0.46],
    clearColor: [0.36, 0.53, 0.68],
    exposure: 1,
    fog: { mode: "none", color: [0.48, 0.58, 0.67] },
    sun: { color: [1, 0.91, 0.73], intensity: 1.45, euler: [48, 28, 0], castShadows: true },
  }),
  normalizeEnvironmentProfile({
    id: ENVIRONMENT_PROFILE_IDS.fog,
    label: "Mist",
    ambient: [0.28, 0.34, 0.4],
    clearColor: [0.42, 0.5, 0.56],
    exposure: 0.92,
    fog: { mode: "linear", color: [0.42, 0.5, 0.56], start: 18, end: 82, density: 0.018 },
    sun: { color: [0.88, 0.91, 0.94], intensity: 0.72, euler: [56, 18, 0], castShadows: true },
  }),
  normalizeEnvironmentProfile({
    id: ENVIRONMENT_PROFILE_IDS.emissive,
    label: "Emissive night",
    ambient: [0.06, 0.08, 0.14],
    clearColor: [0.025, 0.04, 0.09],
    exposure: 1.35,
    fog: { mode: "exp2", color: [0.04, 0.06, 0.12], density: 0.018 },
    sun: { color: [0.32, 0.38, 0.62], intensity: 0.22, euler: [34, -24, 0], castShadows: false },
  }),
]);

function profileError(profileId) {
  const error = new Error(`Environment profile is not installed: ${profileId}`);
  error.code = "renderer/environment-profile-not-installed";
  error.profileId = profileId;
  return error;
}

export function createEnvironmentProfileRegistry(profiles = DEFAULT_ENVIRONMENT_PROFILES) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > 128) {
    throw new TypeError("Environment profile registry requires one to 128 profiles");
  }
  const normalized = profiles.map(normalizeEnvironmentProfile);
  const byId = new Map();
  for (const profile of normalized) {
    if (byId.has(profile.id)) throw new Error(`Duplicate environment profile: ${profile.id}`);
    byId.set(profile.id, profile);
  }
  return Object.freeze({
    format: "alumbra.environment-profile-registry/1",
    profiles: Object.freeze(normalized),
    has(id) {
      return byId.has(String(id));
    },
    get(id) {
      const key = String(id);
      const profile = byId.get(key);
      if (!profile) throw profileError(key);
      return profile;
    },
  });
}

const readColor = (value, fallback) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const channels = [value.r, value.g, value.b];
    if (channels.every((entry) => Number.isFinite(Number(entry)))) return channels.map(Number);
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const channels = Array.from(value).slice(0, 3).map(Number);
    if (channels.length === 3 && channels.every(Number.isFinite)) return channels;
  }
  return [...fallback];
};

const readEuler = (entity, fallback) => {
  const value = entity?.getLocalEulerAngles?.();
  if (value && [value.x, value.y, value.z].every((entry) => Number.isFinite(Number(entry)))) {
    return [Number(value.x), Number(value.y), Number(value.z)];
  }
  return [...fallback];
};

const pcColor = (pc, value) => new pc.Color(value[0], value[1], value[2]);

const fogConstant = (pc, mode) => ({
  none: pc.FOG_NONE ?? "none",
  linear: pc.FOG_LINEAR ?? "linear",
  exp: pc.FOG_EXP ?? "exp",
  exp2: pc.FOG_EXP2 ?? "exp2",
}[mode]);

const requireFogParams = (scene) => {
  const fog = scene?.fog;
  if (!fog || typeof fog !== "object" || Array.isArray(fog)) {
    throw new TypeError("PlayCanvas scene.fog must expose FogParams");
  }
  return fog;
};

function boundedEvidence({ status, profile, applyCount, disposalCount, baseline }) {
  return deepFreeze({
    format: ENVIRONMENT_EVIDENCE_FORMAT,
    status,
    profileId: profile?.id ?? null,
    profileLabel: profile?.label ?? null,
    fogMode: profile?.fog?.mode ?? "none",
    ambient: profile?.ambient ?? null,
    clearColor: profile?.clearColor ?? null,
    exposure: profile?.exposure ?? null,
    sunIntensity: profile?.sun?.intensity ?? null,
    applyCount,
    disposalCount,
    baseline,
  });
}

export function createPlayCanvasEnvironmentController({
  pc,
  app,
  camera = null,
  sun = null,
  profiles = DEFAULT_ENVIRONMENT_PROFILES,
} = {}) {
  if (!pc?.Color || !app?.scene) throw new TypeError("Environment controller requires PlayCanvas and a scene");
  const registry = profiles?.get ? profiles : createEnvironmentProfileRegistry(profiles);
  const scene = app.scene;
  const fog = requireFogParams(scene);
  const baseline = {
    ambient: readColor(scene.ambientLight, [0, 0, 0]),
    exposure: Number.isFinite(Number(scene.exposure)) ? Number(scene.exposure) : 1,
    fogType: fog.type,
    fogColor: readColor(fog.color, [0, 0, 0]),
    fogStart: Number.isFinite(Number(fog.start)) ? Number(fog.start) : 1,
    fogEnd: Number.isFinite(Number(fog.end)) ? Number(fog.end) : 1000,
    fogDensity: Number.isFinite(Number(fog.density)) ? Number(fog.density) : 0,
    clearColor: readColor(camera?.camera?.clearColor, [0, 0, 0]),
    sunColor: readColor(sun?.light?.color, [1, 1, 1]),
    sunIntensity: Number.isFinite(Number(sun?.light?.intensity)) ? Number(sun.light.intensity) : 1,
    sunCastShadows: Boolean(sun?.light?.castShadows),
    sunEuler: readEuler(sun, [0, 0, 0]),
  };
  let active = null;
  let applyCount = 0;
  let disposalCount = 0;
  let destroyed = false;

  const applyValues = (profile) => {
    scene.ambientLight = pcColor(pc, profile.ambient);
    scene.exposure = profile.exposure;
    fog.type = fogConstant(pc, profile.fog.mode);
    fog.color = pcColor(pc, profile.fog.color);
    fog.start = profile.fog.start;
    fog.end = profile.fog.end;
    fog.density = profile.fog.density;
    if (camera?.camera) camera.camera.clearColor = pcColor(pc, profile.clearColor);
    if (sun?.light) {
      sun.light.color = pcColor(pc, profile.sun.color);
      sun.light.intensity = profile.sun.intensity;
      sun.light.castShadows = profile.sun.castShadows;
    }
    sun?.setLocalEulerAngles?.(...profile.sun.euler);
    if ("renderNextFrame" in app) app.renderNextFrame = true;
  };

  const restore = () => {
    scene.ambientLight = pcColor(pc, baseline.ambient);
    scene.exposure = baseline.exposure;
    fog.type = baseline.fogType;
    fog.color = pcColor(pc, baseline.fogColor);
    fog.start = baseline.fogStart;
    fog.end = baseline.fogEnd;
    fog.density = baseline.fogDensity;
    if (camera?.camera) camera.camera.clearColor = pcColor(pc, baseline.clearColor);
    if (sun?.light) {
      sun.light.color = pcColor(pc, baseline.sunColor);
      sun.light.intensity = baseline.sunIntensity;
      sun.light.castShadows = baseline.sunCastShadows;
    }
    sun?.setLocalEulerAngles?.(...baseline.sunEuler);
    if ("renderNextFrame" in app) app.renderNextFrame = true;
  };

  const near = (left, right) => Math.abs(Number(left) - Number(right)) <= BASELINE_EPSILON;
  const same = (left, right) => left.length === right.length
    && left.every((entry, index) => near(entry, right[index]));
  const atBaseline = () => same(readColor(scene.ambientLight, []), baseline.ambient)
    && same(readColor(fog.color, []), baseline.fogColor)
    && same(readColor(camera?.camera?.clearColor, []), baseline.clearColor)
    && same(readColor(sun?.light?.color, []), baseline.sunColor)
    && same(readEuler(sun, []), baseline.sunEuler)
    && near(scene.exposure, baseline.exposure)
    && fog.type === baseline.fogType
    && near(fog.start, baseline.fogStart)
    && near(fog.end, baseline.fogEnd)
    && near(fog.density, baseline.fogDensity)
    && near(sun?.light?.intensity ?? baseline.sunIntensity, baseline.sunIntensity)
    && Boolean(sun?.light?.castShadows) === baseline.sunCastShadows;

  const evidence = () => boundedEvidence({
    status: destroyed ? "disposed" : active ? "active" : "idle",
    profile: active,
    applyCount,
    disposalCount,
    baseline: destroyed ? atBaseline() : false,
  });

  return Object.freeze({
    apply(profileId) {
      if (destroyed) throw new Error("Environment controller has been destroyed");
      const profile = registry.get(profileId);
      applyValues(profile);
      active = profile;
      applyCount += 1;
      return boundedEvidence({ status: "active", profile, applyCount, disposalCount, baseline: false });
    },
    evidence,
    destroy() {
      if (destroyed) return evidence();
      restore();
      active = null;
      destroyed = true;
      disposalCount += 1;
      return boundedEvidence({
        status: "disposed",
        profile: null,
        applyCount,
        disposalCount,
        baseline: atBaseline(),
      });
    },
  });
}

export function boundedEnvironmentProfileError(error) {
  return deepFreeze({
    code: String(error?.code ?? "renderer/environment-profile-error").slice(0, 128),
    message: String(error?.message ?? "Environment profile failed").slice(0, 500),
    profileId: error?.profileId == null ? null : String(error.profileId).slice(0, 192),
  });
}
