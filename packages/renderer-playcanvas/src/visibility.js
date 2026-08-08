import { chunkKey, normalizeChunkShape } from "@greenways/alumbra-core/coordinates";

const finitePosition = (value) => {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => !Number.isFinite(Number(entry)))) {
    throw new TypeError("Camera position must contain three finite numbers");
  }
  return value.map(Number);
};

export function chunkCoordinateForPosition(position, shape = [32, 32, 32]) {
  const point = finitePosition(position);
  const size = normalizeChunkShape(shape);
  return Object.freeze(point.map((entry, axis) => Math.floor(entry / size[axis])));
}

export function visibleChunkCoordinates({
  position,
  shape = [32, 32, 32],
  horizontalDistance = 4,
  verticalDistance = 1,
} = {}) {
  if (!Number.isSafeInteger(horizontalDistance) || horizontalDistance < 0) {
    throw new RangeError("horizontalDistance must be a non-negative integer");
  }
  if (!Number.isSafeInteger(verticalDistance) || verticalDistance < 0) {
    throw new RangeError("verticalDistance must be a non-negative integer");
  }
  const center = chunkCoordinateForPosition(position, shape);
  const entries = [];
  for (let dy = -verticalDistance; dy <= verticalDistance; dy += 1) {
    for (let dz = -horizontalDistance; dz <= horizontalDistance; dz += 1) {
      for (let dx = -horizontalDistance; dx <= horizontalDistance; dx += 1) {
        const radiusSquared = dx * dx + dz * dz;
        if (radiusSquared > horizontalDistance * horizontalDistance) continue;
        const coord = Object.freeze([center[0] + dx, center[1] + dy, center[2] + dz]);
        entries.push({ coord, radiusSquared, vertical: Math.abs(dy) });
      }
    }
  }
  entries.sort((left, right) => left.radiusSquared - right.radiusSquared
    || left.vertical - right.vertical
    || left.coord[1] - right.coord[1]
    || left.coord[2] - right.coord[2]
    || left.coord[0] - right.coord[0]);
  return Object.freeze(entries.map((entry) => entry.coord));
}

export function visibleChunkKeys(options) {
  return new Set(visibleChunkCoordinates(options).map(chunkKey));
}
