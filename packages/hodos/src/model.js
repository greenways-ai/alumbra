export const ALUMBRA_VIEWPORT_COMPONENT_ID = "alumbra.world/viewport";
export const ALUMBRA_VIEWPORT_COMPONENT_CONTRACT = "workspace.component/1";
export const ALUMBRA_VIEWPORT_PROFILE = "alumbra.viewport/1";
export const ALUMBRA_VIEWPORT_AREA_TYPE = "alumbra.world/viewport";

export const ALUMBRA_VIEWPORT_EVENTS = Object.freeze([
  "alumbra/move",
  "alumbra/look",
  "alumbra/jump",
  "alumbra/break",
  "alumbra/place",
  "alumbra/use",
  "alumbra/open-inventory",
  "alumbra/command",
]);

const EVENT_SET = new Set(ALUMBRA_VIEWPORT_EVENTS);
const MODE_SET = new Set(["play", "edit", "preview"]);
const STATUS_SET = new Set(["loading", "ready", "active", "suspended", "failed"]);
const FACE_SET = new Set(["west", "east", "down", "up", "north", "south"]);
const BLOCK_ID = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const MAX_METADATA_BYTES = 32 * 1024;

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
};

const objectValue = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
};

const finiteNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return Object.is(number, -0) ? 0 : number;
};

