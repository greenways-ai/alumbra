import {PEACOCK_BALLROOM_STATE_IDS, PEACOCK_BALLROOM_VIEWS} from "./peacock-ballroom.js";

export const PEACOCK_BALLROOM_RENDER_PLATE_FORMAT = "alumbra.render-plate-set/1";
export const PEACOCK_BALLROOM_RENDER_PLATE_ID = "ballroom/reference-render-plates";
export const PEACOCK_BALLROOM_RENDER_PLATE_PACKAGE = "hara:greenways/alumbra-peacock-ballroom@0.1.0";

const ASSET_FIELDS = new Set([
  "id", "appearance", "repository", "path", "blob", "mediaType", "width", "height",
]);
const STATE_FIELDS = new Set(["asset", "anchor", "crop", "blend"]);
const ANCHOR_FIELDS = new Set(["position", "yaw", "pitch"]);
const CROP_FIELDS = new Set(["focus", "zoom"]);
const BLEND_FIELDS = new Set(["plateOpacity", "geometryOpacity"]);
const PROFILE_FIELDS = new Set([
  "parallaxX", "parallaxY", "fadeDistance", "fadeYaw", "fadePitch", "minimumOpacity",
]);
const IDENTIFIER = /^[a-z0-9][a-z0-9._\/-]*$/;
const SHA1 = /^[0-9a-f]{40}$/;
const PROFILE_IDS = new Set(["desktop", "mobile"]);
const APPEARANCES = new Set(["day", "night"]);
const STATE_IDS = new Set(PEACOCK_BALLROOM_STATE_IDS);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !fields.has(key)).sort();
  if (unknown.length) throw new TypeError(`${label} contains unknown field ${unknown[0]}`);
  return value;
}

function string(value, label, maximum = 512) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const output = value.trim();
  if (!output || output.length > maximum) throw new TypeError(`${label} is invalid`);
  return output;
}

function identifier(value, label) {
  const output = string(value, label, 192);
  if (!IDENTIFIER.test(output)) throw new TypeError(`${label} is invalid`);
  return output;
}

function finite(value, label, {minimum = -Infinity, maximum = Infinity} = {}) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < minimum || output > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return output;
}

function integer(value, label, {minimum = 0, maximum = Number.MAX_SAFE_INTEGER} = {}) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output < minimum || output > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return output;
}

