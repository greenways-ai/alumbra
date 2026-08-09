export const MATERIAL_PROFILE_FORMAT = "alumbra.material-profile/1";
export const MATERIAL_PROFILE_EVIDENCE_FORMAT = "alumbra.material-profile-evidence/1";

const PROFILE_ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const PASSES = new Set(["opaque", "cutout", "transparent", "emissive", "overlay"]);
const BLENDS = new Set(["none", "normal", "additive"]);
const CULL_MODES = new Set(["back", "front", "none"]);
const PROFILE_FIELDS = new Set([
  "format", "id", "label", "pass", "blend", "depthWrite", "depthTest",
  "alphaCutoff", "opacityScale", "emissiveScale", "cull", "priority",
]);

const clamp = (value, minimum, maximum, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
};

const safeInteger = (value, minimum, maximum, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
};

const requiredString = (value, label, maximum = 128) => {
  const output = String(value ?? "").trim();
  if (!output || output.length > maximum) throw new TypeError(`${label} is invalid`);
  return output;
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

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const color = (value, fallback, label) => {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  if (source.length < 3 || source.length > 4) throw new TypeError(`${label} must contain three or four channels`);
  return Object.freeze(Array.from(source, (entry, index) => clamp(
    entry ?? (index === 3 ? 1 : fallback[index]),
    0,
    1,
    `${label}[${index}]`,
  )));
};

export const MATERIAL_PROFILE_IDS = deepFreeze({
  opaque: "alumbra/material-opaque",
  cutout: "alumbra/material-cutout",
  transparent: "alumbra/material-transparent",
  emissive: "alumbra/material-emissive",
  selectionOverlay: "alumbra/selection-overlay",
});

export function normalizeMaterialProfile(value) {
  const input = exactObject(value, "Material profile", PROFILE_FIELDS);
  if (input.format != null && input.format !== MATERIAL_PROFILE_FORMAT) {
    throw new Error(`Unsupported material profile format: ${input.format}`);
  }
  const id = requiredString(input.id, "Material profile id", 192);
  if (!PROFILE_ID_PATTERN.test(id)) throw new TypeError(`Invalid material profile id: ${id}`);
  const pass = requiredString(input.pass, `Material profile ${id} pass`, 32);
  if (!PASSES.has(pass)) throw new TypeError(`Unsupported material pass: ${pass}`);
  const blendDefault = pass === "transparent" || pass === "overlay"
    ? "normal"
    : pass === "emissive"
      ? "additive"
      : "none";
  const blend = requiredString(input.blend ?? blendDefault, `Material profile ${id} blend`, 32);
  if (!BLENDS.has(blend)) throw new TypeError(`Unsupported material blend: ${blend}`);
  const depthWriteDefault = pass === "opaque" || pass === "cutout";
  const depthTestDefault = pass !== "overlay";
  const alphaCutoffDefault = pass === "cutout" ? 0.5 : 0;
  const emissiveScaleDefault = pass === "emissive" ? 1 : 0;
  const cullDefault = pass === "overlay" ? "none" : "back";
  const cull = requiredString(input.cull ?? cullDefault, `Material profile ${id} cull`, 32);
  if (!CULL_MODES.has(cull)) throw new TypeError(`Unsupported material cull mode: ${cull}`);
  const profile = {
    format: MATERIAL_PROFILE_FORMAT,
    id,
    label: requiredString(input.label ?? id.split("/").at(-1).replaceAll("-", " "), `Material profile ${id} label`, 128),
    pass,
    blend,
    depthWrite: input.depthWrite == null ? depthWriteDefault : Boolean(input.depthWrite),
    depthTest: input.depthTest == null ? depthTestDefault : Boolean(input.depthTest),
    alphaCutoff: clamp(input.alphaCutoff ?? alphaCutoffDefault, 0, 1, `Material profile ${id} alpha cutoff`),
    opacityScale: clamp(input.opacityScale ?? 1, 0, 1, `Material profile ${id} opacity scale`),
    emissiveScale: clamp(input.emissiveScale ?? emissiveScaleDefault, 0, 16, `Material profile ${id} emissive scale`),
    cull,
    priority: safeInteger(input.priority ?? (pass === "overlay" ? 100 : 0), -1000, 1000, `Material profile ${id} priority`),
  };
  if (profile.pass !== "cutout" && profile.alphaCutoff !== 0) {
    throw new Error(`Material profile ${id} may use alphaCutoff only for the cutout pass`);
  }
  if (profile.pass === "cutout" && profile.alphaCutoff <= 0) {
    throw new Error(`Material profile ${id} requires a positive alphaCutoff`);
  }
  return deepFreeze(profile);
}

export const DEFAULT_MATERIAL_PROFILES = Object.freeze([
  normalizeMaterialProfile({
    id: MATERIAL_PROFILE_IDS.opaque,
    label: "Opaque",
    pass: "opaque",
  }),
  normalizeMaterialProfile({
    id: MATERIAL_PROFILE_IDS.cutout,
    label: "Cutout",
    pass: "cutout",
    alphaCutoff: 0.5,
    cull: "none",
  }),
  normalizeMaterialProfile({
    id: MATERIAL_PROFILE_IDS.transparent,
    label: "Transparent",
    pass: "transparent",
    opacityScale: 1,
  }),
  normalizeMaterialProfile({
    id: MATERIAL_PROFILE_IDS.emissive,
    label: "Emissive",
    pass: "emissive",
    blend: "additive",
    depthWrite: false,
    emissiveScale: 1.4,
  }),
  normalizeMaterialProfile({
    id: MATERIAL_PROFILE_IDS.selectionOverlay,
    label: "Selection overlay",
    pass: "overlay",
    blend: "normal",
    depthWrite: false,
    depthTest: false,
    cull: "none",
    priority: 100,
  }),
]);

function profileError(profileId) {
  const error = new Error(`Material profile is not installed: ${profileId}`);
  error.code = "renderer/material-profile-not-installed";
  error.profileId = profileId;
  return error;
}

export function createMaterialProfileRegistry(profiles = DEFAULT_MATERIAL_PROFILES) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > 256) {
    throw new TypeError("Material profile registry requires one to 256 profiles");
  }
  const normalized = profiles.map(normalizeMaterialProfile);
  const byId = new Map();
  for (const profile of normalized) {
    if (byId.has(profile.id)) throw new Error(`Duplicate material profile: ${profile.id}`);
    byId.set(profile.id, profile);
  }
  return Object.freeze({
    format: "alumbra.material-profile-registry/1",
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
    evidence() {
      return deepFreeze({
        format: MATERIAL_PROFILE_EVIDENCE_FORMAT,
        profileCount: normalized.length,
        profileIds: normalized.map((profile) => profile.id),
        passes: normalized.map((profile) => profile.pass),
      });
    },
  });
}

