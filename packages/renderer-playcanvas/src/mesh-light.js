import {
  chunkKey,
  chunkVolume,
  localToIndex,
  normalizeChunkShape,
  normalizeVector3,
  validationError,
  worldToChunk,
} from "@greenways/alumbra-core";

export const MESH_LIGHT_SNAPSHOT_FORMAT = "alumbra.mesh-light-snapshot/1";
export const MESH_LIGHTING_FORMAT = "alumbra.mesh-lighting/1";
export const MESH_LIGHTING_CONTEXT_FORMAT = "alumbra.mesh-lighting-context/1";
export const MAX_MESH_LIGHT_SNAPSHOTS = 7;

const SNAPSHOT_FIELDS = new Set([
  "format",
  "profileId",
  "generation",
  "epoch",
  "maxLevel",
  "key",
  "coord",
  "shape",
  "sourceRevision",
  "sunlight",
  "emitted",
]);
const LIGHTING_FIELDS = new Set([
  "format",
  "profileId",
  "generation",
  "epoch",
  "maxLevel",
  "targetKey",
  "shape",
  "sourceFields",
]);
const SOURCE_FIELD_FIELDS = new Set(["key", "coord", "sourceRevision"]);
const ID_PATTERN = /^[a-z][a-z0-9._:/-]*$/;

const plainObject = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactObject = (value, label, fields) => {
  if (!plainObject(value)) validationError(`${label} must be an object`, "mesh-light/object", { label });
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      validationError(`${label} contains unknown field ${key}`, "mesh-light/field", {
        label,
        key,
      });
    }
  }
  return value;
};

const boundedInteger = (value, minimum, maximum, label, code = "mesh-light/integer") => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    validationError(`${label} must be an integer from ${minimum} to ${maximum}`, code, {
      label,
      value,
      minimum,
      maximum,
    });
  }
  return value;
};

const semanticId = (value, label) => {
  const id = String(value ?? "").trim();
  if (!id || id.length > 256 || !ID_PATTERN.test(id)) {
    validationError(`${label} must be a semantic identity`, "mesh-light/id", { value: id });
  }
  return id;
};

const sameVector = (left, right) => left.length === right.length
  && left.every((entry, index) => entry === right[index]);

const compareCoord = (left, right) => left.coord[0] - right.coord[0]
  || left.coord[1] - right.coord[1]
  || left.coord[2] - right.coord[2];

const copyLightBytes = (value, length, maximum, label) => {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    validationError(`${label} must be a Uint8Array matching the chunk volume`, "mesh-light/bytes", {
      label,
      length: value?.length ?? null,
      expected: length,
    });
  }
  const output = value.slice();
  for (const [index, entry] of output.entries()) {
    if (entry > maximum) {
      validationError(`${label} contains a level above ${maximum}`, "mesh-light/level", {
        label,
        index,
        value: entry,
        maximum,
      });
    }
  }
  return output;
};

const normalizeSourceField = (value, index) => {
  const input = exactObject(value, `Mesh lighting source ${index}`, SOURCE_FIELD_FIELDS);
  const coord = normalizeVector3(input.coord, `Mesh lighting source ${index} coordinate`);
  const key = String(input.key ?? "");
  if (key !== chunkKey(coord)) {
    validationError(`Mesh lighting source ${index} key does not match its coordinate`, "mesh-light/key");
  }
  return Object.freeze({
    key,
    coord,
    sourceRevision: boundedInteger(
      input.sourceRevision,
      0,
      0xffffffff,
      `Mesh lighting source ${index} revision`,
      "mesh-light/revision",
    ),
  });
};

const validateChunk = (chunk) => {
  if (!chunk || chunk.format !== "alumbra.chunk/1") {
    validationError("Mesh lighting requires a canonical chunk", "mesh-light/chunk");
  }
  const coord = normalizeVector3(chunk.coord, "Mesh lighting target coordinate");
  const shape = normalizeChunkShape(chunk.shape);
  if (chunk.key !== chunkKey(coord)) {
    validationError("Mesh lighting target key does not match its coordinate", "mesh-light/key");
  }
  boundedInteger(
    chunk.revision,
    0,
    0xffffffff,
    "Mesh lighting target revision",
    "mesh-light/revision",
  );
  return Object.freeze({
    key: chunk.key,
    coord,
    shape,
    revision: chunk.revision,
  });
};

