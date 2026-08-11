import { materializeBlockRegistry, normalizeBlockPack } from "./block-pack.js";
import {
  createGeneratedChunkPlan,
  materializeGeneratedChunk,
  normalizeGeneratorDescriptor,
} from "./generator-plan.js";

export const PEACOCK_BALLROOM_WORLD_FORMAT = "alumbra.architectural-world/1";
export const PEACOCK_BALLROOM_PACKAGE = "hara:greenways/alumbra-peacock-ballroom";
export const PEACOCK_BALLROOM_VERSION = "0.1.0";
export const PEACOCK_BALLROOM_WORLD_ID = "greenways/peacock-ballroom";
export const PEACOCK_BALLROOM_PROVIDER_ID = "alumbra/world";
export const PEACOCK_BALLROOM_ACTIVITY_ID = "alumbra-hara/peacock-ballroom";
export const PEACOCK_BALLROOM_BLOCK_PACK_ID = "ballroom/architectural-palette";
export const PEACOCK_BALLROOM_GENERATOR_ID = "ballroom/architectural-generator";
export const PEACOCK_BALLROOM_STORY_FORMAT = "alumbra.peacock-ballroom-story/1";
export const PEACOCK_BALLROOM_CHUNK_SHAPE = Object.freeze([16, 16, 16]);
export const PEACOCK_BALLROOM_SEED = 20260811;

export const PEACOCK_BALLROOM_STATE_IDS = Object.freeze([
  "ballroom/day",
  "ballroom/gallery-overlook",
  "ballroom/mosaic-floor",
]);

export const PEACOCK_BALLROOM_BLOCK_IDS = Object.freeze([
  "ballroom/air",
  "ballroom/ivory-stone",
  "ballroom/white-marble",
  "ballroom/brushed-gold",
  "ballroom/emerald-enamel",
  "ballroom/teal-glass",
  "ballroom/lapis-mosaic",
  "ballroom/amber-lamp",
  "ballroom/dark-wood",
  "ballroom/foliage",
]);

export const PEACOCK_BALLROOM_LANDMARK_IDS = Object.freeze([
  "ballroom/main-hall",
  "ballroom/grand-stair-west",
  "ballroom/grand-stair-east",
  "ballroom/central-dome",
  "ballroom/gallery",
  "ballroom/mosaic-floor",
]);

export const PEACOCK_BALLROOM_PLAYER_BODY = Object.freeze({
  radius: 0.34,
  height: 1.8,
  eyeHeight: 1.62,
});

export const PEACOCK_BALLROOM_VIEWS = deepFreeze({
  "ballroom/day": {
    position: [-0.5, 2.05, 23.5],
    velocity: [0, 0, 0],
    yaw: 0,
    pitch: -8,
    grounded: false,
    label: "Day entrance",
  },
  "ballroom/gallery-overlook": {
    position: [-21.5, 11.05, 0.5],
    velocity: [0, 0, 0],
    yaw: -90,
    pitch: -12,
    grounded: false,
    label: "Gallery overlook",
  },
  "ballroom/mosaic-floor": {
    position: [-0.5, 2.05, 10.5],
    velocity: [0, 0, 0],
    yaw: 0,
    pitch: -28,
    grounded: false,
    label: "Mosaic floor",
  },
});

const WORLD_FIELDS = new Set([
  "format", "id", "title", "summary", "package", "version", "provider", "activity",
  "blockPack", "generator", "envelope", "chunkCoordinates", "states", "defaultState",
  "blocks", "landmarks", "tags", "provenance",
]);
const ENVELOPE_FIELDS = new Set([
  "chunkShape", "minimumChunk", "maximumChunk", "chunkCount",
]);
const LANDMARK_FIELDS = new Set(["id", "label"]);
const PROVENANCE_FIELDS = new Set(["reference", "relationship", "assets"]);
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._\/-]*$/;
const PACKAGE_PATTERN = /^hara:[a-z0-9][a-z0-9._\/-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function exactObject(value, label, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !fields.has(key)).sort();
  if (unknown.length) throw new TypeError(`${label} contains unknown field ${unknown[0]}`);
  return value;
}

function boundedString(value, label, maximum = 512) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const output = value.trim();
  if (!output || output.length > maximum) throw new TypeError(`${label} is invalid`);
  return output;
}