function renderMetadata(blockRegistry, material) {
  const definition = blockRegistry?.has?.(material) ? blockRegistry.get(material) : null;
  const render = definition?.metadata?.render;
  return render && typeof render === "object" && !Array.isArray(render) ? render : {};
}

const nonZero = (value) => (Array.isArray(value) || ArrayBuffer.isView(value))
  && Array.from(value).slice(0, 3).some((entry) => Number(entry) > 0);

export function inferMaterialProfileId({ blockRegistry, material, group } = {}) {
  const key = requiredString(material ?? group?.material, "Material group identity", 256);
  const definition = blockRegistry?.has?.(key) ? blockRegistry.get(key) : null;
  const render = definition?.metadata?.render && typeof definition.metadata.render === "object"
    ? definition.metadata.render
    : {};
  const explicit = render.profile ?? render["material-profile"];
  if (explicit != null) return requiredString(explicit, `Material ${key} profile`, 192);
  if (render.selectionOverlay === true || render["selection-overlay"] === true || key === MATERIAL_PROFILE_IDS.selectionOverlay) {
    return MATERIAL_PROFILE_IDS.selectionOverlay;
  }
  if (Number(render.alphaCutoff ?? render["alpha-cutoff"] ?? 0) > 0) return MATERIAL_PROFILE_IDS.cutout;
  if (Number(render.opacity ?? 1) < 1 || render.opaque === false) return MATERIAL_PROFILE_IDS.transparent;
  if (nonZero(render.emissive) || Number(definition?.metadata?.emittedLight ?? 0) > 0) return MATERIAL_PROFILE_IDS.emissive;
  return MATERIAL_PROFILE_IDS.opaque;
}

