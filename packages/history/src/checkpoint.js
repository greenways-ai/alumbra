import {
  assertCanonicalByteLimit,
  canonicalValue,
  chunkKey,
  decodeChunkSnapshot,
  deepFreeze,
  digestChunkSnapshot,
  encodeChunkSnapshot,
  normalizeVector3,
  validationError,
} from "@greenways/alumbra-core";
import {
  digestHistoryValue,
  normalizeSha256Digest,
} from "./digest.js";
import {
  DEFAULT_REGION_SHAPE,
  chunkToRegionAddress,
  normalizeRegionShape,
  regionKey,
} from "./region.js";

export const CHUNK_SNAPSHOT_RECORD_FORMAT = "alumbra.chunk-snapshot-record/1";
export const REGION_MANIFEST_FORMAT = "alumbra.region-manifest/1";
export const WORLD_CHECKPOINT_FORMAT = "alumbra.world-checkpoint/1";
export const SEMANTIC_HEAD_FORMAT = "alumbra.semantic-world-head/1";

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_PIN_BYTES = 64 * 1024;
const MAX_CHUNKS = 1_000_000;
const ID_PATTERN = /^[a-z][a-z0-9._:/-]*$/;

const CHECKPOINT_FIELDS = new Set([
  "format",
  "id",
  "world",
  "sequence",
  "regionShape",
  "registry",
  "pins",
  "regions",
  "snapshotCount",
  "metadata",
  "semanticHeadDigest",
  "root",
]);
const REGION_FIELDS = new Set([
  "format",
  "region",
  "regionShape",
  "chunks",
  "root",
]);
const RECORD_FIELDS = new Set([
  "format",
  "chunk",
  "local",
  "shape",
  "revision",
  "snapshotDigest",
  "contentDigest",
  "byteLength",
]);
const REGION_REFERENCE_FIELDS = new Set([
  "region",
  "root",
  "chunkCount",
]);
const REGISTRY_FIELDS = new Set([
  "id",
  "version",
  "digest",
]);
const WORLD_FIELDS = new Set([
  "id",
  "version",
]);

const exactObject = (value, label, fields) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError(`${label} must be an object`, "history/object", { label });
  }
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      validationError(`${label} contains unknown field ${key}`, "history/field", {
        label,
        key,
      });
    }
  }
  return value;
};

const requiredString = (value, label, maximum = 256) => {
  const output = String(value ?? "").trim();
  if (!output || output.length > maximum) {
    validationError(`${label} is invalid`, "history/string", { label, value: output });
  }
  return output;
};

const semanticId = (value, label) => {
  const output = requiredString(value, label);
  if (!ID_PATTERN.test(output)) {
    validationError(`${label} must be a semantic identity`, "history/id", {
      label,
      value: output,
    });
  }
  return output;
};

const unsignedSequence = (value, label = "History sequence") => {
  if (!Number.isSafeInteger(value) || value < 0) {
    validationError(`${label} must be a non-negative safe integer`, "history/sequence", {
      value,
    });
  }
  return value;
};

const unsigned32 = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    validationError(`${label} must be an unsigned 32-bit integer`, "history/uint32", {
      value,
    });
  }
  return value;
};

const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    validationError(`${label} must be a positive safe integer`, "history/integer", {
      value,
    });
  }
  return value;
};

const sameVector = (left, right) =>
  left.length === right.length && left.every((entry, index) => entry === right[index]);

const compareVector = (left, right) =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

const normalizeWorld = (value) => {
  const input = exactObject(value, "World identity", WORLD_FIELDS);
  return deepFreeze({
    id: semanticId(input.id, "World id"),
    version: requiredString(input.version, "World version", 128),
  });
};

const normalizePins = (value = {}) => {
  const pins = canonicalValue(value, { label: "History pins" });
  assertCanonicalByteLimit(pins, MAX_PIN_BYTES, "History pins");
  return deepFreeze(pins);
};

const normalizeMetadata = (value = {}) => {
  const metadata = canonicalValue(value, { label: "Checkpoint metadata" });
  assertCanonicalByteLimit(metadata, MAX_METADATA_BYTES, "Checkpoint metadata");
  return deepFreeze(metadata);
};

