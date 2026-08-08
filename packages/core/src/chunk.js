import { blockValueKey, normalizeBlockValue } from "./block-registry.js";
import {
  chunkKey,
  chunkVolume,
  localToIndex,
  normalizeChunkShape,
  normalizeVector3,
} from "./coordinates.js";
import { validationError } from "./errors.js";

export const CHUNK_FORMAT = "alumbra.chunk/1";

export function indexWidthForPalette(paletteLength) {
  if (!Number.isSafeInteger(paletteLength) || paletteLength < 1 || paletteLength > 0xffffffff) {
    validationError("Palette length is outside the supported range", "chunk/palette-size", {
      paletteLength,
    });
  }
  if (paletteLength <= 0x100) return 1;
  if (paletteLength <= 0x10000) return 2;
  return 4;
}

function IndexArray(width, length) {
  if (width === 1) return new Uint8Array(length);
  if (width === 2) return new Uint16Array(length);
  if (width === 4) return new Uint32Array(length);
  validationError(`Unsupported index width: ${width}`, "chunk/index-width", { width });
}

function assertRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    validationError("Chunk revision must be an unsigned 32-bit integer", "chunk/revision", {
      revision: value,
    });
  }
  return value;
}

function assertIndices(indices, width, volume, paletteLength) {
  const expected = width === 1 ? Uint8Array : width === 2 ? Uint16Array : Uint32Array;
  if (!(indices instanceof expected) || indices.length !== volume) {
    validationError("Chunk indices do not match width or volume", "chunk/indices", {
      width,
      volume,
    });
  }
  for (const index of indices) {
    if (index >= paletteLength) {
      validationError("Chunk contains a palette index outside its palette", "chunk/index-range", {
        index,
        paletteLength,
      });
    }
  }
}

export function createChunkFromStorage({
  coord,
  shape,
  revision,
  palette,
  indices,
}) {
  const normalizedCoord = normalizeVector3(coord, "chunk coordinate");
  const normalizedShape = normalizeChunkShape(shape);
  const volume = chunkVolume(normalizedShape);
  const normalizedRevision = assertRevision(revision);
  if (!Array.isArray(palette) || palette.length === 0) {
    validationError("Chunk palette must not be empty", "chunk/palette");
  }
  const frozenPalette = Object.freeze(palette.map((entry) => Object.freeze({
    id: String(entry.id),
    state: Object.freeze({ ...(entry.state ?? {}) }),
  })));
  const width = indexWidthForPalette(frozenPalette.length);
  assertIndices(indices, width, volume, frozenPalette.length);
  return Object.freeze({
    format: CHUNK_FORMAT,
    coord: normalizedCoord,
    key: chunkKey(normalizedCoord),
    shape: normalizedShape,
    volume,
    revision: normalizedRevision,
    palette: frozenPalette,
    indices,
    indexWidth: width,
  });
}

export function createChunk({
  registry,
  coord = [0, 0, 0],
  shape = [32, 32, 32],
  revision = 0,
  fill = null,
} = {}) {
  if (!registry) validationError("Chunk creation requires a block registry", "chunk/registry");
  const block = normalizeBlockValue(registry, fill ?? registry.emptyBlock);
  const normalizedShape = normalizeChunkShape(shape);
  const volume = chunkVolume(normalizedShape);
  return createChunkFromStorage({
    coord,
    shape: normalizedShape,
    revision,
    palette: [block],
    indices: new Uint8Array(volume),
  });
}

export function getBlockAtIndex(chunk, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= chunk.volume) {
    validationError("Voxel index is outside the chunk", "chunk/index-range", {
      index,
      volume: chunk.volume,
    });
  }
  return chunk.palette[chunk.indices[index]];
}

export function getBlock(chunk, local) {
  return getBlockAtIndex(chunk, localToIndex(local, chunk.shape));
}

export function patchChunk(chunk, updates, registry, {
  revision = chunk.revision + 1,
} = {}) {
  if (!Array.isArray(updates) || updates.length === 0) return chunk;
  assertRevision(revision);

  const palette = [...chunk.palette];
  const paletteIndex = new Map(palette.map((entry, index) => [blockValueKey(entry), index]));
  const normalizedUpdates = [];
  const targetIndices = new Set();

  for (const [position, update] of updates.entries()) {
    if (!update || typeof update !== "object") {
      validationError(`Chunk update ${position} must be an object`, "chunk/update");
    }
    const index = update.index == null
      ? localToIndex(update.local, chunk.shape)
      : update.index;
    if (!Number.isSafeInteger(index) || index < 0 || index >= chunk.volume) {
      validationError("Chunk update index is outside the chunk", "chunk/update-range", { index });
    }
    if (targetIndices.has(index)) {
      validationError("Chunk patch contains duplicate voxel targets", "chunk/update-duplicate", { index });
    }
    targetIndices.add(index);

    const block = normalizeBlockValue(registry, update.value);
    const key = blockValueKey(block);
    let paletteEntry = paletteIndex.get(key);
    if (paletteEntry == null) {
      paletteEntry = palette.length;
      palette.push(block);
      paletteIndex.set(key, paletteEntry);
    }
    normalizedUpdates.push({ index, paletteEntry });
  }

  const width = indexWidthForPalette(palette.length);
  const indices = IndexArray(width, chunk.volume);
  indices.set(chunk.indices);
  for (const update of normalizedUpdates) indices[update.index] = update.paletteEntry;

  return createChunkFromStorage({
    coord: chunk.coord,
    shape: chunk.shape,
    revision,
    palette,
    indices,
  });
}

export function setBlock(chunk, local, value, registry, options) {
  return patchChunk(chunk, [{ local, value }], registry, options);
}

export function cloneChunk(chunk) {
  const indices = IndexArray(chunk.indexWidth, chunk.volume);
  indices.set(chunk.indices);
  return createChunkFromStorage({
    coord: chunk.coord,
    shape: chunk.shape,
    revision: chunk.revision,
    palette: chunk.palette,
    indices,
  });
}
