import {
  blockValueKey,
  BLOCK_ID_PATTERN,
  normalizeBlockValue,
} from "./block-registry.js";
import { canonicalStringify, canonicalValue, deepFreeze } from "./canonical.js";
import {
  createChunkFromStorage,
  indexWidthForPalette,
} from "./chunk.js";
import { chunkVolume, normalizeChunkShape, normalizeVector3 } from "./coordinates.js";
import { validationError } from "./errors.js";

export const SNAPSHOT_FORMAT = "alumbra.chunk-snapshot/1";

const MAGIC = Object.freeze([0x41, 0x4c, 0x43, 0x48]); // ALCH
const VERSION = 1;
const HEADER_LENGTH = 38;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const asBytes = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  validationError("Snapshot must be an ArrayBuffer or byte view", "snapshot/bytes");
};

function canonicalPalette(chunk) {
  const keyToValue = new Map();
  const oldIndexToKey = new Map();
  for (let index = 0; index < chunk.palette.length; index += 1) {
    const value = chunk.palette[index];
    const key = blockValueKey(value);
    keyToValue.set(key, value);
    oldIndexToKey.set(index, key);
  }

  const usedKeys = new Set();
  for (const index of chunk.indices) {
    const key = oldIndexToKey.get(index);
    if (key == null) {
      validationError("Chunk references a missing palette entry", "snapshot/palette-index", { index });
    }
    usedKeys.add(key);
  }

  const keys = [...usedKeys].sort();
  const keyToCanonicalIndex = new Map(keys.map((key, index) => [key, index]));
  const remap = new Map(
    [...oldIndexToKey.entries()].map(([index, key]) => [index, keyToCanonicalIndex.get(key)]),
  );
  return {
    keys,
    values: keys.map((key) => keyToValue.get(key)),
    remap,
  };
}

export function encodeChunkSnapshot(chunk) {
  const coord = normalizeVector3(chunk.coord, "chunk coordinate");
  const shape = normalizeChunkShape(chunk.shape);
  const volume = chunkVolume(shape);
  if (chunk.indices.length !== volume) {
    validationError("Chunk indices do not match the declared shape", "snapshot/volume");
  }
  if (!Number.isSafeInteger(chunk.revision) || chunk.revision < 0 || chunk.revision > 0xffffffff) {
    validationError("Chunk revision is outside the snapshot range", "snapshot/revision");
  }

  const canonical = canonicalPalette(chunk);
  const paletteBytes = canonical.keys.map((key) => encoder.encode(key));
  const indexWidth = indexWidthForPalette(canonical.keys.length);
  const totalLength = HEADER_LENGTH
    + paletteBytes.reduce((sum, bytes) => sum + 4 + bytes.byteLength, 0)
    + volume * indexWidth;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  let offset = 0;

  for (const byte of MAGIC) output[offset++] = byte;
  view.setUint8(offset++, VERSION);
  view.setUint8(offset++, indexWidth);
  view.setUint16(offset, 0, true); offset += 2;
  for (const entry of shape) {
    view.setUint16(offset, entry, true);
    offset += 2;
  }
  for (const entry of coord) {
    if (entry < -0x80000000 || entry > 0x7fffffff) {
      validationError("Chunk coordinate is outside signed 32-bit snapshot range", "snapshot/coordinate", {
        coord,
      });
    }
    view.setInt32(offset, entry, true);
    offset += 4;
  }
  view.setUint32(offset, chunk.revision, true); offset += 4;
  view.setUint32(offset, canonical.keys.length, true); offset += 4;
  view.setUint32(offset, volume, true); offset += 4;

  for (const bytes of paletteBytes) {
    view.setUint32(offset, bytes.byteLength, true); offset += 4;
    output.set(bytes, offset);
    offset += bytes.byteLength;
  }

  for (const oldIndex of chunk.indices) {
    const index = canonical.remap.get(oldIndex);
    if (indexWidth === 1) view.setUint8(offset, index);
    else if (indexWidth === 2) view.setUint16(offset, index, true);
    else view.setUint32(offset, index, true);
    offset += indexWidth;
  }

  return output;
}

function readBounded(view, bytes, state, length, label) {
  if (!Number.isSafeInteger(length) || length < 0 || state.offset + length > bytes.byteLength) {
    validationError(`Snapshot ended while reading ${label}`, "snapshot/truncated", {
      offset: state.offset,
      length,
      byteLength: bytes.byteLength,
    });
  }
}

function readUint8(view, bytes, state, label) {
  readBounded(view, bytes, state, 1, label);
  return view.getUint8(state.offset++);
}

function readUint16(view, bytes, state, label) {
  readBounded(view, bytes, state, 2, label);
  const value = view.getUint16(state.offset, true);
  state.offset += 2;
  return value;
}

function readUint32(view, bytes, state, label) {
  readBounded(view, bytes, state, 4, label);
  const value = view.getUint32(state.offset, true);
  state.offset += 4;
  return value;
}

function readInt32(view, bytes, state, label) {
  readBounded(view, bytes, state, 4, label);
  const value = view.getInt32(state.offset, true);
  state.offset += 4;
  return value;
}

function normalizePortableBlockValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError("Snapshot palette entry must be a block object", "snapshot/block");
  }
  const id = String(value.id || "");
  if (!BLOCK_ID_PATTERN.test(id)) {
    validationError(`Snapshot contains invalid block id: ${id}`, "snapshot/block-id", { id });
  }
  const state = canonicalValue(value.state ?? {}, { label: `Snapshot block ${id} state` });
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    validationError("Snapshot block state must be an object", "snapshot/block-state", { id });
  }
  return deepFreeze({ id, state: deepFreeze(state) });
}

export function decodeChunkSnapshot(value, { registry = null } = {}) {
  const bytes = asBytes(value);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const state = { offset: 0 };

  readBounded(view, bytes, state, HEADER_LENGTH, "header");
  for (const expected of MAGIC) {
    if (readUint8(view, bytes, state, "magic") !== expected) {
      validationError("Snapshot has an invalid magic value", "snapshot/magic");
    }
  }
  const version = readUint8(view, bytes, state, "version");
  if (version !== VERSION) {
    validationError(`Unsupported snapshot version: ${version}`, "snapshot/version", { version });
  }
  const indexWidth = readUint8(view, bytes, state, "index width");
  const flags = readUint16(view, bytes, state, "flags");
  if (flags !== 0) validationError("Snapshot contains unsupported flags", "snapshot/flags", { flags });

  const shape = [
    readUint16(view, bytes, state, "shape x"),
    readUint16(view, bytes, state, "shape y"),
    readUint16(view, bytes, state, "shape z"),
  ];
  const coord = [
    readInt32(view, bytes, state, "coord x"),
    readInt32(view, bytes, state, "coord y"),
    readInt32(view, bytes, state, "coord z"),
  ];
  const revision = readUint32(view, bytes, state, "revision");
  const paletteLength = readUint32(view, bytes, state, "palette length");
  const encodedVolume = readUint32(view, bytes, state, "volume");

  const normalizedShape = normalizeChunkShape(shape);
  const volume = chunkVolume(normalizedShape);
  if (encodedVolume !== volume) {
    validationError("Snapshot volume does not match its shape", "snapshot/volume", {
      encodedVolume,
      volume,
    });
  }
  if (paletteLength < 1 || paletteLength > volume) {
    validationError("Snapshot palette length is outside its bounds", "snapshot/palette-size", {
      paletteLength,
      volume,
    });
  }
  const expectedWidth = indexWidthForPalette(paletteLength);
  if (indexWidth !== expectedWidth) {
    validationError("Snapshot index width is not canonical for its palette", "snapshot/index-width", {
      indexWidth,
      expectedWidth,
    });
  }

  const palette = [];
  let previousKey = null;
  for (let index = 0; index < paletteLength; index += 1) {
    const length = readUint32(view, bytes, state, `palette ${index} length`);
    readBounded(view, bytes, state, length, `palette ${index}`);
    let text;
    try {
      text = decoder.decode(bytes.subarray(state.offset, state.offset + length));
    } catch {
      validationError("Snapshot palette contains invalid UTF-8", "snapshot/utf8", { index });
    }
    state.offset += length;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      validationError("Snapshot palette contains invalid JSON", "snapshot/json", { index });
    }
    const block = registry
      ? normalizeBlockValue(registry, parsed)
      : normalizePortableBlockValue(parsed);
    const key = canonicalStringify(block, { label: "Snapshot block value" });
    if (key !== text) {
      validationError("Snapshot palette entry is not canonically encoded", "snapshot/non-canonical", {
        index,
      });
    }
    if (previousKey !== null && key <= previousKey) {
      validationError("Snapshot palette entries must be unique and sorted", "snapshot/palette-order", {
        index,
      });
    }
    previousKey = key;
    palette.push(block);
  }

  const expectedRemaining = volume * indexWidth;
  if (state.offset + expectedRemaining !== bytes.byteLength) {
    validationError("Snapshot byte length does not match its voxel data", "snapshot/length", {
      offset: state.offset,
      expectedRemaining,
      byteLength: bytes.byteLength,
    });
  }

  const indices = indexWidth === 1
    ? new Uint8Array(volume)
    : indexWidth === 2
      ? new Uint16Array(volume)
      : new Uint32Array(volume);
  for (let index = 0; index < volume; index += 1) {
    const paletteIndex = indexWidth === 1
      ? readUint8(view, bytes, state, `voxel ${index}`)
      : indexWidth === 2
        ? readUint16(view, bytes, state, `voxel ${index}`)
        : readUint32(view, bytes, state, `voxel ${index}`);
    if (paletteIndex >= paletteLength) {
      validationError("Snapshot voxel references a missing palette entry", "snapshot/index-range", {
        index,
        paletteIndex,
        paletteLength,
      });
    }
    indices[index] = paletteIndex;
  }

  return createChunkFromStorage({
    coord,
    shape: normalizedShape,
    revision,
    palette,
    indices,
  });
}

export async function digestChunkSnapshot(value) {
  const bytes = value?.format === "alumbra.chunk/1" ? encodeChunkSnapshot(value) : asBytes(value);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    validationError("Web Crypto SHA-256 is unavailable", "snapshot/crypto");
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((entry) => entry.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