const normalizeRegistryEvidence = (value) => {
  const input = exactObject(value, "Registry evidence", REGISTRY_FIELDS);
  return deepFreeze({
    id: semanticId(input.id, "Registry id"),
    version: requiredString(input.version, "Registry version", 128),
    digest: normalizeSha256Digest(input.digest, "Registry digest"),
  });
};

const normalizeRegionReference = (value, index) => {
  const input = exactObject(value, `Region reference ${index}`, REGION_REFERENCE_FIELDS);
  return deepFreeze({
    region: normalizeVector3(input.region, `region reference ${index}`),
    root: normalizeSha256Digest(input.root, `Region reference ${index} root`),
    chunkCount: positiveInteger(input.chunkCount, `Region reference ${index} chunk count`),
  });
};

const normalizeSnapshotRecord = (value, index) => {
  const input = exactObject(value, `Chunk snapshot record ${index}`, RECORD_FIELDS);
  const shape = normalizeVector3(input.shape, `Chunk snapshot record ${index} shape`);
  for (const [axis, entry] of shape.entries()) {
    if (entry <= 0 || entry > 0xffff) {
      validationError(
        `Chunk snapshot record ${index} shape axis ${axis} is invalid`,
        "history/chunk-shape",
        { axis, value: entry },
      );
    }
  }
  return deepFreeze({
    format: input.format,
    chunk: normalizeVector3(input.chunk, `Chunk snapshot record ${index} chunk`),
    local: normalizeVector3(input.local, `Chunk snapshot record ${index} local`),
    shape,
    revision: unsigned32(input.revision, `Chunk snapshot record ${index} revision`),
    snapshotDigest: normalizeSha256Digest(
      input.snapshotDigest,
      `Chunk snapshot record ${index} digest`,
    ),
    contentDigest: normalizeSha256Digest(
      input.contentDigest,
      `Chunk snapshot record ${index} content digest`,
    ),
    byteLength: positiveInteger(
      input.byteLength,
      `Chunk snapshot record ${index} byte length`,
    ),
  });
};

const withoutRoot = (value) => {
  const { root: _root, ...body } = value;
  return body;
};

async function registryEvidence(registry) {
  if (!registry || typeof registry.get !== "function" || !Array.isArray(registry.definitions)) {
    validationError("A canonical block registry is required", "history/registry");
  }
  const body = {
    id: semanticId(registry.id, "Registry id"),
    version: requiredString(registry.version, "Registry version", 128),
    definitions: registry.definitions,
  };
  return deepFreeze({
    id: body.id,
    version: body.version,
    digest: await digestHistoryValue(body, { label: "Block registry evidence" }),
  });
}

function chunkCollection(input) {
  const values = input instanceof Map ? [...input.values()] : input;
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_CHUNKS) {
    validationError(
      `Checkpoint requires one to ${MAX_CHUNKS} canonical chunks`,
      "history/chunks",
    );
  }
  const byKey = new Map();
  for (const [index, chunk] of values.entries()) {
    if (!chunk || chunk.format !== "alumbra.chunk/1") {
      validationError(`Chunk ${index} is not canonical`, "history/chunk", { index });
    }
    const key = chunkKey(chunk.coord);
    if (byKey.has(key)) {
      validationError(`Duplicate chunk ${key}`, "history/chunk-duplicate", { key });
    }
    byKey.set(key, chunk);
  }
  return [...byKey.values()].sort((left, right) => compareVector(left.coord, right.coord));
}

async function semanticHeadDigest({
  world,
  registry,
  pins,
  records,
}) {
  return digestHistoryValue({
    format: SEMANTIC_HEAD_FORMAT,
    world,
    registry,
    pins,
    chunks: records
      .map((record) => ({
        chunk: record.chunk,
        contentDigest: record.contentDigest,
      }))
      .sort((left, right) => compareVector(left.chunk, right.chunk)),
  }, { label: "Semantic world head" });
}