function identifier(value, label) {
  const output = boundedString(value, label, 192);
  if (!IDENTIFIER_PATTERN.test(output)) throw new TypeError(`${label} is invalid`);
  return output;
}

function safeInteger(value, label, { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output < minimum || output > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return output;
}

function vector3(value, label, bounds = {}) {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain three integers`);
  return Object.freeze(value.map((entry, axis) => safeInteger(entry, `${label}[${axis}]`, bounds)));
}

function identityVector(value, label, maximum) {
  if (!Array.isArray(value) || !value.length || value.length > maximum) {
    throw new TypeError(`${label} must contain one to ${maximum} identities`);
  }
  const output = value.map((entry, index) => identifier(entry, `${label}[${index}]`));
  if (new Set(output).size !== output.length) throw new Error(`${label} must contain unique identities`);
  return Object.freeze(output);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function normalizeEnvelope(value) {
  const input = exactObject(value, "Peacock Ballroom envelope", ENVELOPE_FIELDS);
  const chunkShape = vector3(input.chunkShape, "Peacock Ballroom chunk shape", { minimum: 1, maximum: 64 });
  const minimumChunk = vector3(input.minimumChunk, "Peacock Ballroom minimum chunk", { minimum: -1024, maximum: 1024 });
  const maximumChunk = vector3(input.maximumChunk, "Peacock Ballroom maximum chunk", { minimum: -1024, maximum: 1024 });
  const extents = maximumChunk.map((entry, axis) => entry - minimumChunk[axis] + 1);
  if (extents.some((entry) => entry <= 0)) throw new Error("Peacock Ballroom chunk bounds are inverted");
  const expectedCount = extents.reduce((product, entry) => product * entry, 1);
  const chunkCount = safeInteger(input.chunkCount, "Peacock Ballroom chunk count", { minimum: 1, maximum: 64 });
  if (chunkCount !== expectedCount) {
    throw new Error(`Peacock Ballroom chunk count must equal the bounded envelope volume ${expectedCount}`);
  }
  return deepFreeze({ chunkShape, minimumChunk, maximumChunk, chunkCount });
}

function enumerateEnvelope(envelope) {
  const output = [];
  for (let y = envelope.minimumChunk[1]; y <= envelope.maximumChunk[1]; y += 1) {
    for (let z = envelope.minimumChunk[2]; z <= envelope.maximumChunk[2]; z += 1) {
      for (let x = envelope.minimumChunk[0]; x <= envelope.maximumChunk[0]; x += 1) {
        output.push(Object.freeze([x, y, z]));
      }
    }
  }
  return Object.freeze(output);
}

function normalizeCoordinates(value, envelope) {
  if (!Array.isArray(value) || value.length !== envelope.chunkCount) {
    throw new Error(`Peacock Ballroom chunk coordinates must contain ${envelope.chunkCount} entries`);
  }
  const coordinates = value.map((entry, index) => vector3(
    entry,
    `Peacock Ballroom chunk coordinate ${index}`,
    { minimum: -1024, maximum: 1024 },
  ));
  const keys = coordinates.map((entry) => entry.join(","));
  if (new Set(keys).size !== keys.length) throw new Error("Peacock Ballroom chunk coordinates must be unique");
  const expected = new Set(enumerateEnvelope(envelope).map((entry) => entry.join(",")));
  if (keys.some((key) => !expected.has(key)) || expected.size !== keys.length) {
    throw new Error("Peacock Ballroom chunk coordinates must exactly cover the declared envelope");
  }
  return Object.freeze(coordinates);
}

function normalizeLandmarks(value) {
  if (!Array.isArray(value) || !value.length || value.length > 64) {
    throw new TypeError("Peacock Ballroom landmarks must contain one to 64 entries");
  }
  const output = value.map((entry, index) => {
    const input = exactObject(entry, `Peacock Ballroom landmark ${index}`, LANDMARK_FIELDS);
    return deepFreeze({
      id: identifier(input.id, `Peacock Ballroom landmark ${index} id`),
      label: boundedString(input.label, `Peacock Ballroom landmark ${index} label`, 128),
    });
  });
  if (new Set(output.map(({ id }) => id)).size !== output.length) {
    throw new Error("Peacock Ballroom landmark identities must be unique");
  }
  return Object.freeze(output);
}

function normalizeProvenance(value) {
  const input = exactObject(value, "Peacock Ballroom provenance", PROVENANCE_FIELDS);
  const reference = boundedString(input.reference, "Peacock Ballroom provenance reference", 512);
  let url;
  try {
    url = new URL(reference);
  } catch {
    throw new TypeError("Peacock Ballroom provenance reference must be an https URL");
  }
  if (url.protocol !== "https:") throw new TypeError("Peacock Ballroom provenance reference must be an https URL");
  const relationship = boundedString(input.relationship, "Peacock Ballroom provenance relationship", 64);
  const assets = boundedString(input.assets, "Peacock Ballroom provenance assets", 64);
  if (relationship !== "visual-inspiration" || assets !== "original") {
    throw new Error("Peacock Ballroom provenance must identify visual inspiration and original assets");
  }
  return deepFreeze({ reference, relationship, assets });
}

export function normalizePeacockBallroomWorld(value) {
  const input = exactObject(value, "Peacock Ballroom world", WORLD_FIELDS);
  if (input.format !== PEACOCK_BALLROOM_WORLD_FORMAT) {
    throw new Error(`Unsupported Peacock Ballroom world format: ${input.format}`);
  }
  const packageId = boundedString(input.package, "Peacock Ballroom package", 256);
  if (!PACKAGE_PATTERN.test(packageId)) throw new TypeError("Peacock Ballroom package must be a hara: coordinate");
  const version = boundedString(input.version, "Peacock Ballroom version", 128);
  if (!SEMVER_PATTERN.test(version)) throw new TypeError("Peacock Ballroom version must be SemVer");
  const envelope = normalizeEnvelope(input.envelope);
  const states = identityVector(input.states, "Peacock Ballroom states", 64);
  const defaultState = identifier(input.defaultState, "Peacock Ballroom default state");
  if (!states.includes(defaultState)) throw new Error("Peacock Ballroom default state must occur in its state set");
  return deepFreeze({
    format: PEACOCK_BALLROOM_WORLD_FORMAT,
    id: identifier(input.id, "Peacock Ballroom world id"),
    title: boundedString(input.title, "Peacock Ballroom title", 128),
    summary: boundedString(input.summary, "Peacock Ballroom summary", 1024),
    package: packageId,
    version,
    provider: identifier(input.provider, "Peacock Ballroom provider"),
    activity: identifier(input.activity, "Peacock Ballroom activity"),
    blockPack: identifier(input.blockPack, "Peacock Ballroom block pack"),
    generator: identifier(input.generator, "Peacock Ballroom generator"),
    envelope,
    chunkCoordinates: normalizeCoordinates(input.chunkCoordinates, envelope),
    states,
    defaultState,
    blocks: identityVector(input.blocks, "Peacock Ballroom blocks", 256),
    landmarks: normalizeLandmarks(input.landmarks),
    tags: identityVector(input.tags, "Peacock Ballroom tags", 32),
    provenance: normalizeProvenance(input.provenance),
  });
}

const canonicalEnvelope = deepFreeze({
  chunkShape: PEACOCK_BALLROOM_CHUNK_SHAPE,
  minimumChunk: [-2, 0, -2],
  maximumChunk: [1, 2, 1],
  chunkCount: 48,
});

export const PEACOCK_BALLROOM_WORLD = normalizePeacockBallroomWorld({
  format: PEACOCK_BALLROOM_WORLD_FORMAT,
  id: PEACOCK_BALLROOM_WORLD_ID,
  title: "Peacock Ballroom",
  summary: "A monumental Hara-authored Greenways interior of ivory arches, teal glass, peacock mosaics and warm light.",
  package: PEACOCK_BALLROOM_PACKAGE,
  version: PEACOCK_BALLROOM_VERSION,
  provider: PEACOCK_BALLROOM_PROVIDER_ID,
  activity: PEACOCK_BALLROOM_ACTIVITY_ID,
  blockPack: PEACOCK_BALLROOM_BLOCK_PACK_ID,
  generator: PEACOCK_BALLROOM_GENERATOR_ID,
  envelope: canonicalEnvelope,
  chunkCoordinates: enumerateEnvelope(canonicalEnvelope),
  states: PEACOCK_BALLROOM_STATE_IDS,
  defaultState: "ballroom/day",
  blocks: PEACOCK_BALLROOM_BLOCK_IDS,
  landmarks: [
    { id: "ballroom/main-hall", label: "Main Hall" },
    { id: "ballroom/grand-stair-west", label: "West Grand Stair" },
    { id: "ballroom/grand-stair-east", label: "East Grand Stair" },
    { id: "ballroom/central-dome", label: "Central Dome" },
    { id: "ballroom/gallery", label: "Upper Gallery" },
    { id: "ballroom/mosaic-floor", label: "Peacock Mosaic Floor" },
  ],
  tags: ["greenways", "architecture", "interior", "ballroom", "benchmark"],
  provenance: {
    reference: "https://oss.greenways.ai/visual-language/artwork/greenways/peacock-ballroom-day.webp",
    relationship: "visual-inspiration",
    assets: "original",
  },
});

export const PEACOCK_BALLROOM_BLOCK_PACK = normalizeBlockPack({
  format: "alumbra.block-pack/1",
  package: PEACOCK_BALLROOM_PACKAGE,
  version: PEACOCK_BALLROOM_VERSION,
  id: PEACOCK_BALLROOM_BLOCK_PACK_ID,
  blocks: [
    {
      id: "ballroom/air",
      label: "Air",
      empty: true,
      material: { visible: false, opaque: false, opacity: 0 },
      physics: { solid: false, breakable: false, replaceable: true, hardness: 0 },
    },
    {
      id: "ballroom/ivory-stone",
      label: "Ivory Stone",
      material: { color: [0.88, 0.84, 0.72], gloss: 0.28 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 4 },
    },
    {
      id: "ballroom/white-marble",
      label: "White Marble",
      material: { color: [0.91, 0.91, 0.86], gloss: 0.68 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 5 },
    },
    {
      id: "ballroom/brushed-gold",
      label: "Brushed Gold",
      material: { color: [0.78, 0.58, 0.19], gloss: 0.74 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 5 },
    },
    {
      id: "ballroom/emerald-enamel",
      label: "Emerald Enamel",
      material: { color: [0.04, 0.34, 0.22], gloss: 0.72 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 3 },
    },
    {
      id: "ballroom/teal-glass",
      label: "Teal Glass",
      material: { opaque: false, opacity: 0.42, color: [0.08, 0.55, 0.58], gloss: 0.84 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 1 },
    },
    {
      id: "ballroom/lapis-mosaic",
      label: "Lapis Mosaic",
      material: { color: [0.06, 0.18, 0.52], gloss: 0.52 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 4 },
    },
    {
      id: "ballroom/amber-lamp",
      label: "Amber Lamp",
      material: { color: [0.88, 0.56, 0.16], emissive: [0.72, 0.31, 0.06], gloss: 0.48 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 2 },
      emittedLight: 14,
    },
    {
      id: "ballroom/dark-wood",
      label: "Dark Wood",
      material: { color: [0.20, 0.12, 0.08], gloss: 0.18 },
      physics: { solid: true, breakable: true, replaceable: false, hardness: 3 },
    },
    {
      id: "ballroom/foliage",
      label: "Ballroom Foliage",
      material: { opaque: false, opacity: 1, color: [0.12, 0.42, 0.25], gloss: 0.08 },
      physics: { solid: false, breakable: true, replaceable: true, hardness: 0.2 },
    },
  ],
  metadata: {
    identity: PEACOCK_BALLROOM_WORLD_ID,
    purpose: "original Greenways architectural world palette",
  },
});

export const PEACOCK_BALLROOM_GENERATOR = normalizeGeneratorDescriptor({
  format: "alumbra.generator/1",
  package: PEACOCK_BALLROOM_PACKAGE,
  version: PEACOCK_BALLROOM_VERSION,
  id: PEACOCK_BALLROOM_GENERATOR_ID,
  seed: PEACOCK_BALLROOM_SEED,
  entry: {
    module: "gw.alumbra.peacock-ballroom",
    function: "peacock-ballroom-chunk-plan",
  },
  parameters: {
    world: PEACOCK_BALLROOM_WORLD_ID,
    style: "peacock-ballroom-day",
  },
});

const absolute = (value) => (value < 0 ? -value : value);
const centeredDistance = (value) => Math.min(absolute(value), absolute(value + 1));
const between = (value, minimum, maximum) => value >= minimum && value <= maximum;
const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const isColumnBand = (distance) => distance === 4 || distance === 12 || distance === 20;
const isChandelierBand = (distance) => distance <= 1 || between(distance, 11, 13);

function floorMaterial(worldX, worldZ, dx, dz) {
  const radius = Math.max(dx, dz);
  if (dx <= 1 && dz <= 1) return "ballroom/brushed-gold";
  if (radius === 3 || radius === 8) return "ballroom/brushed-gold";
  if ((dx === 0 || dz === 0) && radius <= 15) return "ballroom/brushed-gold";
  if (radius <= 6) return "ballroom/lapis-mosaic";
  if (radius <= 12) {
    if (positiveMod(dx + dz, 3) === 0) return "ballroom/brushed-gold";
    return positiveMod(worldX + worldZ, 2) === 0
      ? "ballroom/emerald-enamel"
      : "ballroom/lapis-mosaic";
  }
  if (dz <= 21 && dx <= 15 && positiveMod(dx * 3 + dz * 5, 11) <= 1) {
    return "ballroom/lapis-mosaic";
  }
  if (dz <= 21 && dx <= 15 && positiveMod(dx * 5 + dz * 2, 13) <= 1) {
    return "ballroom/emerald-enamel";
  }
  return "ballroom/white-marble";
}

function sideWindowMaterial(worldY, worldZ) {
  const offset = positiveMod(worldZ + 24, 8);
  if (offset === 0 || offset === 7 || worldY === 5 || worldY === 16) {
    return "ballroom/brushed-gold";
  }
  if ((offset === 3 || offset === 4) && between(worldY, 9, 13)) {
    return "ballroom/emerald-enamel";
  }
  return "ballroom/teal-glass";
}

function southWindowMaterial(dx, worldY) {
  const top = 20 - dx;
  if (worldY === 11 || worldY === top || dx === 8) return "ballroom/brushed-gold";
  if (dx <= 2 && between(worldY, 13, 17)) return "ballroom/emerald-enamel";
  return "ballroom/teal-glass";
}

function northWindowMaterial(dx, worldY) {
  if (dx === 10 || worldY === 5 || worldY === 18 || dx === 0) {
    return "ballroom/brushed-gold";
  }
  if (dx <= 3 && between(worldY, 9, 14)) return "ballroom/emerald-enamel";
  if (positiveMod(dx + worldY, 5) === 0) return "ballroom/lapis-mosaic";
  return "ballroom/teal-glass";
}

function domeRadius(worldY) {
  if (worldY <= 23) return 12;
  if (worldY <= 25) return 10;
  if (worldY <= 27) return 8;
  return 6;
}

function peacockBallroomBlockAtRaw(worldX, worldY, worldZ) {
  const dx = centeredDistance(worldX);
  const dz = centeredDistance(worldZ);
  const maximumDistance = Math.max(dx, dz);

  if (worldY === 0 && dx <= 27 && dz <= 29) return "ballroom/ivory-stone";
  if (worldY === 1 && dx <= 25 && dz <= 27) return floorMaterial(worldX, worldZ, dx, dz);
  if (worldY < 2 || worldY > 30) return "ballroom/air";

  if (worldZ >= 15 && worldZ <= 23 && between(dx, 10, 17)) {
    const top = 1 + (24 - worldZ);
    if (worldY >= 2 && worldY <= top) {
      if (worldY === top && (dx === 10 || dx === 17)) return "ballroom/brushed-gold";
      return "ballroom/white-marble";
    }
  }

  if (worldY === 10 && between(dx, 18, 24) && dz <= 22) {
    return "ballroom/white-marble";
  }
  if ((worldY === 11 || worldY === 12) && dx === 17 && dz <= 22
      && !(worldZ >= 15 && worldZ <= 23)) {
    return worldY === 12 ? "ballroom/brushed-gold" : "ballroom/ivory-stone";
  }

  if (between(dx, 17, 18) && isColumnBand(dz) && between(worldY, 2, 16)) {
    if (worldY <= 3) return "ballroom/white-marble";
    if (worldY === 15) return "ballroom/brushed-gold";
    return "ballroom/ivory-stone";
  }

  if (between(dx, 17, 18) && dz <= 23 && between(worldY, 17, 20)) {
    const offset = positiveMod(worldZ + 21, 8);
    const rise = Math.min(offset, 7 - offset);
    const lower = 17 + rise;
    if (worldY >= lower) {
      return worldY === lower ? "ballroom/brushed-gold" : "ballroom/ivory-stone";
    }
  }

  if (dx === 0 && isChandelierBand(dz) && between(worldY, 17, 20)) {
    return "ballroom/dark-wood";
  }
  if (dx <= 1 && isChandelierBand(dz) && between(worldY, 15, 16)) {
    return "ballroom/amber-lamp";
  }

  if (between(dx, 21, 23) && between(dz, 19, 21)) {
    if (worldY === 2) return "ballroom/dark-wood";
    if (between(worldY, 3, 5)) return "ballroom/foliage";
  }

  const outerWall = (dx === 25 && dz <= 27) || (dz === 27 && dx <= 25);
  if (outerWall && between(worldY, 2, 20)) {
    if (dz === 27 && worldZ > 0 && dx <= 4 && worldY <= 10) return "ballroom/air";

    if (dz === 27 && worldZ > 0 && dx <= 8 && between(worldY, 11, 20 - dx)) {
      return southWindowMaterial(dx, worldY);
    }

    if (dz === 27 && worldZ < 0 && dx <= 10 && between(worldY, 5, 18)) {
      return northWindowMaterial(dx, worldY);
    }

    if (dx === 25 && dz <= 23 && between(worldY, 5, 16)) {
      return sideWindowMaterial(worldY, worldZ);
    }
    return "ballroom/ivory-stone";
  }

  if (worldY === 21 && dx <= 24 && dz <= 26) {
    if (maximumDistance > 12) return "ballroom/ivory-stone";
    if (maximumDistance === 12) return "ballroom/brushed-gold";
    return "ballroom/air";
  }

  if (between(worldY, 22, 29)) {
    const radius = domeRadius(worldY);
    const transition = worldY === 24 || worldY === 26 || worldY === 28;
    const onShell = maximumDistance === radius
      || (transition && between(maximumDistance, radius, radius + 2));
    if (onShell && dx <= radius + 2 && dz <= radius + 2) {
      if (dx === 0 || dz === 0 || (transition && maximumDistance === radius + 2)) {
        return "ballroom/brushed-gold";
      }
      return "ballroom/teal-glass";
    }
  }

  if (worldY === 30 && maximumDistance <= 6) {
    return dx === 0 || dz === 0 ? "ballroom/brushed-gold" : "ballroom/teal-glass";
  }

  return "ballroom/air";
}

export function peacockBallroomBlockAt(worldX, worldY, worldZ) {
  return peacockBallroomBlockAtRaw(
    safeInteger(worldX, "Peacock Ballroom world X"),
    safeInteger(worldY, "Peacock Ballroom world Y"),
    safeInteger(worldZ, "Peacock Ballroom world Z"),
  );
}

export function peacockBallroomChunkCoordinates(value = PEACOCK_BALLROOM_WORLD) {
  const world = value === PEACOCK_BALLROOM_WORLD ? value : normalizePeacockBallroomWorld(value);
  return deepFreeze(world.chunkCoordinates.map((coordinate) => [...coordinate]));
}

export function createPeacockBallroomProviderDescriptor(value = PEACOCK_BALLROOM_WORLD) {
  const world = value === PEACOCK_BALLROOM_WORLD ? value : normalizePeacockBallroomWorld(value);
  return deepFreeze({
    "provider/id": world.provider,
    "provider/activity": world.activity,
    "provider/package": `${world.package}@${world.version}`,
    "provider/default-state": world.defaultState,
    "provider/states": [...world.states],
  });
}

export function createPeacockBallroomBlockPack() {
  return PEACOCK_BALLROOM_BLOCK_PACK;
}

export function createPeacockBallroomGeneratorDescriptor() {
  return PEACOCK_BALLROOM_GENERATOR;
}

export function createPeacockBallroomRegistry() {
  return materializeBlockRegistry([PEACOCK_BALLROOM_BLOCK_PACK], {
    id: "ballroom/architectural-blocks",
    version: PEACOCK_BALLROOM_VERSION,
  }).registry;
}

export function createPeacockBallroomChunkPlan({
  generator = PEACOCK_BALLROOM_GENERATOR,
  coord,
  shape = PEACOCK_BALLROOM_CHUNK_SHAPE,
  revision = 1,
} = {}, registry = createPeacockBallroomRegistry()) {
  const normalizedCoord = vector3(coord, "Peacock Ballroom chunk coordinate", {
    minimum: -1024,
    maximum: 1024,
  });
  const normalizedShape = vector3(shape, "Peacock Ballroom chunk shape", {
    minimum: 1,
    maximum: 64,
  });
  const overrides = [];
  for (let z = 0; z < normalizedShape[2]; z += 1) {
    for (let y = 0; y < normalizedShape[1]; y += 1) {
      for (let x = 0; x < normalizedShape[0]; x += 1) {
        const block = peacockBallroomBlockAtRaw(
          normalizedCoord[0] * normalizedShape[0] + x,
          normalizedCoord[1] * normalizedShape[1] + y,
          normalizedCoord[2] * normalizedShape[2] + z,
        );
        if (block !== "ballroom/air") overrides.push({ local: [x, y, z], block });
      }
    }
  }
  return createGeneratedChunkPlan({
    format: "alumbra.generated-chunk/1",
    generator,
    coord: normalizedCoord,
    shape: normalizedShape,
    revision: safeInteger(revision, "Peacock Ballroom chunk revision", { minimum: 0, maximum: 0xffffffff }),
    base: "ballroom/air",
    regions: [],
    overrides,
    metadata: {
      world: PEACOCK_BALLROOM_WORLD_ID,
      style: "peacock-ballroom-day",
      authoredBy: "gw.alumbra.peacock-ballroom",
    },
  }, registry);
}

export function createPeacockBallroomChunks({
  registry = createPeacockBallroomRegistry(),
  generator = PEACOCK_BALLROOM_GENERATOR,
  coordinates = PEACOCK_BALLROOM_WORLD.chunkCoordinates,
  shape = PEACOCK_BALLROOM_CHUNK_SHAPE,
  revision = 1,
} = {}) {
  const chunks = coordinates.map((coord) => materializeGeneratedChunk(
    createPeacockBallroomChunkPlan({ generator, coord, shape, revision }, registry),
    registry,
    { expectedGenerator: generator, expectedCoord: coord, expectedShape: shape },
  ));
  return Object.freeze(chunks);
}

export function peacockBallroomView(stateId = PEACOCK_BALLROOM_WORLD.defaultState) {
  const key = identifier(stateId, "Peacock Ballroom state");
  const view = PEACOCK_BALLROOM_VIEWS[key];
  if (!view) throw new Error(`Unknown Peacock Ballroom state: ${key}`);
  return deepFreeze({
    position: [...view.position],
    velocity: [...view.velocity],
    yaw: view.yaw,
    pitch: view.pitch,
    grounded: false,
    label: view.label,
  });
}

export function describePeacockBallroomChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length !== PEACOCK_BALLROOM_WORLD.envelope.chunkCount) {
    throw new Error(`Peacock Ballroom requires ${PEACOCK_BALLROOM_WORLD.envelope.chunkCount} canonical chunks`);
  }
  const keys = chunks.map((chunk) => String(chunk?.key ?? ""));
  const revisions = chunks.map((chunk) => Number(chunk?.revision ?? -1));
  const palette = new Set(chunks.flatMap((chunk) => (chunk?.palette ?? []).map((block) => block.id)));
  return deepFreeze({
    format: "alumbra.peacock-ballroom-generation-evidence/1",
    chunkCount: chunks.length,
    uniqueChunkCount: new Set(keys).size,
    minimumChunk: [...PEACOCK_BALLROOM_WORLD.envelope.minimumChunk],
    maximumChunk: [...PEACOCK_BALLROOM_WORLD.envelope.maximumChunk],
    negativeAndPositive: chunks.some((chunk) => chunk.coord[0] < 0 || chunk.coord[2] < 0)
      && chunks.some((chunk) => chunk.coord[0] > 0 || chunk.coord[2] > 0),
    revisions: Object.freeze([...new Set(revisions)].sort((left, right) => left - right)),
    paletteIds: Object.freeze([...palette].sort()),
    landmarks: PEACOCK_BALLROOM_LANDMARK_IDS,
  });
}