const finiteVector = (value, label, length = 3) => {
  if (!Array.isArray(value) || value.length !== length) throw new TypeError(`${label} must contain ${length} finite numbers`);
  return Object.freeze(value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`)));
};

const integerVector = (value, label) => {
  const vector = finiteVector(value, label);
  if (vector.some((entry) => !Number.isSafeInteger(entry))) throw new TypeError(`${label} must contain safe integers`);
  return vector;
};

const unsignedRevision = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError("Alumbra viewport world revision must be an unsigned 32-bit integer");
  }
  return value;
};

function serializableValue(value, label, maxDepth = 32) {
  const seen = new Set();
  const visit = (entry, path, depth) => {
    if (depth > maxDepth) throw new TypeError(`${label} exceeds the maximum nesting depth at ${path}`);
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return entry;
    if (typeof entry === "number") return finiteNumber(entry, `${label} at ${path}`);
    if (Array.isArray(entry)) {
      if (seen.has(entry)) throw new TypeError(`${label} contains a cycle at ${path}`);
      seen.add(entry);
      const output = entry.map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      seen.delete(entry);
      return Object.freeze(output);
    }
    if (!entry || typeof entry !== "object") throw new TypeError(`${label} contains an unsupported value at ${path}`);
    const prototype = Object.getPrototypeOf(entry);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} contains a host or non-plain object at ${path}`);
    }
    if (seen.has(entry)) throw new TypeError(`${label} contains a cycle at ${path}`);
    seen.add(entry);
    const output = {};
    for (const key of Object.keys(entry).sort()) {
      const item = entry[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
        throw new TypeError(`${label} contains an unsupported property at ${path}.${key}`);
      }
      Object.defineProperty(output, key, {
        value: visit(item, `${path}.${key}`, depth + 1),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    seen.delete(entry);
    return Object.freeze(output);
  };
  const output = visit(value, "$", 0);
  const bytes = new TextEncoder().encode(JSON.stringify(output)).byteLength;
  if (bytes > MAX_METADATA_BYTES) throw new RangeError(`${label} exceeds ${MAX_METADATA_BYTES} UTF-8 bytes`);
  return output;
}

function normalizeCamera(value = {}) {
  const camera = objectValue(value, "Alumbra viewport camera");
  const nearClip = finiteNumber(camera.nearClip ?? 0.05, "Alumbra viewport camera nearClip");
  const farClip = finiteNumber(camera.farClip ?? 1000, "Alumbra viewport camera farClip");
  const fov = finiteNumber(camera.fov ?? 66, "Alumbra viewport camera fov");
  if (nearClip <= 0) throw new RangeError("Alumbra viewport camera nearClip must be positive");
  if (farClip <= nearClip) throw new RangeError("Alumbra viewport camera farClip must be greater than nearClip");
  if (fov < 10 || fov > 150) throw new RangeError("Alumbra viewport camera fov must be between 10 and 150 degrees");
  return Object.freeze({
    position: finiteVector(camera.position ?? [0, 0, 0], "Alumbra viewport camera position"),
    rotation: finiteVector(camera.rotation ?? [0, 0, 0], "Alumbra viewport camera rotation"),
    fov,
    nearClip,
    farClip,
  });
}

function normalizeSelection(value) {
  if (value == null) return null;
  const selection = objectValue(value, "Alumbra viewport selection");
  const type = selection.type ?? selection["selection/type"] ?? "block";
  if (type !== "block") throw new Error("Alumbra viewport selection type must be block");
  const position = selection.position ?? selection["block/position"];
  const face = selection.face ?? selection["block/face"] ?? null;
  const blockId = selection.blockId ?? selection["block/id"] ?? null;
  const distance = finiteNumber(selection.distance ?? 0, "Alumbra viewport selection distance");
  if (distance < 0) throw new RangeError("Alumbra viewport selection distance must be non-negative");
  if (face !== null && !FACE_SET.has(face)) throw new Error(`Unsupported Alumbra block face: ${face}`);
  if (blockId !== null && !BLOCK_ID.test(String(blockId))) throw new Error(`Invalid Alumbra block id: ${blockId}`);
  return Object.freeze({
    type: "block",
    position: integerVector(position, "Alumbra viewport block position"),
    face,
    blockId: blockId === null ? null : String(blockId),
    distance,
  });
}

function normalizeCapabilities(value = {}) {
  const capabilities = objectValue(value, "Alumbra viewport capabilities");
  return Object.freeze({
    move: capabilities.move !== false,
    look: capabilities.look !== false,
    jump: capabilities.jump !== false,
    break: Boolean(capabilities.break),
    place: Boolean(capabilities.place),
    use: Boolean(capabilities.use),
    openInventory: Boolean(capabilities.openInventory),
    command: Boolean(capabilities.command),
  });
}

export function normalizeAlumbraViewportModel(value) {
  const input = objectValue(value, "Alumbra viewport model");
  const profile = input.profile ?? ALUMBRA_VIEWPORT_PROFILE;
  if (profile !== ALUMBRA_VIEWPORT_PROFILE) throw new Error(`Unsupported Alumbra viewport profile: ${profile}`);
  const mode = String(input.mode ?? "play");
  const status = String(input.status ?? "ready");
  if (!MODE_SET.has(mode)) throw new Error(`Unsupported Alumbra viewport mode: ${mode}`);
  if (!STATUS_SET.has(status)) throw new Error(`Unsupported Alumbra viewport status: ${status}`);
  const engineHandle = input["engine/handle"] ?? input.engineHandle ?? null;
  return Object.freeze({
    profile,
    "world/id": nonEmptyString(input["world/id"] ?? input.worldId, "Alumbra viewport world id"),
    "session/id": nonEmptyString(input["session/id"] ?? input.sessionId, "Alumbra viewport session id"),
    "world/revision": unsignedRevision(input["world/revision"] ?? input.revision ?? 0),
    "engine/handle": engineHandle == null ? null : nonEmptyString(engineHandle, "Alumbra viewport engine handle"),
    camera: normalizeCamera(input.camera),
    selection: normalizeSelection(input.selection),
    mode,
    status,
    readOnly: Boolean(input.readOnly),
    capabilities: normalizeCapabilities(input.capabilities),
    error: input.error == null ? null : serializableValue(input.error, "Alumbra viewport error"),
    metadata: serializableValue(input.metadata ?? {}, "Alumbra viewport metadata"),
  });
}

export function normalizeAlumbraViewportEvents(value = ALUMBRA_VIEWPORT_EVENTS) {
  if (!(Array.isArray(value) || value instanceof Set)) throw new TypeError("Alumbra viewport events must be an array or set");
  const events = [...new Set([...value].map((entry) => nonEmptyString(entry, "Alumbra viewport event")))];
  for (const event of events) if (!EVENT_SET.has(event)) throw new Error(`Unsupported Alumbra viewport event: ${event}`);
  return Object.freeze(events);
}

export function createAlumbraViewportArea({
  id = "area/alumbra-world",
  title = "Alumbra",
  model,
  events = ALUMBRA_VIEWPORT_EVENTS,
} = {}) {
  return Object.freeze({
    "area/id": nonEmptyString(id, "Alumbra Workspace area id"),
    "area/type": ALUMBRA_VIEWPORT_AREA_TYPE,
    "area/title": nonEmptyString(title, "Alumbra Workspace area title"),
    "area/component": Object.freeze({
      "component/id": ALUMBRA_VIEWPORT_COMPONENT_ID,
      "component/contract": ALUMBRA_VIEWPORT_COMPONENT_CONTRACT,
      "component/model": normalizeAlumbraViewportModel(model),
      "component/events": normalizeAlumbraViewportEvents(events),
    }),
  });
}