export async function createWorldCheckpoint({
  id,
  world,
  sequence = 0,
  chunks,
  registry,
  regionShape = DEFAULT_REGION_SHAPE,
  pins = {},
  metadata = {},
} = {}) {
  const checkpointId = semanticId(id, "Checkpoint id");
  const normalizedWorld = normalizeWorld(world);
  const normalizedSequence = unsignedSequence(sequence);
  const normalizedRegionShape = normalizeRegionShape(regionShape);
  const normalizedPins = normalizePins(pins);
  const normalizedMetadata = normalizeMetadata(metadata);
  const normalizedRegistry = await registryEvidence(registry);
  const values = chunkCollection(chunks);
  const snapshots = new Map();
  const grouped = new Map();
  const allRecords = [];

  for (const chunk of values) {
    const bytes = encodeChunkSnapshot(chunk);
    const snapshotDigest = await digestChunkSnapshot(bytes);
    const contentDigest = await digestChunkSnapshot({ ...chunk, revision: 0 });
    const address = chunkToRegionAddress(chunk.coord, normalizedRegionShape);
    const record = deepFreeze({
      format: CHUNK_SNAPSHOT_RECORD_FORMAT,
      chunk: chunk.coord,
      local: address.local,
      shape: chunk.shape,
      revision: chunk.revision,
      snapshotDigest,
      contentDigest,
      byteLength: bytes.byteLength,
    });
    snapshots.set(snapshotDigest, bytes.slice());
    const records = grouped.get(address.regionKey) ?? [];
    records.push(record);
    grouped.set(address.regionKey, records);
    allRecords.push(record);
  }

  const regions = [];
  for (const records of grouped.values()) {
    records.sort((left, right) => compareVector(left.chunk, right.chunk));
    const region = chunkToRegionAddress(records[0].chunk, normalizedRegionShape).region;
    const body = deepFreeze({
      format: REGION_MANIFEST_FORMAT,
      region,
      regionShape: normalizedRegionShape,
      chunks: Object.freeze(records),
    });
    regions.push(deepFreeze({
      ...body,
      root: await digestHistoryValue(body, {
        label: `Region manifest ${regionKey(region)}`,
      }),
    }));
  }
  regions.sort((left, right) => compareVector(left.region, right.region));

  const semanticDigest = await semanticHeadDigest({
    world: normalizedWorld,
    registry: normalizedRegistry,
    pins: normalizedPins,
    records: allRecords,
  });
  const body = deepFreeze({
    format: WORLD_CHECKPOINT_FORMAT,
    id: checkpointId,
    world: normalizedWorld,
    sequence: normalizedSequence,
    regionShape: normalizedRegionShape,
    registry: normalizedRegistry,
    pins: normalizedPins,
    regions: Object.freeze(regions.map((manifest) => deepFreeze({
      region: manifest.region,
      root: manifest.root,
      chunkCount: manifest.chunks.length,
    }))),
    snapshotCount: allRecords.length,
    metadata: normalizedMetadata,
    semanticHeadDigest: semanticDigest,
  });
  const checkpoint = deepFreeze({
    ...body,
    root: await digestHistoryValue(body, { label: "World checkpoint" }),
  });
  const snapshotDigests = Object.freeze([...snapshots.keys()].sort());

  return Object.freeze({
    checkpoint,
    regions: Object.freeze(regions),
    snapshotDigests,
    getSnapshot(digest) {
      const bytes = snapshots.get(normalizeSha256Digest(digest));
      return bytes ? bytes.slice() : null;
    },
  });
}

function normalizeCheckpoint(value) {
  const input = exactObject(value, "World checkpoint", CHECKPOINT_FIELDS);
  if (input.format !== WORLD_CHECKPOINT_FORMAT) {
    validationError(
      `Unsupported checkpoint format: ${input.format}`,
      "history/checkpoint-format",
    );
  }
  if (!Array.isArray(input.regions) || input.regions.length === 0) {
    validationError("Checkpoint requires region references", "history/checkpoint-regions");
  }
  const references = input.regions.map(normalizeRegionReference);
  const seenRegions = new Set();
  const seenRoots = new Set();
  for (const reference of references) {
    const key = regionKey(reference.region);
    if (seenRegions.has(key) || seenRoots.has(reference.root)) {
      validationError(
        `Checkpoint contains duplicate region reference ${key}`,
        "history/region-reference-duplicate",
        { region: reference.region, root: reference.root },
      );
    }
    seenRegions.add(key);
    seenRoots.add(reference.root);
  }
  return deepFreeze({
    format: input.format,
    id: semanticId(input.id, "Checkpoint id"),
    world: normalizeWorld(input.world),
    sequence: unsignedSequence(input.sequence),
    regionShape: normalizeRegionShape(input.regionShape),
    registry: normalizeRegistryEvidence(input.registry),
    pins: normalizePins(input.pins),
    regions: Object.freeze(references),
    snapshotCount: positiveInteger(input.snapshotCount, "Checkpoint snapshot count"),
    metadata: normalizeMetadata(input.metadata),
    semanticHeadDigest: normalizeSha256Digest(
      input.semanticHeadDigest,
      "Checkpoint semantic head digest",
    ),
    root: normalizeSha256Digest(input.root, "Checkpoint root"),
  });
}

