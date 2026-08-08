import {
  canonicalStringify,
  canonicalValue,
  createBlockTransaction,
  decodeChunkSnapshot,
  digestChunkSnapshot,
  encodeChunkSnapshot,
  normalizeGeneratorIdentity,
} from "@greenways/alumbra-core";
import {
  bodyIntersectsWorld,
  normalizePlayerBody,
  normalizePlayerState,
} from "@greenways/alumbra-engine";

export const WORLD_SAVE_FORMAT = "alumbra.world-save/1";
export const MAX_SAVE_CHUNKS = 4096;
export const MAX_SAVE_JOURNAL = 4096;
export const MAX_SAVE_BYTES = 64 * 1024 * 1024;

const encoder = new TextEncoder();
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
};

const unsignedInteger = (value, label, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return btoa(binary);
};

const base64ToBytes = (value, label) => {
  if (typeof value !== "string" || value.length % 4 !== 0 || !BASE64.test(value)) {
    throw new TypeError(`${label} must be canonical base64`);
  }
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw new TypeError(`${label} contains invalid base64`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytesToBase64(bytes) !== value) throw new TypeError(`${label} is not canonically encoded`);
  return bytes;
};

async function digestCanonical(value) {
  const bytes = encoder.encode(canonicalStringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${[...digest].map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

async function registryIdentity(registry) {
  if (!registry || !Array.isArray(registry.definitions)) throw new TypeError("World save requires a block registry");
  return Object.freeze({
    id: nonEmptyString(registry.id, "Block registry id"),
    version: nonEmptyString(registry.version, "Block registry version"),
    digest: await digestCanonical(registry.definitions),
  });
}

function normalizeJournal(values, registry, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  if (values.length > MAX_SAVE_JOURNAL) throw new RangeError(`${label} exceeds ${MAX_SAVE_JOURNAL} entries`);
  return Object.freeze(values.map((entry) => createBlockTransaction(entry, registry)));
}

async function chunkEntry(chunk) {
  const bytes = encodeChunkSnapshot(chunk);
  const digest = await digestChunkSnapshot(bytes);
  const contentDigest = await digestChunkSnapshot({...chunk, revision: 0});
  return Object.freeze({
    key: nonEmptyString(chunk.key, "Chunk key"),
    coord: Object.freeze([...chunk.coord]),
    shape: Object.freeze([...chunk.shape]),
    revision: unsignedInteger(chunk.revision, "Chunk revision", 0xffffffff),
    digest,
    contentDigest,
    bytes: bytesToBase64(bytes),
  });
}

function worldChunkValues(worldOrChunks) {
  const value = typeof worldOrChunks?.chunks === "function" ? worldOrChunks.chunks() : worldOrChunks;
  if (value instanceof Map) return [...value.values()];
  if (Array.isArray(value)) return [...value];
  throw new TypeError("World save requires a world runtime, Map or array of chunks");
}

export async function digestWorldContent(chunks) {
  const entries = [];
  for (const chunk of worldChunkValues(chunks)) {
    entries.push([chunk.key, await digestChunkSnapshot({...chunk, revision: 0})]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return digestCanonical(entries);
}

export async function createWorldSave({
  world,
  chunks = null,
  generator,
  registry = world?.registry,
  player,
  journal = [],
  undoStack = [],
  saveSequence = 0,
  transactionSequence = 0,
  savedAt,
  worldRevision = world?.revision ?? 0,
} = {}) {
  const sourceChunks = worldChunkValues(chunks ?? world);
  if (sourceChunks.length === 0) throw new Error("World save requires at least one chunk");
  if (sourceChunks.length > MAX_SAVE_CHUNKS) throw new RangeError(`World save exceeds ${MAX_SAVE_CHUNKS} chunks`);
  const keys = new Set();
  for (const chunk of sourceChunks) {
    if (!chunk?.key || keys.has(chunk.key)) throw new Error(`World save contains an invalid or duplicate chunk: ${chunk?.key}`);
    keys.add(chunk.key);
  }

  const normalizedGenerator = normalizeGeneratorIdentity(generator);
  const normalizedRegistry = await registryIdentity(registry);
  const normalizedPlayer = normalizePlayerState(player);
  const normalizedJournal = normalizeJournal(journal, registry, "World save journal");
  const normalizedUndoStack = normalizeJournal(undoStack, registry, "World save undo stack");
  const chunkEntries = await Promise.all(sourceChunks.map(chunkEntry));
  chunkEntries.sort((left, right) => left.key.localeCompare(right.key));
  const worldDigest = await digestCanonical(chunkEntries.map((entry) => [entry.key, entry.contentDigest]));
  const snapshotDigest = await digestCanonical(chunkEntries.map((entry) => [entry.key, entry.revision, entry.digest]));

  const value = {
    format: WORLD_SAVE_FORMAT,
    world: {
      id: nonEmptyString(world?.worldId ?? world?.id, "World id"),
      revision: unsignedInteger(worldRevision, "World revision"),
      digest: worldDigest,
      snapshotDigest,
    },
    generator: normalizedGenerator,
    registry: normalizedRegistry,
    player: normalizedPlayer,
    chunks: chunkEntries,
    journal: normalizedJournal,
    undoStack: normalizedUndoStack,
    saveSequence: unsignedInteger(saveSequence, "Save sequence"),
    transactionSequence: unsignedInteger(transactionSequence, "Transaction sequence"),
    savedAt: nonEmptyString(savedAt, "Save timestamp"),
  };
  const canonical = canonicalValue(value);
  const size = encoder.encode(canonicalStringify(canonical)).byteLength;
  if (size > MAX_SAVE_BYTES) throw new RangeError(`World save exceeds ${MAX_SAVE_BYTES} UTF-8 bytes`);
  return Object.freeze(canonical);
}

function assertIdentity(actual, expected, label) {
  if (expected == null) return;
  if (canonicalStringify(actual) !== canonicalStringify(expected)) {
    throw new Error(`${label} does not match the requested world`);
  }
}

export async function restoreWorldSave(value, {
  worldId,
  generator,
  registry,
} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("World save must be an object");
  if (value.format !== WORLD_SAVE_FORMAT) throw new Error(`Unsupported world save format: ${value.format}`);
  const requestedGenerator = normalizeGeneratorIdentity(generator);
  const requestedRegistry = await registryIdentity(registry);
  assertIdentity(value.generator, requestedGenerator, "Generator identity");
  assertIdentity(value.registry, requestedRegistry, "Block registry identity");
  if (value.world?.id !== worldId) throw new Error(`World save targets ${value.world?.id}, not ${worldId}`);
  if (!Array.isArray(value.chunks) || value.chunks.length === 0 || value.chunks.length > MAX_SAVE_CHUNKS) {
    throw new RangeError("World save has an invalid chunk collection");
  }

  const chunks = [];
  const seen = new Set();
  let byteLength = 0;
  for (const [index, descriptor] of value.chunks.entries()) {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new TypeError(`World save chunk ${index} must be an object`);
    }
    const key = nonEmptyString(descriptor.key, `World save chunk ${index} key`);
    if (seen.has(key)) throw new Error(`World save contains duplicate chunk ${key}`);
    seen.add(key);
    const bytes = base64ToBytes(descriptor.bytes, `World save chunk ${key} bytes`);
    byteLength += bytes.byteLength;
    if (byteLength > MAX_SAVE_BYTES) throw new RangeError(`World save exceeds ${MAX_SAVE_BYTES} decoded bytes`);
    if (await digestChunkSnapshot(bytes) !== descriptor.digest) throw new Error(`World save chunk ${key} digest mismatch`);
    const chunk = decodeChunkSnapshot(bytes, {registry});
    if (chunk.key !== key) throw new Error(`World save chunk key mismatch for ${key}`);
    if (chunk.revision !== descriptor.revision) throw new Error(`World save chunk revision mismatch for ${key}`);
    if (canonicalStringify(chunk.coord) !== canonicalStringify(descriptor.coord)) {
      throw new Error(`World save chunk coordinate mismatch for ${key}`);
    }
    if (canonicalStringify(chunk.shape) !== canonicalStringify(descriptor.shape)) {
      throw new Error(`World save chunk shape mismatch for ${key}`);
    }
    const contentDigest = await digestChunkSnapshot({...chunk, revision: 0});
    if (contentDigest !== descriptor.contentDigest) throw new Error(`World save chunk ${key} content digest mismatch`);
    chunks.push(chunk);
  }
  chunks.sort((left, right) => left.key.localeCompare(right.key));
  const worldDigest = await digestCanonical(value.chunks
    .map((entry) => [entry.key, entry.contentDigest])
    .sort(([left], [right]) => left.localeCompare(right)));
  if (worldDigest !== value.world?.digest) throw new Error("World save aggregate content digest mismatch");
  const snapshotDigest = await digestCanonical(value.chunks
    .map((entry) => [entry.key, entry.revision, entry.digest])
    .sort(([left], [right]) => left.localeCompare(right)));
  if (snapshotDigest !== value.world?.snapshotDigest) throw new Error("World save aggregate snapshot digest mismatch");

  return Object.freeze({
    chunks: Object.freeze(chunks),
    player: normalizePlayerState(value.player),
    journal: normalizeJournal(value.journal ?? [], registry, "Restored journal"),
    undoStack: normalizeJournal(value.undoStack ?? [], registry, "Restored undo stack"),
    saveSequence: unsignedInteger(value.saveSequence ?? 0, "Restored save sequence"),
    transactionSequence: unsignedInteger(value.transactionSequence ?? 0, "Restored transaction sequence"),
    worldRevision: unsignedInteger(value.world?.revision ?? 0, "Restored world revision"),
    worldDigest,
    snapshotDigest,
    savedAt: nonEmptyString(value.savedAt, "Restored save timestamp"),
  });
}

export function resolveSafePlayerState({
  candidate,
  fallback,
  world,
  body = {},
  maxRise = 64,
} = {}) {
  if (!world?.getBlock || !world?.isSolidBlock) throw new TypeError("Safe player restoration requires a world runtime");
  const normalizedBody = normalizePlayerBody(body);
  const safe = (state) => !bodyIntersectsWorld({
    position: state.position,
    body: normalizedBody,
    getBlock: world.getBlock,
    isSolid: world.isSolidBlock,
    missingSolid: world.missingChunkPolicy === "solid",
  });
  const requested = normalizePlayerState(candidate);
  if (safe(requested)) return Object.freeze({state: requested, restored: true, rise: 0});
  const base = normalizePlayerState(fallback);
  for (let rise = 0; rise <= maxRise; rise += 1) {
    const state = normalizePlayerState({...base, position: [base.position[0], base.position[1] + rise, base.position[2]], velocity: [0, 0, 0], grounded: false});
    if (safe(state)) return Object.freeze({state, restored: false, rise});
  }
  throw new Error("No safe player spawn was found within the configured rise bound");
}
