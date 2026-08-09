import {
  chunkKey,
  normalizeChunkShape,
  normalizeVector3,
  validationError,
  worldToChunk,
} from "@greenways/alumbra-core";
import {
  DEFAULT_LIGHTING_PROFILE,
  LIGHT_FIELD_SET_FORMAT,
  MAX_LIGHT_CHUNKS,
  MAX_LIGHT_VOXELS,
  buildVoxelLightFields,
  normalizeLightingProfile,
} from "./lighting.js";

export const LIGHTING_JOB_FORMAT = "alumbra.lighting-job/1";
export const LIGHTING_JOB_EVIDENCE_FORMAT = "alumbra.lighting-job-evidence/1";
export const LIGHTING_INSTALLATION_FORMAT = "alumbra.lighting-installation/1";
export const LIGHTING_INVALIDATION_FORMAT = "alumbra.lighting-invalidation/1";
export const LIGHTING_RUNTIME_EVIDENCE_FORMAT = "alumbra.lighting-runtime-evidence/1";

const compareCoord = (left, right) => left.coord[0] - right.coord[0]
  || left.coord[1] - right.coord[1]
  || left.coord[2] - right.coord[2];

const counter = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    validationError(`${label} must be a non-negative safe integer`, "lighting/counter", {
      label,
      value,
    });
  }
  return value;
};

const chunkValues = (input) => input instanceof Map
  ? [...input.values()]
  : Array.isArray(input)
    ? [...input]
    : validationError("Lighting chunks must be an array or Map", "lighting/chunks");

const normalizeRuntimeChunks = (input) => {
  const values = chunkValues(input);
  if (values.length > MAX_LIGHT_CHUNKS) {
    validationError(`Lighting exceeds ${MAX_LIGHT_CHUNKS} loaded chunks`, "lighting/chunk-limit");
  }
  const chunks = new Map();
  let shape = null;
  let volume = 0;
  let totalVoxels = 0;
  for (const chunk of values) {
    if (!chunk || chunk.format !== "alumbra.chunk/1") {
      validationError("Lighting runtime requires canonical chunks", "lighting/chunk");
    }
    const key = chunkKey(chunk.coord);
    if (key !== chunk.key || chunks.has(key)) {
      validationError(`Lighting runtime contains invalid or duplicate chunk ${key}`, "lighting/chunk-key");
    }
    const chunkShape = normalizeChunkShape(chunk.shape);
    if (shape == null) {
      shape = chunkShape;
      volume = chunk.volume;
    } else if (shape.some((entry, axis) => entry !== chunkShape[axis])) {
      validationError("Lighting runtime chunks must use one shape", "lighting/chunk-shape");
    }
    if (chunk.volume !== volume || chunk.indices?.length !== volume) {
      validationError(`Lighting runtime chunk ${key} has inconsistent storage`, "lighting/chunk-storage");
    }
    totalVoxels += chunk.volume;
    if (!Number.isSafeInteger(totalVoxels) || totalVoxels > MAX_LIGHT_VOXELS) {
      validationError(`Lighting exceeds ${MAX_LIGHT_VOXELS} loaded voxels`, "lighting/voxel-limit");
    }
    chunks.set(key, chunk);
  }
  return {
    chunks,
    shape,
    volume,
    totalVoxels,
  };
};

const coordinate = (value, label = "Lighting chunk coordinate") => {
  if (Array.isArray(value)) return normalizeVector3(value, label);
  if (value?.coord) return normalizeVector3(value.coord, label);
  const text = String(value);
  const parts = text.split(",").map((entry) => Number(entry));
  const coord = normalizeVector3(parts, label);
  if (chunkKey(coord) !== text) {
    validationError(`${label} key is not canonical`, "lighting/chunk-key", { value: text });
  }
  return coord;
};

const normalizeCoordinates = (values, label = "Changed lighting chunks") => {
  const input = Array.isArray(values)
    && (values.length === 0 || Array.isArray(values[0]) || values[0]?.coord || typeof values[0] === "string")
    ? values
    : [values];
  const output = new Map();
  for (const [index, value] of input.entries()) {
    const coord = coordinate(value, `${label} ${index}`);
    output.set(chunkKey(coord), coord);
  }
  return Object.freeze([...output.values()].sort((left, right) => left[0] - right[0]
    || left[1] - right[1]
    || left[2] - right[2]));
};

const chunkStepDistance = (left, right, shape, maximum) => {
  let distance = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = Math.abs(left[axis] - right[axis]);
    if (delta === 0) continue;
    const beyond = Math.floor((maximum - distance - 1) / shape[axis]) + 1;
    if (delta > beyond) return maximum + 1;
    distance += (delta - 1) * shape[axis] + 1;
    if (distance > maximum) return distance;
  }
  return distance;
};