function normalizeRegionManifest(value) {
  const input = exactObject(value, "Region manifest", REGION_FIELDS);
  if (input.format !== REGION_MANIFEST_FORMAT) {
    validationError(
      `Unsupported region manifest format: ${input.format}`,
      "history/region-format",
    );
  }
  if (!Array.isArray(input.chunks) || input.chunks.length === 0) {
    validationError("Region manifest requires chunk records", "history/region-chunks");
  }
  const manifest = deepFreeze({
    format: input.format,
    region: normalizeVector3(input.region, "region coordinate"),
    regionShape: normalizeRegionShape(input.regionShape),
    chunks: Object.freeze(input.chunks.map(normalizeSnapshotRecord)),
    root: normalizeSha256Digest(input.root, "Region root"),
  });
  const seen = new Set();
  let previous = null;
  for (const record of manifest.chunks) {
    if (record.format !== CHUNK_SNAPSHOT_RECORD_FORMAT) {
      validationError(
        `Unsupported snapshot record format: ${record.format}`,
        "history/record-format",
      );
    }
    const key = chunkKey(record.chunk);
    if (seen.has(key) || (previous !== null && compareVector(record.chunk, previous) <= 0)) {
      validationError(
        `Region manifest chunk records must be unique and sorted: ${key}`,
        "history/record-order",
        { key },
      );
    }
    seen.add(key);
    previous = record.chunk;
    const address = chunkToRegionAddress(record.chunk, manifest.regionShape);
    if (!sameVector(address.region, manifest.region) || !sameVector(address.local, record.local)) {
      validationError(
        `Chunk ${key} does not match its region address`,
        "history/region-address",
        {
          chunk: record.chunk,
          region: manifest.region,
          local: record.local,
        },
      );
    }
  }
  return manifest;
}

const snapshotReader = (value) => {
  if (typeof value === "function") return value;
  if (value instanceof Map) return (digest) => value.get(digest) ?? null;
  if (value && typeof value.getSnapshot === "function") {
    return value.getSnapshot.bind(value);
  }
  validationError(
    "Checkpoint restoration requires a snapshot reader",
    "history/snapshot-reader",
  );
};