function vector(value, label, length, bounds = {}) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} must contain ${length} numbers`);
  }
  return Object.freeze(value.map((entry, index) => finite(entry, `${label}[${index}]`, bounds)));
}

function normalizeAsset(value, index) {
  const input = exactObject(value, `Peacock Ballroom render asset ${index}`, ASSET_FIELDS);
  const appearance = identifier(input.appearance, `Peacock Ballroom render asset ${index} appearance`);
  if (!APPEARANCES.has(appearance)) {
    throw new Error(`Unsupported Peacock Ballroom render appearance: ${appearance}`);
  }
  const repository = string(input.repository, `Peacock Ballroom render asset ${index} repository`, 192);
  if (repository !== "greenways-ai/visual-language") {
    throw new Error("Peacock Ballroom render assets must resolve from greenways-ai/visual-language");
  }
  const path = string(input.path, `Peacock Ballroom render asset ${index} path`, 512);
  if (!path.startsWith("artwork/masters/greenways/peacock-ballroom-") || !path.endsWith(".png")) {
    throw new Error("Peacock Ballroom render assets must use the exact visual-language master path");
  }
  const blob = string(input.blob, `Peacock Ballroom render asset ${index} blob`, 40);
  if (!SHA1.test(blob)) throw new Error("Peacock Ballroom render asset blob must be a 40-character Git identity");
  const mediaType = string(input.mediaType, `Peacock Ballroom render asset ${index} media type`, 64);
  if (mediaType !== "image/png") throw new Error("Peacock Ballroom render masters must be PNG images");
  return deepFreeze({
    id: identifier(input.id, `Peacock Ballroom render asset ${index} id`),
    appearance,
    repository,
    path,
    blob,
    mediaType,
    width: integer(input.width, `Peacock Ballroom render asset ${index} width`, {minimum: 640, maximum: 16_384}),
    height: integer(input.height, `Peacock Ballroom render asset ${index} height`, {minimum: 360, maximum: 16_384}),
  });
}

function normalizeAnchor(value, label) {
  const input = exactObject(value, label, ANCHOR_FIELDS);
  return deepFreeze({
    position: vector(input.position, `${label} position`, 3, {minimum: -512, maximum: 512}),
    yaw: finite(input.yaw, `${label} yaw`, {minimum: -360, maximum: 360}),
    pitch: finite(input.pitch, `${label} pitch`, {minimum: -89, maximum: 89}),
  });
}

function normalizeCrop(value, label) {
  const input = exactObject(value, label, CROP_FIELDS);
  return deepFreeze({
    focus: vector(input.focus, `${label} focus`, 2, {minimum: 0, maximum: 100}),
    zoom: finite(input.zoom, `${label} zoom`, {minimum: 0.75, maximum: 2.5}),
  });
}

function normalizeBlend(value, label) {
  const input = exactObject(value, label, BLEND_FIELDS);
  return deepFreeze({
    plateOpacity: finite(input.plateOpacity, `${label} plate opacity`, {minimum: 0, maximum: 1}),
    geometryOpacity: finite(input.geometryOpacity, `${label} geometry opacity`, {minimum: 0, maximum: 1}),
  });
}

function normalizeState(value, stateId, assetIds) {
  const label = `Peacock Ballroom render state ${stateId}`;
  const input = exactObject(value, label, STATE_FIELDS);
  const asset = identifier(input.asset, `${label} asset`);
  if (!assetIds.has(asset)) throw new Error(`${label} references an unknown render asset`);
  const anchor = normalizeAnchor(input.anchor, `${label} anchor`);
  const canonical = PEACOCK_BALLROOM_VIEWS[stateId];
  if (!canonical
      || canonical.position.some((entry, axis) => entry !== anchor.position[axis])
      || canonical.yaw !== anchor.yaw
      || canonical.pitch !== anchor.pitch) {
    throw new Error(`${label} anchor must match the canonical named world view`);
  }
  return deepFreeze({
    asset,
    anchor,
    crop: normalizeCrop(input.crop, `${label} crop`),
    blend: normalizeBlend(input.blend, `${label} blend`),
  });
}

function normalizeProfile(value, profileId) {
  const label = `Peacock Ballroom render profile ${profileId}`;
  const input = exactObject(value, label, PROFILE_FIELDS);
  return deepFreeze({
    parallaxX: finite(input.parallaxX, `${label} horizontal parallax`, {minimum: 0, maximum: 0.25}),
    parallaxY: finite(input.parallaxY, `${label} vertical parallax`, {minimum: 0, maximum: 0.25}),
    fadeDistance: finite(input.fadeDistance, `${label} fade distance`, {minimum: 1, maximum: 64}),
    fadeYaw: finite(input.fadeYaw, `${label} fade yaw`, {minimum: 1, maximum: 180}),
    fadePitch: finite(input.fadePitch, `${label} fade pitch`, {minimum: 1, maximum: 89}),
    minimumOpacity: finite(input.minimumOpacity, `${label} minimum opacity`, {minimum: 0, maximum: 0.8}),
  });
}

export const PEACOCK_BALLROOM_RENDER_PLATES = (() => {
  const assets = [
    {
      id: "visual-language/greenways/peacock-ballroom-day",
      appearance: "day",
      repository: "greenways-ai/visual-language",
      path: "artwork/masters/greenways/peacock-ballroom-day.png",
      blob: "ceeb1917f99142f39f06e6de7424333e9d2df360",
      mediaType: "image/png",
      width: 1536,
      height: 1024,
    },
    {
      id: "visual-language/greenways/peacock-ballroom-night",
      appearance: "night",
      repository: "greenways-ai/visual-language",
      path: "artwork/masters/greenways/peacock-ballroom-night.png",
      blob: "fad7dff0d4bd7f21af0af6aa73508caeb4c177de",
      mediaType: "image/png",
      width: 1536,
      height: 1024,
    },
  ].map(normalizeAsset);
  const assetIds = new Set(assets.map(({id}) => id));
  const states = {
    "ballroom/day": normalizeState({
      asset: "visual-language/greenways/peacock-ballroom-day",
      anchor: {position: [-0.5, 2.05, 23.5], yaw: 0, pitch: -8},
      crop: {focus: [50, 50], zoom: 1.03},
      blend: {plateOpacity: 0.96, geometryOpacity: 0.18},
    }, "ballroom/day", assetIds),
    "ballroom/gallery-overlook": normalizeState({
      asset: "visual-language/greenways/peacock-ballroom-day",
      anchor: {position: [-21.5, 11.05, 0.5], yaw: -90, pitch: -12},
      crop: {focus: [34, 43], zoom: 1.14},
      blend: {plateOpacity: 0.93, geometryOpacity: 0.22},
    }, "ballroom/gallery-overlook", assetIds),
    "ballroom/mosaic-floor": normalizeState({
      asset: "visual-language/greenways/peacock-ballroom-day",
      anchor: {position: [-0.5, 2.05, 10.5], yaw: 0, pitch: -28},
      crop: {focus: [50, 67], zoom: 1.19},
      blend: {plateOpacity: 0.94, geometryOpacity: 0.20},
    }, "ballroom/mosaic-floor", assetIds),
  };
  if (Object.keys(states).length !== STATE_IDS.size
      || [...STATE_IDS].some((stateId) => !Object.hasOwn(states, stateId))) {
    throw new Error("Peacock Ballroom render plates must calibrate every named state");
  }
  const profiles = {
    desktop: normalizeProfile({
      parallaxX: 0.032,
      parallaxY: 0.026,
      fadeDistance: 11,
      fadeYaw: 38,
      fadePitch: 28,
      minimumOpacity: 0.16,
    }, "desktop"),
    mobile: normalizeProfile({
      parallaxX: 0.021,
      parallaxY: 0.018,
      fadeDistance: 7,
      fadeYaw: 28,
      fadePitch: 22,
      minimumOpacity: 0.24,
    }, "mobile"),
  };
  return deepFreeze({
    format: PEACOCK_BALLROOM_RENDER_PLATE_FORMAT,
    id: PEACOCK_BALLROOM_RENDER_PLATE_ID,
    package: PEACOCK_BALLROOM_RENDER_PLATE_PACKAGE,
    assets,
    states,
    profiles,
  });
})();

export function createPeacockBallroomRenderPlateDescriptor(
  stateId = "ballroom/day",
  profile = "desktop",
  appearance = "day",
) {
  const requestedState = identifier(stateId, "Peacock Ballroom render state");
  if (!STATE_IDS.has(requestedState)) {
    throw new Error(`Unsupported Peacock Ballroom render state: ${requestedState}`);
  }
  const profileId = identifier(profile, "Peacock Ballroom render profile");
  if (!PROFILE_IDS.has(profileId)) {
    throw new Error(`Unsupported Peacock Ballroom render profile: ${profileId}`);
  }
  const appearanceId = identifier(appearance, "Peacock Ballroom render appearance");
  if (!APPEARANCES.has(appearanceId)) {
    throw new Error(`Unsupported Peacock Ballroom render appearance: ${appearanceId}`);
  }
  const state = PEACOCK_BALLROOM_RENDER_PLATES.states[requestedState];
  const asset = PEACOCK_BALLROOM_RENDER_PLATES.assets.find((candidate) => (
    candidate.appearance === appearanceId
  ));
  if (!asset) throw new Error(`Peacock Ballroom render appearance is not installed: ${appearanceId}`);
  return deepFreeze({
    format: PEACOCK_BALLROOM_RENDER_PLATES.format,
    id: PEACOCK_BALLROOM_RENDER_PLATES.id,
    package: PEACOCK_BALLROOM_RENDER_PLATES.package,
    stateId: requestedState,
    profile: profileId,
    appearance: appearanceId,
    asset,
    anchor: state.anchor,
    crop: state.crop,
    blend: state.blend,
    parallax: PEACOCK_BALLROOM_RENDER_PLATES.profiles[profileId],
  });
}
