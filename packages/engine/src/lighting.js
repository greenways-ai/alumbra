import {
  chunkKey,
  localToIndex,
  normalizeChunkShape,
  validationError,
  worldToChunk,
} from "@greenways/alumbra-core";

export const LIGHTING_PROFILE_FORMAT = "alumbra.lighting-profile/1";
export const LIGHT_FIELD_FORMAT = "alumbra.light-field/1";
export const LIGHT_FIELD_EVIDENCE_FORMAT = "alumbra.light-field-evidence/1";
export const LIGHT_FIELD_SET_FORMAT = "alumbra.light-field-set/1";
export const LIGHT_FIELD_SET_EVIDENCE_FORMAT = "alumbra.light-field-set-evidence/1";

export const MAX_LIGHT_CHUNKS = 4096;
export const MAX_LIGHT_VOXELS = 16 * 1024 * 1024;

const PROFILE_FIELDS = new Set([
  "format",
  "id",
  "maxLevel",
  "sunlightAttenuation",
  "emittedAttenuation",
  "missingNeighborPolicy",
]);
const LIGHT_METADATA_FIELDS = new Set(["opacity", "emission"]);
const MISSING_NEIGHBOR_POLICIES = new Set(["opaque", "open"]);
const LIGHTING_ID_PATTERN = /^[a-z][a-z0-9._:/-]*$/;
const DIRECTIONS = Object.freeze([
  Object.freeze([1, 0, 0]),
  Object.freeze([-1, 0, 0]),
  Object.freeze([0, 1, 0]),
  Object.freeze([0, -1, 0]),
  Object.freeze([0, 0, 1]),
  Object.freeze([0, 0, -1]),
]);

const plainObject = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactObject = (value, label, fields) => {
  if (!plainObject(value)) validationError(`${label} must be an object`, "lighting/object", { label });
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      validationError(`${label} contains unknown field ${key}`, "lighting/field", { label, key });
    }
  }
  return value;
};