export async function restoreWorldCheckpoint({
  checkpoint: checkpointValue,
  regions: regionValues,
  getSnapshot,
  registry,
} = {}) {
  const checkpoint = normalizeCheckpoint(checkpointValue);
  const currentRegistry = await registryEvidence(registry);
  if (
    currentRegistry.id !== checkpoint.registry.id
    || currentRegistry.version !== checkpoint.registry.version
    || currentRegistry.digest !== checkpoint.registry.digest
  ) {
    validationError(
      "Checkpoint block registry does not match the installed registry",
      "history/registry-mismatch",
      {
        expected: checkpoint.registry,
        actual: currentRegistry,
      },
    );
  }
  const expectedCheckpointRoot = await digestHistoryValue(
    withoutRoot(checkpoint),
    { label: "World checkpoint" },
  );
  if (expectedCheckpointRoot !== checkpoint.root) {
    validationError("Checkpoint root digest does not match", "history/checkpoint-root", {
      expected: checkpoint.root,
      actual: expectedCheckpointRoot,
    });
  }

  if (!Array.isArray(regionValues)) {
    validationError("Checkpoint regions must be an array", "history/regions");
  }
  const manifests = regionValues.map(normalizeRegionManifest);
  if (manifests.length !== checkpoint.regions.length) {
    validationError(
      "Checkpoint region count does not match supplied manifests",
      "history/region-count",
      { expected: checkpoint.regions.length, actual: manifests.length },
    );
  }
  const byRoot = new Map();
  for (const manifest of manifests) {
    if (byRoot.has(manifest.root)) {
      validationError(
        `Duplicate region manifest root ${manifest.root}`,
        "history/region-root-duplicate",
      );
    }
    const actualRoot = await digestHistoryValue(
      withoutRoot(manifest),
      { label: `Region manifest ${regionKey(manifest.region)}` },
    );
    if (actualRoot !== manifest.root) {
      validationError(
        `Region manifest ${regionKey(manifest.region)} root does not match`,
        "history/region-root",
        { expected: manifest.root, actual: actualRoot },
      );
    }
    byRoot.set(manifest.root, manifest);
  }

  const readSnapshot = snapshotReader(getSnapshot);
  const chunks = new Map();
  const records = [];
  for (const reference of checkpoint.regions) {
    const manifest = byRoot.get(reference.root);
    if (!manifest) {
      validationError(
        `Checkpoint is missing region manifest ${reference.root}`,
        "history/region-missing",
        { root: reference.root },
      );
    }
    if (
      !sameVector(manifest.region, reference.region)
      || !sameVector(manifest.regionShape, checkpoint.regionShape)
      || manifest.chunks.length !== reference.chunkCount
    ) {
      validationError(
        `Region manifest ${reference.root} does not match its checkpoint reference`,
        "history/region-reference",
      );
    }

    for (const record of manifest.chunks) {
      const bytes = await readSnapshot(record.snapshotDigest);
      if (bytes == null) {
        validationError(
          `Checkpoint is missing snapshot ${record.snapshotDigest}`,
          "history/snapshot-missing",
          { digest: record.snapshotDigest },
        );
      }
      const actualDigest = await digestChunkSnapshot(bytes);
      if (actualDigest !== record.snapshotDigest) {
        validationError(
          `Snapshot ${record.snapshotDigest} is corrupted`,
          "history/snapshot-digest",
          { expected: record.snapshotDigest, actual: actualDigest },
        );
      }
      const chunk = decodeChunkSnapshot(bytes, registry);
      const key = chunkKey(chunk.coord);
      if (
        !sameVector(chunk.coord, record.chunk)
        || !sameVector(chunk.shape, record.shape)
        || chunk.revision !== record.revision
        || encodeChunkSnapshot(chunk).byteLength !== record.byteLength
      ) {
        validationError(
          `Snapshot ${record.snapshotDigest} does not match its record`,
          "history/snapshot-record",
          { chunk: record.chunk },
        );
      }
      const contentDigest = await digestChunkSnapshot({ ...chunk, revision: 0 });
      if (contentDigest !== record.contentDigest) {
        validationError(
          `Snapshot ${record.snapshotDigest} content digest does not match`,
          "history/content-digest",
          { expected: record.contentDigest, actual: contentDigest },
        );
      }
      if (chunks.has(key)) {
        validationError(`Checkpoint contains duplicate chunk ${key}`, "history/chunk-duplicate");
      }
      chunks.set(key, chunk);
      records.push(record);
    }
  }

  if (records.length !== checkpoint.snapshotCount) {
    validationError(
      "Checkpoint snapshot count does not match its region manifests",
      "history/snapshot-count",
      { expected: checkpoint.snapshotCount, actual: records.length },
    );
  }
  const actualHead = await semanticHeadDigest({
    world: checkpoint.world,
    registry: checkpoint.registry,
    pins: checkpoint.pins,
    records,
  });
  if (actualHead !== checkpoint.semanticHeadDigest) {
    validationError(
      "Checkpoint semantic head digest does not match reconstructed chunks",
      "history/semantic-head",
      { expected: checkpoint.semanticHeadDigest, actual: actualHead },
    );
  }

  return Object.freeze({
    checkpoint,
    chunks,
    semanticHeadDigest: actualHead,
  });
}

export async function digestWorldChunks({
  world,
  chunks,
  registry,
  pins = {},
} = {}) {
  const bundle = await createWorldCheckpoint({
    id: "history/head-projection",
    world,
    chunks,
    registry,
    pins,
  });
  return bundle.checkpoint.semanticHeadDigest;
}