export function normalizeMeshLightSnapshot(value, index = 0) {
  const input = exactObject(value, `Mesh light snapshot ${index}`, SNAPSHOT_FIELDS);
  if (input.format !== MESH_LIGHT_SNAPSHOT_FORMAT) {
    validationError(
      `Unsupported mesh light snapshot format: ${input.format}`,
      "mesh-light/snapshot-format",
    );
  }
  const maxLevel = boundedInteger(input.maxLevel, 1, 15, `Mesh light snapshot ${index} maximum`);
  const coord = normalizeVector3(input.coord, `Mesh light snapshot ${index} coordinate`);
  const shape = normalizeChunkShape(input.shape);
  const key = String(input.key ?? "");
  if (key !== chunkKey(coord)) {
    validationError(`Mesh light snapshot ${index} key does not match its coordinate`, "mesh-light/key");
  }
  const volume = chunkVolume(shape);
  return Object.freeze({
    format: MESH_LIGHT_SNAPSHOT_FORMAT,
    profileId: semanticId(input.profileId, `Mesh light snapshot ${index} profile`),
    generation: boundedInteger(
      input.generation,
      0,
      Number.MAX_SAFE_INTEGER,
      `Mesh light snapshot ${index} generation`,
      "mesh-light/counter",
    ),
    epoch: boundedInteger(
      input.epoch,
      0,
      Number.MAX_SAFE_INTEGER,
      `Mesh light snapshot ${index} epoch`,
      "mesh-light/counter",
    ),
    maxLevel,
    key,
    coord,
    shape,
    sourceRevision: boundedInteger(
      input.sourceRevision,
      0,
      0xffffffff,
      `Mesh light snapshot ${index} revision`,
      "mesh-light/revision",
    ),
    sunlight: copyLightBytes(input.sunlight, volume, maxLevel, `Mesh light snapshot ${index} sunlight`),
    emitted: copyLightBytes(input.emitted, volume, maxLevel, `Mesh light snapshot ${index} emitted light`),
  });
}

const snapshotCopy = (snapshot) => Object.freeze({
  format: snapshot.format,
  profileId: snapshot.profileId,
  generation: snapshot.generation,
  epoch: snapshot.epoch,
  maxLevel: snapshot.maxLevel,
  key: snapshot.key,
  coord: snapshot.coord,
  shape: snapshot.shape,
  sourceRevision: snapshot.sourceRevision,
  sunlight: snapshot.sunlight.slice(),
  emitted: snapshot.emitted.slice(),
});

const sourceField = (snapshot) => Object.freeze({
  key: snapshot.key,
  coord: snapshot.coord,
  sourceRevision: snapshot.sourceRevision,
});

const cardinalDistance = (left, right) => Math.abs(left[0] - right[0])
  + Math.abs(left[1] - right[1])
  + Math.abs(left[2] - right[2]);

export function createMeshLightingContext({ chunk, snapshots } = {}) {
  const target = validateChunk(chunk);
  if (!Array.isArray(snapshots)
    || snapshots.length < 1
    || snapshots.length > MAX_MESH_LIGHT_SNAPSHOTS) {
    validationError(
      `Mesh lighting requires one to ${MAX_MESH_LIGHT_SNAPSHOTS} snapshots`,
      "mesh-light/snapshots",
    );
  }
  const values = snapshots.map(normalizeMeshLightSnapshot);
  const first = values[0];
  const byKey = new Map();
  for (const snapshot of values) {
    if (byKey.has(snapshot.key)) {
      validationError(`Duplicate mesh light snapshot ${snapshot.key}`, "mesh-light/duplicate");
    }
    if (snapshot.profileId !== first.profileId
      || snapshot.generation !== first.generation
      || snapshot.epoch !== first.epoch
      || snapshot.maxLevel !== first.maxLevel) {
      validationError("Mesh light snapshots do not share one field identity", "mesh-light/identity");
    }
    if (!sameVector(snapshot.shape, target.shape)) {
      validationError("Mesh light snapshot shape does not match the target chunk", "mesh-light/shape");
    }
    if (cardinalDistance(snapshot.coord, target.coord) > 1) {
      validationError(
        `Mesh light snapshot ${snapshot.key} is not the target or a cardinal neighbour`,
        "mesh-light/neighbour",
      );
    }
    byKey.set(snapshot.key, snapshot);
  }
  const targetSnapshot = byKey.get(target.key);
  if (!targetSnapshot
    || !sameVector(targetSnapshot.coord, target.coord)
    || targetSnapshot.sourceRevision !== target.revision) {
    validationError(
      "Mesh lighting requires the exact target chunk light-field revision",
      "mesh-light/target-revision",
    );
  }
  const ordered = [...values].sort(compareCoord);
  const evidence = Object.freeze({
    format: MESH_LIGHTING_FORMAT,
    profileId: first.profileId,
    generation: first.generation,
    epoch: first.epoch,
    maxLevel: first.maxLevel,
    targetKey: target.key,
    shape: target.shape,
    sourceFields: Object.freeze(ordered.map(sourceField)),
  });

  return Object.freeze({
    format: MESH_LIGHTING_CONTEXT_FORMAT,
    evidence() { return evidence; },
    snapshots() { return Object.freeze(ordered.map(snapshotCopy)); },
    sample(world) {
      const location = worldToChunk(world, target.shape);
      const snapshot = byKey.get(chunkKey(location.chunk));
      if (!snapshot) return null;
      const index = localToIndex(location.local, target.shape);
      const sunlight = snapshot.sunlight[index];
      const emitted = snapshot.emitted[index];
      return Object.freeze({
        world: Object.freeze([...world]),
        chunk: location.chunk,
        local: location.local,
        sunlight,
        emitted,
        level: Math.max(sunlight, emitted),
      });
    },
  });
}

