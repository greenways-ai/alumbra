import {
  chunkKey,
  deepFreeze,
  floorDiv,
  normalizeVector3,
  positiveMod,
  validationError,
} from "@greenways/alumbra-core";

export const DEFAULT_REGION_SHAPE = Object.freeze([8, 4, 8]);
const MAX_REGION_AXIS = 1024;
const MAX_REGION_VOLUME = 1024 * 1024;

export function normalizeRegionShape(value = DEFAULT_REGION_SHAPE) {
  if (!Array.isArray(value) || value.length !== 3) {
    validationError("Region shape must contain three integer axes", "history/region-shape");
  }
  const shape = value.map((entry, index) => {
    if (!Number.isSafeInteger(entry) || entry <= 0 || entry > MAX_REGION_AXIS) {
      validationError(
        `Region shape axis ${index} must be between 1 and ${MAX_REGION_AXIS}`,
        "history/region-shape",
        { index, value: entry },
      );
    }
    return entry;
  });
  const volume = shape[0] * shape[1] * shape[2];
  if (!Number.isSafeInteger(volume) || volume > MAX_REGION_VOLUME) {
    validationError(
      `Region shape volume exceeds ${MAX_REGION_VOLUME} chunks`,
      "history/region-volume",
      { shape, volume },
    );
  }
  return Object.freeze(shape);
}

export function regionKey(value) {
  return chunkKey(normalizeVector3(value, "region coordinate"));
}

export function chunkToRegionAddress(chunkCoordinate, regionShape = DEFAULT_REGION_SHAPE) {
  const chunk = normalizeVector3(chunkCoordinate, "chunk coordinate");
  const shape = normalizeRegionShape(regionShape);
  const region = chunk.map((entry, index) => floorDiv(entry, shape[index]));
  const local = chunk.map((entry, index) => positiveMod(entry, shape[index]));
  return deepFreeze({
    chunk,
    region,
    local,
    regionKey: chunkKey(region),
  });
}