const boundedInteger = (value, minimum, maximum, label, code = "lighting/integer") => {
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

const counter = (value, label) => boundedInteger(
  value,
  0,
  Number.MAX_SAFE_INTEGER,
  label,
  "lighting/counter",
);

const semanticId = (value, label) => {
  const id = String(value ?? "").trim();
  if (!id || id.length > 256 || !LIGHTING_ID_PATTERN.test(id)) {
    validationError(`${label} must be a semantic identity`, "lighting/id", { value: id });
  }
  return id;
};

const compareCoord = (left, right) => left.coord[0] - right.coord[0]
  || left.coord[1] - right.coord[1]
  || left.coord[2] - right.coord[2];

export function normalizeLightingProfile(value = {}) {
  const input = exactObject(value, "Lighting profile", PROFILE_FIELDS);
  if (input.format != null && input.format !== LIGHTING_PROFILE_FORMAT) {
    validationError(`Unsupported lighting profile format: ${input.format}`, "lighting/profile-format");
  }
  const maxLevel = boundedInteger(input.maxLevel ?? 15, 1, 15, "Lighting maximum level");
  const missingNeighborPolicy = String(input.missingNeighborPolicy ?? "opaque");
  if (!MISSING_NEIGHBOR_POLICIES.has(missingNeighborPolicy)) {
    validationError(
      `Unsupported missing-neighbor lighting policy: ${missingNeighborPolicy}`,
      "lighting/missing-neighbor-policy",
    );
  }
  return Object.freeze({
    format: LIGHTING_PROFILE_FORMAT,
    id: semanticId(input.id ?? "alumbra/lighting-default", "Lighting profile id"),
    maxLevel,
    sunlightAttenuation: boundedInteger(
      input.sunlightAttenuation ?? 1,
      1,
      maxLevel,
      "Sunlight attenuation",
    ),
    emittedAttenuation: boundedInteger(
      input.emittedAttenuation ?? 1,
      1,
      maxLevel,
      "Emitted-light attenuation",
    ),
    missingNeighborPolicy,
  });
}

export const DEFAULT_LIGHTING_PROFILE = normalizeLightingProfile();

const metadataLevel = (value, label, maxLevel) => {
  if (value == null) return null;
  return boundedInteger(value, 0, maxLevel, label, "lighting/block-level");
};

const normalizedBlockLighting = (definition, profile) => {
  if (!definition || typeof definition !== "object" || !definition.id) {
    validationError("Lighting requires a canonical block definition", "lighting/block-definition");
  }
  const metadata = definition.metadata ?? {};
  const light = metadata.light == null
    ? null
    : exactObject(metadata.light, `Block ${definition.id} light metadata`, LIGHT_METADATA_FIELDS);
  const modernOpacity = metadataLevel(light?.opacity, `Block ${definition.id} light opacity`, profile.maxLevel);
  const legacyOpacity = metadataLevel(metadata.lightOpacity, `Block ${definition.id} lightOpacity`, profile.maxLevel);
  if (modernOpacity != null && legacyOpacity != null && modernOpacity !== legacyOpacity) {
    validationError(
      `Block ${definition.id} declares conflicting light opacity`,
      "lighting/block-opacity-conflict",
    );
  }
  const modernEmission = metadataLevel(light?.emission, `Block ${definition.id} light emission`, profile.maxLevel);
  const legacyEmission = metadataLevel(metadata.emittedLight, `Block ${definition.id} emittedLight`, profile.maxLevel);
  if (modernEmission != null && legacyEmission != null && modernEmission !== legacyEmission) {
    validationError(
      `Block ${definition.id} declares conflicting light emission`,
      "lighting/block-emission-conflict",
    );
  }
  const opacity = modernOpacity
    ?? legacyOpacity
    ?? (definition.empty || metadata.render?.opaque === false ? 0 : profile.maxLevel);
  return Object.freeze({
    opacity,
    emission: modernEmission ?? legacyEmission ?? 0,
  });
};

export function blockLightingProperties(definition, profile = DEFAULT_LIGHTING_PROFILE) {
  return normalizedBlockLighting(definition, normalizeLightingProfile(profile));
}

const normalizeChunks = (input) => {
  const values = input instanceof Map
    ? [...input.values()]
    : Array.isArray(input)
      ? [...input]
      : validationError("Lighting chunks must be an array or Map", "lighting/chunks");
  if (values.length > MAX_LIGHT_CHUNKS) {
    validationError(`Lighting exceeds ${MAX_LIGHT_CHUNKS} loaded chunks`, "lighting/chunk-limit");
  }
  const byKey = new Map();
  let shape = null;
  let volume = 0;
  let totalVoxels = 0;
  for (const [position, chunk] of values.entries()) {
    if (!chunk || chunk.format !== "alumbra.chunk/1") {
      validationError(`Lighting chunk ${position} is not canonical`, "lighting/chunk");
    }
    const key = chunkKey(chunk.coord);
    if (chunk.key !== key || byKey.has(key)) {
      validationError(`Lighting contains an invalid or duplicate chunk ${key}`, "lighting/chunk-key");
    }
    const chunkShape = normalizeChunkShape(chunk.shape);
    if (shape == null) {
      shape = chunkShape;
      volume = chunkShape[0] * chunkShape[1] * chunkShape[2];
    } else if (shape.some((entry, axis) => entry !== chunkShape[axis])) {
      validationError("All chunks in one lighting build must use the same shape", "lighting/chunk-shape");
    }
    if (chunk.volume !== volume || chunk.indices?.length !== volume) {
      validationError(`Lighting chunk ${key} has inconsistent storage`, "lighting/chunk-storage");
    }
    totalVoxels += volume;
    if (!Number.isSafeInteger(totalVoxels) || totalVoxels > MAX_LIGHT_VOXELS) {
      validationError(`Lighting exceeds ${MAX_LIGHT_VOXELS} loaded voxels`, "lighting/voxel-limit");
    }
    byKey.set(key, chunk);
  }
  const chunks = [...byKey.values()].sort(compareCoord);
  return Object.freeze({
    chunks: Object.freeze(chunks),
    byKey,
    shape,
    volume,
    totalVoxels,
  });
};

const createTopology = (registry, input, profile) => {
  if (!registry || typeof registry.get !== "function") {
    validationError("Lighting requires a block registry", "lighting/registry");
  }
  const normalized = normalizeChunks(input);
  const entries = normalized.chunks.map((chunk) => {
    const palette = chunk.palette.map((block) => normalizedBlockLighting(registry.get(block.id), profile));
    const opacity = new Uint8Array(chunk.volume);
    const emission = new Uint8Array(chunk.volume);
    for (let index = 0; index < chunk.volume; index += 1) {
      const lighting = palette[chunk.indices[index]];
      opacity[index] = lighting.opacity;
      emission[index] = lighting.emission;
    }
    return {
      chunk,
      opacity,
      emission,
      sunlight: new Uint8Array(chunk.volume),
      emitted: new Uint8Array(chunk.volume),
    };
  });
  const positionByKey = new Map(entries.map((entry, index) => [entry.chunk.key, index]));
  const [sizeX = 0, sizeY = 0, sizeZ = 0] = normalized.shape ?? [];
  const volume = normalized.volume;

  const forEachNeighbor = (nodeId, visit) => {
    const entryIndex = Math.floor(nodeId / volume);
    const index = nodeId - entryIndex * volume;
    const entry = entries[entryIndex];
    const x = index % sizeX;
    const remainder = Math.floor(index / sizeX);
    const y = remainder % sizeY;
    const z = Math.floor(remainder / sizeY);
    for (const direction of DIRECTIONS) {
      let localX = x + direction[0];
      let localY = y + direction[1];
      let localZ = z + direction[2];
      let chunkX = entry.chunk.coord[0];
      let chunkY = entry.chunk.coord[1];
      let chunkZ = entry.chunk.coord[2];
      if (localX < 0) { localX = sizeX - 1; chunkX -= 1; }
      else if (localX >= sizeX) { localX = 0; chunkX += 1; }
      if (localY < 0) { localY = sizeY - 1; chunkY -= 1; }
      else if (localY >= sizeY) { localY = 0; chunkY += 1; }
      if (localZ < 0) { localZ = sizeZ - 1; chunkZ -= 1; }
      else if (localZ >= sizeZ) { localZ = 0; chunkZ += 1; }
      if (![chunkX, chunkY, chunkZ].every(Number.isSafeInteger)) continue;
      const neighborEntry = positionByKey.get(`${chunkX},${chunkY},${chunkZ}`);
      if (neighborEntry == null) continue;
      const neighborIndex = localX + sizeX * (localY + sizeY * localZ);
      visit(neighborEntry * volume + neighborIndex);
    }
  };

  return {
    ...normalized,
    entries,
    positionByKey,
    forEachNeighbor,
  };
};

const fieldAt = (topology, fieldName, nodeId) => {
  const entryIndex = Math.floor(nodeId / topology.volume);
  const index = nodeId - entryIndex * topology.volume;
  return topology.entries[entryIndex][fieldName][index];
};

const setFieldAt = (topology, fieldName, nodeId, value) => {
  const entryIndex = Math.floor(nodeId / topology.volume);
  const index = nodeId - entryIndex * topology.volume;
  topology.entries[entryIndex][fieldName][index] = value;
};

const opacityAt = (topology, nodeId) => {
  const entryIndex = Math.floor(nodeId / topology.volume);
  const index = nodeId - entryIndex * topology.volume;
  return topology.entries[entryIndex].opacity[index];
};

const propagate = (topology, fieldName, baseAttenuation, buckets, maxLevel) => {
  for (let level = maxLevel; level > 0; level -= 1) {
    const nodes = [...buckets[level]].sort((left, right) => left - right);
    buckets[level].clear();
    for (const nodeId of nodes) {
      if (fieldAt(topology, fieldName, nodeId) !== level) continue;
      topology.forEachNeighbor(nodeId, (neighborId) => {
        const opacity = opacityAt(topology, neighborId);
        if (opacity >= maxLevel) return;
        const candidate = level - Math.max(baseAttenuation, opacity);
        if (candidate <= 0 || candidate <= fieldAt(topology, fieldName, neighborId)) return;
        setFieldAt(topology, fieldName, neighborId, candidate);
        buckets[candidate].add(neighborId);
      });
    }
  }
};

const sunlightSourceEntries = (topology, policy) => {
  if (policy === "open") {
    return topology.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !topology.positionByKey.has(
        `${entry.chunk.coord[0]},${entry.chunk.coord[1] + 1},${entry.chunk.coord[2]}`,
      ))
      .map(({ index }) => index);
  }
  const topByColumn = new Map();
  topology.entries.forEach((entry, index) => {
    const column = `${entry.chunk.coord[0]},${entry.chunk.coord[2]}`;
    const current = topByColumn.get(column);
    if (current == null
      || topology.entries[current].chunk.coord[1] < entry.chunk.coord[1]) {
      topByColumn.set(column, index);
    }
  });
  return [...topByColumn.values()].sort((left, right) => left - right);
};