export function normalizeMeshLightingEvidence(value, { chunk = null } = {}) {
  const input = exactObject(value, "Mesh lighting evidence", LIGHTING_FIELDS);
  if (input.format !== MESH_LIGHTING_FORMAT) {
    validationError(`Unsupported mesh lighting format: ${input.format}`, "mesh-light/format");
  }
  const shape = normalizeChunkShape(input.shape);
  const sourceValues = input.sourceFields;
  if (!Array.isArray(sourceValues)
    || sourceValues.length < 1
    || sourceValues.length > MAX_MESH_LIGHT_SNAPSHOTS) {
    validationError("Mesh lighting evidence contains an invalid source set", "mesh-light/sources");
  }
  const sourceFields = sourceValues.map(normalizeSourceField);
  const seen = new Set();
  for (const source of sourceFields) {
    if (seen.has(source.key)) validationError(`Duplicate mesh lighting source ${source.key}`, "mesh-light/duplicate");
    seen.add(source.key);
  }
  const canonical = [...sourceFields].sort(compareCoord);
  if (canonical.some((source, index) => source.key !== sourceFields[index].key)) {
    validationError("Mesh lighting sources must be coordinate-sorted", "mesh-light/source-order");
  }
  const targetKey = String(input.targetKey ?? "");
  const target = sourceFields.find((source) => source.key === targetKey);
  if (!target) validationError("Mesh lighting target is absent from its sources", "mesh-light/target");
  if (chunk != null) {
    const canonicalChunk = validateChunk(chunk);
    if (targetKey !== canonicalChunk.key
      || target.sourceRevision !== canonicalChunk.revision
      || !sameVector(shape, canonicalChunk.shape)) {
      validationError(
        "Mesh lighting evidence does not match the canonical chunk revision",
        "mesh-light/target-revision",
      );
    }
  }
  return Object.freeze({
    format: MESH_LIGHTING_FORMAT,
    profileId: semanticId(input.profileId, "Mesh lighting profile"),
    generation: boundedInteger(
      input.generation,
      0,
      Number.MAX_SAFE_INTEGER,
      "Mesh lighting generation",
      "mesh-light/counter",
    ),
    epoch: boundedInteger(
      input.epoch,
      0,
      Number.MAX_SAFE_INTEGER,
      "Mesh lighting epoch",
      "mesh-light/counter",
    ),
    maxLevel: boundedInteger(input.maxLevel, 1, 15, "Mesh lighting maximum"),
    targetKey,
    shape,
    sourceFields: Object.freeze(sourceFields),
  });
}

export function meshLightingEvidenceEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateMeshLightGroup(
  group,
  vertexCount,
  lighting = null,
  label = "Chunk mesh group",
) {
  const hasSunlight = group?.sunlight != null;
  const hasEmitted = group?.emitted != null;
  if (lighting == null) {
    if (hasSunlight || hasEmitted) {
      validationError(`${label} carries light arrays without mesh lighting evidence`, "mesh-light/unexpected");
    }
    return Object.freeze({ lighted: false, maxSunlight: 0, maxEmitted: 0 });
  }
  if (!hasSunlight || !hasEmitted
    || !(group.sunlight instanceof Uint8Array)
    || !(group.emitted instanceof Uint8Array)
    || group.sunlight.length !== vertexCount
    || group.emitted.length !== vertexCount) {
    validationError(`${label} requires one sunlight and emitted byte per vertex`, "mesh-light/group-bytes");
  }
  let maxSunlight = 0;
  let maxEmitted = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const sunlight = group.sunlight[index];
    const emitted = group.emitted[index];
    if (sunlight > lighting.maxLevel || emitted > lighting.maxLevel) {
      validationError(`${label} contains an out-of-range light level`, "mesh-light/group-level", {
        index,
        sunlight,
        emitted,
        maximum: lighting.maxLevel,
      });
    }
    maxSunlight = Math.max(maxSunlight, sunlight);
    maxEmitted = Math.max(maxEmitted, emitted);
  }
  return Object.freeze({ lighted: true, maxSunlight, maxEmitted });
}