export function affectedLightingChunkKeys({
  changed,
  chunks,
  shape: shapeValue,
  radius = 15,
} = {}) {
  const shape = normalizeChunkShape(shapeValue);
  const maximum = counter(radius, "Lighting invalidation radius");
  if (maximum > 15) {
    validationError("Lighting invalidation radius must not exceed 15", "lighting/invalidation-radius");
  }
  const changedCoords = normalizeCoordinates(changed);
  const loaded = chunkValues(chunks).map((chunk) => ({
    key: chunkKey(chunk.coord),
    coord: normalizeVector3(chunk.coord, "Loaded lighting chunk coordinate"),
  })).sort(compareCoord);
  return Object.freeze(loaded
    .filter((entry) => changedCoords.some((source) =>
      chunkStepDistance(source, entry.coord, shape, maximum) <= maximum))
    .map((entry) => entry.key));
}

const revisionsFor = (chunks) => Object.freeze([...chunks.values()]
  .sort(compareCoord)
  .map((chunk) => Object.freeze({
    key: chunk.key,
    coord: chunk.coord,
    revision: chunk.revision,
  })));

const revisionsEqual = (left, right) => Array.isArray(left)
  && left.length === right.length
  && left.every((entry, index) => entry.key === right[index].key
    && entry.revision === right[index].revision
    && entry.coord.every((value, axis) => value === right[index].coord[axis]));

export function createLightingJob({
  registry,
  chunks = [],
  profile: profileValue = DEFAULT_LIGHTING_PROFILE,
  generation = 0,
  epoch = 0,
} = {}) {
  const state = normalizeRuntimeChunks(chunks);
  const profile = normalizeLightingProfile(profileValue);
  const normalizedGeneration = counter(generation, "Lighting job generation");
  const normalizedEpoch = counter(epoch, "Lighting job epoch");
  const captured = Object.freeze([...state.chunks.values()].sort(compareCoord));
  const sourceRevisions = revisionsFor(state.chunks);
  const evidence = Object.freeze({
    format: LIGHTING_JOB_EVIDENCE_FORMAT,
    profileId: profile.id,
    generation: normalizedGeneration,
    epoch: normalizedEpoch,
    chunks: captured.length,
    voxels: state.totalVoxels,
    sourceRevisions,
  });
  return Object.freeze({
    format: LIGHTING_JOB_FORMAT,
    profile,
    generation: normalizedGeneration,
    epoch: normalizedEpoch,
    sourceRevisions,
    run() {
      return buildVoxelLightFields({
        registry,
        chunks: captured,
        profile,
        generation: normalizedGeneration,
        epoch: normalizedEpoch,
      });
    },
    evidence() { return evidence; },
  });
}