const seedSunlight = (topology, profile, buckets) => {
  if (topology.shape == null) return;
  const [sizeX, sizeY, sizeZ] = topology.shape;
  for (const entryIndex of sunlightSourceEntries(topology, profile.missingNeighborPolicy)) {
    const entry = topology.entries[entryIndex];
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        const index = x + sizeX * ((sizeY - 1) + sizeY * z);
        if (entry.opacity[index] >= profile.maxLevel) continue;
        entry.sunlight[index] = profile.maxLevel;
        buckets[profile.maxLevel].add(entryIndex * topology.volume + index);
      }
    }
  }
};

const seedEmittedLight = (topology, profile, buckets) => {
  topology.entries.forEach((entry, entryIndex) => {
    for (let index = 0; index < entry.chunk.volume; index += 1) {
      const level = entry.emission[index];
      if (level <= 0) continue;
      entry.emitted[index] = level;
      buckets[level].add(entryIndex * topology.volume + index);
    }
  });
};

const fieldStatistics = (sunlight, emitted) => {
  let sunlitVoxels = 0;
  let emittedVoxels = 0;
  let maxSunlight = 0;
  let maxEmitted = 0;
  for (let index = 0; index < sunlight.length; index += 1) {
    const sun = sunlight[index];
    const glow = emitted[index];
    if (sun > 0) sunlitVoxels += 1;
    if (glow > 0) emittedVoxels += 1;
    if (sun > maxSunlight) maxSunlight = sun;
    if (glow > maxEmitted) maxEmitted = glow;
  }
  return Object.freeze({ sunlitVoxels, emittedVoxels, maxSunlight, maxEmitted });
};