export function describeMaterialGroup({ profiles, blockRegistry, material, group } = {}) {
  const registry = profiles?.get ? profiles : createMaterialProfileRegistry(profiles ?? DEFAULT_MATERIAL_PROFILES);
  const key = requiredString(material ?? group?.material, "Material group identity", 256);
  const render = renderMetadata(blockRegistry, key);
  const profile = registry.get(inferMaterialProfileId({ blockRegistry, material: key, group }));
  const baseColor = color(render.color ?? group?.color, [0.62, 0.67, 0.72, 1], `Material ${key} color`);
  const baseEmissive = color(render.emissive, [0, 0, 0], `Material ${key} emissive`).slice(0, 3);
  const opacity = clamp((render.opacity ?? baseColor[3] ?? 1) * profile.opacityScale, 0, 1, `Material ${key} opacity`);
  const emissive = Object.freeze(baseEmissive.map((entry) => Math.min(16, entry * profile.emissiveScale)));
  const descriptor = {
    material: key,
    profileId: profile.id,
    profileLabel: profile.label,
    pass: profile.pass,
    blend: profile.blend,
    depthWrite: profile.depthWrite,
    depthTest: profile.depthTest,
    alphaCutoff: profile.alphaCutoff,
    cull: profile.cull,
    priority: profile.priority,
    color: Object.freeze(baseColor.slice(0, 3)),
    opacity,
    emissive,
    metalness: clamp(render.metalness ?? 0, 0, 1, `Material ${key} metalness`),
    gloss: clamp(render.gloss ?? 0.25, 0, 1, `Material ${key} gloss`),
  };
  descriptor.resourceKey = [
    descriptor.material,
    descriptor.profileId,
    descriptor.pass,
    descriptor.blend,
    descriptor.depthWrite ? 1 : 0,
    descriptor.depthTest ? 1 : 0,
    descriptor.alphaCutoff,
    descriptor.cull,
    descriptor.priority,
    descriptor.color.join(","),
    descriptor.opacity,
    descriptor.emissive.join(","),
    descriptor.metalness,
    descriptor.gloss,
  ].join("|");
  return deepFreeze(descriptor);
}

function pcColor(pc, value, fallback) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  return new pc.Color(
    Number.isFinite(Number(source[0])) ? Number(source[0]) : fallback[0],
    Number.isFinite(Number(source[1])) ? Number(source[1]) : fallback[1],
    Number.isFinite(Number(source[2])) ? Number(source[2]) : fallback[2],
  );
}

export function applyMaterialProfileToPlayCanvas({ pc, material, descriptor } = {}) {
  if (!pc?.Color || !material || !descriptor) {
    throw new TypeError("Applying a material profile requires PlayCanvas, a material and a descriptor");
  }
  material.name = `Alumbra ${descriptor.material} · ${descriptor.profileLabel}`;
  material.diffuse = pcColor(pc, descriptor.color, [0.62, 0.67, 0.72]);
  material.emissive = pcColor(pc, descriptor.emissive, [0, 0, 0]);
  material.opacity = descriptor.opacity;
  material.metalness = descriptor.metalness;
  material.gloss = descriptor.gloss;
  material.alphaTest = descriptor.alphaCutoff;
  material.depthWrite = descriptor.depthWrite;
  material.depthTest = descriptor.depthTest;
  if (descriptor.blend === "normal" && pc.BLEND_NORMAL != null) material.blendType = pc.BLEND_NORMAL;
  if (descriptor.blend === "additive") {
    material.blendType = pc.BLEND_ADDITIVE ?? pc.BLEND_ADDITIVEALPHA ?? pc.BLEND_NORMAL;
  }
  if (descriptor.blend === "none" && pc.BLEND_NONE != null) material.blendType = pc.BLEND_NONE;
  const cull = {
    none: pc.CULLFACE_NONE,
    front: pc.CULLFACE_FRONT,
    back: pc.CULLFACE_BACK,
  }[descriptor.cull];
  if (cull != null) material.cull = cull;
  material.update?.();
  return material;
}

export function boundedMaterialProfileError(error) {
  const code = String(error?.code ?? "renderer/material-profile-error").slice(0, 128);
  const message = String(error?.message ?? "Material profile failed").slice(0, 500);
  const profileId = error?.profileId == null ? null : String(error.profileId).slice(0, 192);
  return deepFreeze({ code, message, profileId });
}