export function createLightingRuntime({
  registry,
  chunks = [],
  profile: profileValue = DEFAULT_LIGHTING_PROFILE,
} = {}) {
  if (!registry || typeof registry.get !== "function") {
    validationError("Lighting runtime requires a block registry", "lighting/registry");
  }
  const initial = normalizeRuntimeChunks(chunks);
  const profile = normalizeLightingProfile(profileValue);
  const map = initial.chunks;
  let shape = initial.shape;
  let totalVoxels = initial.totalVoxels;
  let epoch = 0;
  let requestedGeneration = 0;
  let installedGeneration = 0;
  let installed = null;
  let installs = 0;
  let rejectedStaleResults = 0;
  let status = map.size > 0 ? "dirty" : "idle";
  let destroyed = false;
  const invalidated = new Set(map.keys());
  let lastInvalidation = Object.freeze({
    format: LIGHTING_INVALIDATION_FORMAT,
    epoch,
    changed: Object.freeze([...map.keys()]),
    affected: Object.freeze([...map.keys()]),
  });

  const ensureActive = () => {
    if (destroyed) validationError("Lighting runtime has been destroyed", "lighting/runtime-destroyed");
  };

  const fieldFor = (coordOrKey) => {
    const key = Array.isArray(coordOrKey) ? chunkKey(coordOrKey) : String(coordOrKey);
    if (invalidated.has(key)) return null;
    const chunk = map.get(key);
    const field = installed?.getField(key) ?? null;
    if (!chunk || !field || field.sourceRevision !== chunk.revision) return null;
    return field;
  };

  const runtimeEvidence = () => {
    const keys = Object.freeze([...invalidated].sort());
    let validFieldChunks = 0;
    for (const key of map.keys()) if (fieldFor(key)) validFieldChunks += 1;
    return Object.freeze({
      format: LIGHTING_RUNTIME_EVIDENCE_FORMAT,
      status,
      profileId: profile.id,
      epoch,
      requestedGeneration,
      installedGeneration,
      loadedChunks: map.size,
      loadedVoxels: totalVoxels,
      installedFieldChunks: installed?.evidence().chunks ?? 0,
      validFieldChunks,
      invalidatedChunks: keys.length,
      invalidatedKeys: keys,
      installs,
      rejectedStaleResults,
      lastInvalidation,
      baseline: destroyed
        && map.size === 0
        && installed == null
        && invalidated.size === 0,
    });
  };

  const markChanged = (values) => {
    const changedCoords = normalizeCoordinates(values);
    if (changedCoords.length === 0) return lastInvalidation;
    epoch += 1;
    const affected = shape == null
      ? Object.freeze([])
      : affectedLightingChunkKeys({
        changed: changedCoords,
        chunks: map,
        shape,
        radius: profile.maxLevel,
      });
    for (const key of affected) invalidated.add(key);
    lastInvalidation = Object.freeze({
      format: LIGHTING_INVALIDATION_FORMAT,
      epoch,
      changed: Object.freeze(changedCoords.map(chunkKey)),
      affected,
    });
    status = map.size > 0 ? "dirty" : "idle";
    return lastInvalidation;
  };

  const rejection = (result, reason) => {
    rejectedStaleResults += 1;
    return Object.freeze({
      format: LIGHTING_INSTALLATION_FORMAT,
      installed: false,
      reason,
      generation: result?.generation ?? null,
      epoch: result?.epoch ?? null,
      currentGeneration: requestedGeneration,
      currentEpoch: epoch,
    });
  };

  return Object.freeze({
    profile,
    evidence: runtimeEvidence,
    chunks() { return new Map(map); },
    getField(coordOrKey) {
      ensureActive();
      return fieldFor(coordOrKey);
    },
    sample(world) {
      ensureActive();
      if (shape == null) return null;
      const location = worldToChunk(world, shape);
      const field = fieldFor(chunkKey(location.chunk));
      return field ? field.sample(location.local) : null;
    },
    invalidate(values) {
      ensureActive();
      return markChanged(values);
    },
    updateChunk(chunk) {
      ensureActive();
      if (!chunk || chunk.format !== "alumbra.chunk/1") {
        validationError("Lighting update requires a canonical chunk", "lighting/chunk");
      }
      const key = chunkKey(chunk.coord);
      if (key !== chunk.key) validationError("Lighting update chunk key is invalid", "lighting/chunk-key");
      const chunkShape = normalizeChunkShape(chunk.shape);
      if (shape == null) shape = chunkShape;
      else if (shape.some((entry, axis) => entry !== chunkShape[axis])) {
        validationError("Lighting update chunk shape does not match the runtime", "lighting/chunk-shape");
      }
      const previous = map.get(key);
      const nextTotal = totalVoxels - (previous?.volume ?? 0) + chunk.volume;
      if (map.size + (previous ? 0 : 1) > MAX_LIGHT_CHUNKS || nextTotal > MAX_LIGHT_VOXELS) {
        validationError("Lighting update exceeds the runtime bounds", "lighting/runtime-limit");
      }
      map.set(key, chunk);
      totalVoxels = nextTotal;
      return markChanged([chunk.coord]);
    },
    removeChunk(coordOrKey) {
      ensureActive();
      const coord = coordinate(coordOrKey);
      const key = chunkKey(coord);
      const previous = map.get(key);
      if (!previous) return Object.freeze({
        format: LIGHTING_INVALIDATION_FORMAT,
        epoch,
        changed: Object.freeze([]),
        affected: Object.freeze([]),
      });
      map.delete(key);
      totalVoxels -= previous.volume;
      invalidated.delete(key);
      return markChanged([coord]);
    },
    plan() {
      ensureActive();
      requestedGeneration += 1;
      return createLightingJob({
        registry,
        chunks: map,
        profile,
        generation: requestedGeneration,
        epoch,
      });
    },
    install(result) {
      ensureActive();
      if (!result || result.format !== LIGHT_FIELD_SET_FORMAT
        || typeof result.getField !== "function"
        || typeof result.evidence !== "function") {
        validationError("Lighting install requires a light-field set", "lighting/result");
      }
      if (JSON.stringify(result.profile) !== JSON.stringify(profile)) {
        return rejection(result, "profile-mismatch");
      }
      if (result.generation !== requestedGeneration) {
        return rejection(result, "stale-generation");
      }
      const currentRevisions = revisionsFor(map);
      if (!revisionsEqual(result.sourceRevisions, currentRevisions)) {
        return rejection(result, "stale-revision");
      }
      if (result.epoch !== epoch) {
        return rejection(result, "stale-epoch");
      }
      installed = result;
      installedGeneration = result.generation;
      invalidated.clear();
      installs += 1;
      status = map.size > 0 ? "ready" : "idle";
      return Object.freeze({
        format: LIGHTING_INSTALLATION_FORMAT,
        installed: true,
        reason: null,
        generation: result.generation,
        epoch: result.epoch,
        chunks: result.evidence().chunks,
      });
    },
    rebuild() {
      ensureActive();
      const job = this.plan();
      const result = job.run();
      const installation = this.install(result);
      return Object.freeze({ job, result, installation });
    },
    destroy() {
      if (destroyed) return runtimeEvidence();
      map.clear();
      invalidated.clear();
      installed = null;
      shape = null;
      totalVoxels = 0;
      destroyed = true;
      status = "disposed";
      return runtimeEvidence();
    },
  });
}