const createLightField = ({ entry, profile, generation }) => {
  const sunlight = entry.sunlight;
  const emitted = entry.emitted;
  const statistics = fieldStatistics(sunlight, emitted);
  const evidence = Object.freeze({
    format: LIGHT_FIELD_EVIDENCE_FORMAT,
    profileId: profile.id,
    key: entry.chunk.key,
    coord: entry.chunk.coord,
    shape: entry.chunk.shape,
    sourceRevision: entry.chunk.revision,
    generation,
    voxels: entry.chunk.volume,
    ...statistics,
  });
  const sample = (local) => {
    const index = localToIndex(local, entry.chunk.shape);
    const sun = sunlight[index];
    const glow = emitted[index];
    return Object.freeze({
      local: Object.freeze([...local]),
      sunlight: sun,
      emitted: glow,
      level: Math.max(sun, glow),
    });
  };
  return Object.freeze({
    format: LIGHT_FIELD_FORMAT,
    profileId: profile.id,
    key: entry.chunk.key,
    coord: entry.chunk.coord,
    shape: entry.chunk.shape,
    sourceRevision: entry.chunk.revision,
    generation,
    sunlightAt(local) { return sunlight[localToIndex(local, entry.chunk.shape)]; },
    emittedAt(local) { return emitted[localToIndex(local, entry.chunk.shape)]; },
    levelAt(local) {
      const index = localToIndex(local, entry.chunk.shape);
      return Math.max(sunlight[index], emitted[index]);
    },
    sample,
    copySunlight() { return sunlight.slice(); },
    copyEmitted() { return emitted.slice(); },
    evidence() { return evidence; },
  });
};

