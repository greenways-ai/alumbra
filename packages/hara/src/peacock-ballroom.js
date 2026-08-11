export const PEACOCK_BALLROOM_WORLD_FORMAT = "alumbra.architectural-world/1";
export const PEACOCK_BALLROOM_PACKAGE = "hara:greenways/alumbra-peacock-ballroom";
export const PEACOCK_BALLROOM_VERSION = "0.1.0";
export const PEACOCK_BALLROOM_WORLD_ID = "greenways/peacock-ballroom";
export const PEACOCK_BALLROOM_PROVIDER_ID = "alumbra/world";
export const PEACOCK_BALLROOM_ACTIVITY_ID = "alumbra-hara/peacock-ballroom";
export const PEACOCK_BALLROOM_BLOCK_PACK_ID = "ballroom/architectural-palette";
export const PEACOCK_BALLROOM_GENERATOR_ID = "ballroom/architectural-generator";

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
  chunkShape: [16, 16, 16],
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
