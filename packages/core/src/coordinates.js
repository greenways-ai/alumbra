import { validationError } from "./errors.js";

export const DEFAULT_CHUNK_SHAPE = Object.freeze([32, 32, 32]);
export const MAX_CHUNK_VOLUME = 16 * 1024 * 1024;

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value)) {
    validationError(`${label} must be a safe integer`, "coordinate/integer", { label, value });
  }
  return value;
}

export function normalizeVector3(value, label = "vector") {
  if (!Array.isArray(value) || value.length !== 3) {
    validationError(`${label} must contain exactly three integers`, "coordinate/vector", { label });
  }
  return Object.freeze(value.map((entry, index) => safeInteger(entry, `${label}[${index}]`)));
}

export function normalizeChunkShape(value = DEFAULT_CHUNK_SHAPE) {
  const shape = normalizeVector3(value, "chunk shape");
  for (const entry of shape) {
    if (entry < 1 || entry > 0xffff) {
      validationError("Chunk shape entries must be between 1 and 65535", "coordinate/shape", { shape });
    }
  }
  const volume = shape[0] * shape[1] * shape[2];
  if (!Number.isSafeInteger(volume) || volume > MAX_CHUNK_VOLUME) {
    validationError(`Chunk volume exceeds ${MAX_CHUNK_VOLUME}`, "coordinate/volume", { shape, volume });
  }
  return shape;
}

export function chunkVolume(shape = DEFAULT_CHUNK_SHAPE) {
  const normalized = normalizeChunkShape(shape);
  return normalized[0] * normalized[1] * normalized[2];
}

export function floorDiv(value, divisor) {
  safeInteger(value, "value");
  safeInteger(divisor, "divisor");
  if (divisor <= 0) validationError("Divisor must be positive", "coordinate/divisor", { divisor });
  return Math.floor(value / divisor);
}

export function positiveMod(value, divisor) {
  return value - floorDiv(value, divisor) * divisor;
}

export function worldToChunk(world, shape = DEFAULT_CHUNK_SHAPE) {
  const point = normalizeVector3(world, "world coordinate");
  const size = normalizeChunkShape(shape);
  const chunk = point.map((entry, axis) => floorDiv(entry, size[axis]));
  const local = point.map((entry, axis) => positiveMod(entry, size[axis]));
  return Object.freeze({
    chunk: Object.freeze(chunk),
    local: Object.freeze(local),
  });
}

export function chunkToWorld(chunk, local, shape = DEFAULT_CHUNK_SHAPE) {
  const chunkCoordinate = normalizeVector3(chunk, "chunk coordinate");
  const localCoordinate = normalizeLocalCoordinate(local, shape);
  const size = normalizeChunkShape(shape);
  return Object.freeze(chunkCoordinate.map((entry, axis) => entry * size[axis] + localCoordinate[axis]));
}

export function normalizeLocalCoordinate(local, shape = DEFAULT_CHUNK_SHAPE) {
  const point = normalizeVector3(local, "local coordinate");
  const size = normalizeChunkShape(shape);
  point.forEach((entry, axis) => {
    if (entry < 0 || entry >= size[axis]) {
      validationError("Local coordinate is outside the chunk", "coordinate/local-range", {
        local: point,
        shape: size,
        axis,
      });
    }
  });
  return point;
}

export function localToIndex(local, shape = DEFAULT_CHUNK_SHAPE) {
  const [x, y, z] = normalizeLocalCoordinate(local, shape);
  const [sizeX, sizeY] = normalizeChunkShape(shape);
  return x + sizeX * (y + sizeY * z);
}

export function indexToLocal(index, shape = DEFAULT_CHUNK_SHAPE) {
  safeInteger(index, "voxel index");
  const size = normalizeChunkShape(shape);
  const volume = size[0] * size[1] * size[2];
  if (index < 0 || index >= volume) {
    validationError("Voxel index is outside the chunk", "coordinate/index-range", { index, volume });
  }
  const x = index % size[0];
  const remainder = Math.floor(index / size[0]);
  const y = remainder % size[1];
  const z = Math.floor(remainder / size[1]);
  return Object.freeze([x, y, z]);
}

export function chunkKey(coord) {
  return normalizeVector3(coord, "chunk coordinate").join(",");
}