const createLightFieldSet = ({ topology, profile, generation, epoch }) => {
  const fields = new Map();
  const sourceRevisions = [];
  let sunlitVoxels = 0;
  let emittedVoxels = 0;
  let maxSunlight = 0;
  let maxEmitted = 0;
  for (const entry of topology.entries) {
    const field = createLightField({ entry, profile, generation });
    fields.set(field.key, field);
    sourceRevisions.push(Object.freeze({
      key: field.key,
      coord: field.coord,
      revision: field.sourceRevision,
    }));
    const evidence = field.evidence();
    sunlitVoxels += evidence.sunlitVoxels;
    emittedVoxels += evidence.emittedVoxels;
    maxSunlight = Math.max(maxSunlight, evidence.maxSunlight);
    maxEmitted = Math.max(maxEmitted, evidence.maxEmitted);
  }
  const frozenRevisions = Object.freeze(sourceRevisions);
  const evidence = Object.freeze({
    format: LIGHT_FIELD_SET_EVIDENCE_FORMAT,
    profileId: profile.id,
    generation,
    epoch,
    chunks: fields.size,
    voxels: topology.totalVoxels,
    sunlitVoxels,
    emittedVoxels,
    maxSunlight,
    maxEmitted,
    sourceRevisions: frozenRevisions,
  });
  const keyFor = (coordOrKey) => Array.isArray(coordOrKey)
    ? chunkKey(coordOrKey)
    : String(coordOrKey);
  return Object.freeze({
    format: LIGHT_FIELD_SET_FORMAT,
    profile,
    generation,
    epoch,
    sourceRevisions: frozenRevisions,
    keys() { return Object.freeze([...fields.keys()]); },
    fields() { return new Map(fields); },
    getField(coordOrKey) { return fields.get(keyFor(coordOrKey)) ?? null; },
    sample(world) {
      if (topology.shape == null) return null;
      const location = worldToChunk(world, topology.shape);
      const field = fields.get(chunkKey(location.chunk));
      if (!field) return null;
      return Object.freeze({
        world: Object.freeze([...world]),
        chunk: location.chunk,
        ...field.sample(location.local),
      });
    },
    evidence() { return evidence; },
  });
};

export function buildVoxelLightFields({
  registry,
  chunks = [],
  profile: profileValue = DEFAULT_LIGHTING_PROFILE,
  generation = 0,
  epoch = 0,
} = {}) {
  const profile = normalizeLightingProfile(profileValue);
  const normalizedGeneration = counter(generation, "Lighting generation");
  const normalizedEpoch = counter(epoch, "Lighting epoch");
  const topology = createTopology(registry, chunks, profile);
  const sunlightBuckets = Array.from({ length: profile.maxLevel + 1 }, () => new Set());
  seedSunlight(topology, profile, sunlightBuckets);
  propagate(
    topology,
    "sunlight",
    profile.sunlightAttenuation,
    sunlightBuckets,
    profile.maxLevel,
  );
  const emittedBuckets = Array.from({ length: profile.maxLevel + 1 }, () => new Set());
  seedEmittedLight(topology, profile, emittedBuckets);
  propagate(
    topology,
    "emitted",
    profile.emittedAttenuation,
    emittedBuckets,
    profile.maxLevel,
  );
  return createLightFieldSet({
    topology,
    profile,
    generation: normalizedGeneration,
    epoch: normalizedEpoch,
  });
}
