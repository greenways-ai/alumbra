import {
  assertCanonicalByteLimit,
  canonicalValue,
  deepFreeze,
  validationError,
} from "@greenways/alumbra-core";
import {
  normalizeSha256Digest,
  replayHistory,
  restoreWorldCheckpoint,
} from "@greenways/alumbra-history";
import {
  decodeCanonicalBlob,
  digestBlobBytes,
  encodeCanonicalBlob,
} from "./bytes.js";
import { bindHistoryBlobStore } from "./store.js";

export const HISTORY_ARCHIVE_FORMAT = "alumbra.history-archive/1";
export const HISTORY_ARCHIVE_CHECKPOINT_FORMAT = "alumbra.history-archive-checkpoint/1";

const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_CHECKPOINTS = 4096;
const MAX_RECORDS = 1_000_000;
const ID_PATTERN = /^[a-z][a-z0-9._:/-]*$/;

const ARCHIVE_FIELDS = new Set([
  "format",
  "id",
  "baseCheckpointRoot",
  "checkpoints",
  "records",
  "snapshotDigests",
  "headSequence",
  "semanticHeadDigest",
  "metadata",
]);
const CHECKPOINT_FIELDS = new Set([
  "format",
  "root",
  "names",
  "checkpoint",
  "regions",
]);

const exactObject = (value, label, fields) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError(`${label} must be an object`, "history-store/object", { label });
  }
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      validationError(`${label} contains unknown field ${key}`, "history-store/field", {
        label,
        key,
      });
    }
  }
  return value;
};

const semanticId = (value, label) => {
  const output = String(value ?? "").trim();
  if (!output || output.length > 256 || !ID_PATTERN.test(output)) {
    validationError(`${label} must be a semantic identity`, "history-store/id", {
      value: output,
    });
  }
  return output;
};

const sequence = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    validationError(`${label} must be a non-negative safe integer`, "history-store/sequence", {
      value,
    });
  }
  return value;
};

const normalizeMetadata = (value = {}) => {
  const metadata = canonicalValue(value, { label: "History archive metadata" });
  assertCanonicalByteLimit(metadata, MAX_METADATA_BYTES, "History archive metadata");
  return deepFreeze(metadata);
};

const normalizeNames = (values, label) => {
  if (!Array.isArray(values)) {
    validationError(`${label} must be an array`, "history-store/names");
  }
  const names = values.map((value, index) => semanticId(value, `${label} ${index}`)).sort();
  if (new Set(names).size !== names.length) {
    validationError(`${label} contains duplicate names`, "history-store/name-duplicate");
  }
  return Object.freeze(names);
};

const normalizeCheckpointEntry = (value, index) => {
  const input = exactObject(value, `Archive checkpoint ${index}`, CHECKPOINT_FIELDS);
  if (input.format !== HISTORY_ARCHIVE_CHECKPOINT_FORMAT) {
    validationError(
      `Unsupported archive checkpoint format: ${input.format}`,
      "history-store/checkpoint-format",
    );
  }
  if (!Array.isArray(input.regions) || input.regions.length === 0) {
    validationError(`Archive checkpoint ${index} requires regions`, "history-store/regions");
  }
  const checkpoint = canonicalValue(input.checkpoint, {
    label: `Archive checkpoint ${index} value`,
  });
  const root = normalizeSha256Digest(input.root, `Archive checkpoint ${index} root`);
  if (checkpoint.root !== root) {
    validationError(
      `Archive checkpoint ${index} root does not match its checkpoint`,
      "history-store/checkpoint-root",
    );
  }
  return deepFreeze({
    format: input.format,
    root,
    names: normalizeNames(input.names, `Archive checkpoint ${index} names`),
    checkpoint,
    regions: Object.freeze(input.regions.map((region, regionIndex) => canonicalValue(region, {
      label: `Archive checkpoint ${index} region ${regionIndex}`,
    }))),
  });
};

const normalizeArchive = (value) => {
  const input = exactObject(value, "History archive", ARCHIVE_FIELDS);
  if (input.format !== HISTORY_ARCHIVE_FORMAT) {
    validationError(`Unsupported history archive format: ${input.format}`, "history-store/format");
  }
  if (!Array.isArray(input.checkpoints)
    || input.checkpoints.length === 0
    || input.checkpoints.length > MAX_CHECKPOINTS) {
    validationError(
      `History archive requires one to ${MAX_CHECKPOINTS} checkpoints`,
      "history-store/checkpoints",
    );
  }
  if (!Array.isArray(input.records) || input.records.length > MAX_RECORDS) {
    validationError(`History archive exceeds ${MAX_RECORDS} records`, "history-store/records");
  }
  if (!Array.isArray(input.snapshotDigests) || input.snapshotDigests.length === 0) {
    validationError("History archive requires snapshot digests", "history-store/snapshots");
  }
  const checkpoints = input.checkpoints.map(normalizeCheckpointEntry);
  const roots = checkpoints.map((entry) => entry.root);
  if (new Set(roots).size !== roots.length || [...roots].sort().some((root, index) => root !== roots[index])) {
    validationError(
      "Archive checkpoints must have unique sorted roots",
      "history-store/checkpoint-order",
    );
  }
  const names = new Set();
  for (const entry of checkpoints) {
    for (const name of entry.names) {
      if (names.has(name)) {
        validationError(`Duplicate archive checkpoint name ${name}`, "history-store/name-duplicate");
      }
      names.add(name);
    }
  }
  const snapshots = input.snapshotDigests.map((digest, index) =>
    normalizeSha256Digest(digest, `Archive snapshot ${index}`));
  if (new Set(snapshots).size !== snapshots.length
    || [...snapshots].sort().some((digest, index) => digest !== snapshots[index])) {
    validationError(
      "Archive snapshot digests must be unique and sorted",
      "history-store/snapshot-order",
    );
  }
  const baseCheckpointRoot = normalizeSha256Digest(
    input.baseCheckpointRoot,
    "Archive base checkpoint root",
  );
  if (!roots.includes(baseCheckpointRoot)) {
    validationError("Archive base checkpoint is not present", "history-store/base-checkpoint");
  }
  return deepFreeze({
    format: input.format,
    id: semanticId(input.id, "Archive id"),
    baseCheckpointRoot,
    checkpoints: Object.freeze(checkpoints),
    records: Object.freeze(input.records.map((record, index) => canonicalValue(record, {
      label: `Archive history record ${index}`,
    }))),
    snapshotDigests: Object.freeze(snapshots),
    headSequence: sequence(input.headSequence, "Archive head sequence"),
    semanticHeadDigest: normalizeSha256Digest(
      input.semanticHeadDigest,
      "Archive semantic head digest",
    ),
    metadata: normalizeMetadata(input.metadata),
  });
};

const normalizeBundleInput = ({ name = null, bundle }, label) => {
  if (!bundle || typeof bundle !== "object") {
    validationError(`${label} requires a checkpoint bundle`, "history-store/bundle");
  }
  if (!bundle.checkpoint?.root || !Array.isArray(bundle.regions)
    || !Array.isArray(bundle.snapshotDigests) || typeof bundle.getSnapshot !== "function") {
    validationError(`${label} is not a complete checkpoint bundle`, "history-store/bundle");
  }
  return {
    name: name == null ? null : semanticId(name, `${label} name`),
    bundle,
  };
};

const checkpointEntries = (base, named = []) => {
  if (!Array.isArray(named) || named.length > MAX_CHECKPOINTS - 1) {
    validationError("Named archive checkpoints are invalid", "history-store/checkpoints");
  }
  const inputs = [normalizeBundleInput({ bundle: base }, "Base checkpoint")]
    .concat(named.map((entry, index) => normalizeBundleInput(entry, `Named checkpoint ${index}`)));
  const byRoot = new Map();
  for (const input of inputs) {
    const root = normalizeSha256Digest(input.bundle.checkpoint.root, "Checkpoint bundle root");
    const current = byRoot.get(root) ?? {
      bundle: input.bundle,
      names: new Set(),
    };
    if (input.name) current.names.add(input.name);
    byRoot.set(root, current);
  }
  return [...byRoot.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([root, entry]) => ({ root, bundle: entry.bundle, names: [...entry.names].sort() }));
};

const referencedSnapshotDigests = (entries) => {
  const output = new Set();
  for (const entry of entries) {
    for (const region of entry.bundle.regions) {
      for (const record of region.chunks ?? []) {
        output.add(normalizeSha256Digest(record.snapshotDigest, "Checkpoint snapshot digest"));
      }
    }
  }
  return [...output].sort();
};

export async function saveHistoryArchive({
  id,
  base,
  records = [],
  named = [],
  registry,
  metadata = {},
  store: storeValue,
} = {}) {
  const store = bindHistoryBlobStore(storeValue);
  const entries = checkpointEntries(base, named);
  const baseRoot = normalizeSha256Digest(base?.checkpoint?.root, "Base checkpoint root");
  const sources = new Map();

  for (const entry of entries) {
    await restoreWorldCheckpoint({
      checkpoint: entry.bundle.checkpoint,
      regions: entry.bundle.regions,
      getSnapshot: entry.bundle.getSnapshot,
      registry,
    });
    for (const digest of entry.bundle.snapshotDigests) {
      const key = normalizeSha256Digest(digest, "Checkpoint snapshot digest");
      if (!sources.has(key)) sources.set(key, entry.bundle.getSnapshot.bind(entry.bundle));
    }
  }

  const replayed = await replayHistory({
    checkpoint: base.checkpoint,
    regions: base.regions,
    getSnapshot: base.getSnapshot,
    records,
    registry,
  });
  const snapshotDigests = referencedSnapshotDigests(entries);
  const archive = deepFreeze({
    format: HISTORY_ARCHIVE_FORMAT,
    id: semanticId(id, "Archive id"),
    baseCheckpointRoot: baseRoot,
    checkpoints: Object.freeze(entries.map((entry) => deepFreeze({
      format: HISTORY_ARCHIVE_CHECKPOINT_FORMAT,
      root: entry.root,
      names: Object.freeze(entry.names),
      checkpoint: entry.bundle.checkpoint,
      regions: entry.bundle.regions,
    }))),
    records: Object.freeze(replayed.records),
    snapshotDigests: Object.freeze(snapshotDigests),
    headSequence: replayed.sequence,
    semanticHeadDigest: replayed.semanticHeadDigest,
    metadata: normalizeMetadata(metadata),
  });
  const archiveBytes = encodeCanonicalBlob(archive, "History archive");
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    validationError(
      `History archive exceeds ${MAX_ARCHIVE_BYTES} bytes`,
      "history-store/archive-size",
      { byteLength: archiveBytes.byteLength },
    );
  }
  const archiveDigest = await digestBlobBytes(archiveBytes, "History archive");
  let writtenSnapshots = 0;
  let reusedSnapshots = 0;

  for (const digest of snapshotDigests) {
    if (await store.has(digest)) {
      const existing = await store.get(digest);
      if (existing == null) {
        validationError(`History store lost existing snapshot ${digest}`, "history-store/missing");
      }
      reusedSnapshots += 1;
      continue;
    }
    const reader = sources.get(digest);
    const bytes = reader ? await reader(digest) : null;
    if (bytes == null) {
      validationError(`Checkpoint bundle is missing snapshot ${digest}`, "history-store/snapshot-missing");
    }
    await store.put(digest, bytes);
    writtenSnapshots += 1;
  }

  let archiveWritten = false;
  if (!await store.has(archiveDigest)) {
    await store.put(archiveDigest, archiveBytes);
    archiveWritten = true;
  } else {
    await store.get(archiveDigest);
  }

  return deepFreeze({
    digest: archiveDigest,
    archive,
    byteLength: archiveBytes.byteLength,
    writtenSnapshots,
    reusedSnapshots,
    archiveWritten,
  });
}

export async function loadHistoryArchive({
  digest,
  store: storeValue,
  registry,
} = {}) {
  const store = bindHistoryBlobStore(storeValue);
  const archiveDigest = normalizeSha256Digest(digest, "History archive digest");
  const bytes = await store.get(archiveDigest);
  if (bytes == null) {
    validationError(`History archive ${archiveDigest} is missing`, "history-store/archive-missing");
  }
  const archive = normalizeArchive(decodeCanonicalBlob(bytes, "History archive"));
  const actualDigest = await digestBlobBytes(bytes, "History archive");
  if (actualDigest !== archiveDigest) {
    validationError("History archive digest does not match", "history-store/archive-digest");
  }
  const checkpointByRoot = new Map(archive.checkpoints.map((entry) => [entry.root, entry]));
  const base = checkpointByRoot.get(archive.baseCheckpointRoot);
  const getSnapshot = (snapshotDigest) => store.get(snapshotDigest);
  for (const entry of archive.checkpoints) {
    await restoreWorldCheckpoint({
      checkpoint: entry.checkpoint,
      regions: entry.regions,
      getSnapshot,
      registry,
    });
  }
  const replayed = await replayHistory({
    checkpoint: base.checkpoint,
    regions: base.regions,
    getSnapshot,
    records: archive.records,
    registry,
  });
  if (replayed.sequence !== archive.headSequence
    || replayed.semanticHeadDigest !== archive.semanticHeadDigest) {
    validationError(
      "History archive head does not match replayed world state",
      "history-store/archive-head",
      {
        expectedSequence: archive.headSequence,
        actualSequence: replayed.sequence,
        expectedHead: archive.semanticHeadDigest,
        actualHead: replayed.semanticHeadDigest,
      },
    );
  }
  const referenced = referencedSnapshotDigests(
    archive.checkpoints.map((entry) => ({ bundle: entry })),
  );
  if (referenced.length !== archive.snapshotDigests.length
    || referenced.some((value, index) => value !== archive.snapshotDigests[index])) {
    validationError(
      "History archive snapshot index does not match its checkpoint manifests",
      "history-store/snapshot-index",
    );
  }
  const names = new Map();
  for (const entry of archive.checkpoints) {
    for (const name of entry.names) names.set(name, entry.root);
  }

  return Object.freeze({
    archive,
    chunks: replayed.chunks,
    sequence: replayed.sequence,
    semanticHeadDigest: replayed.semanticHeadDigest,
    namedCheckpoints: Object.freeze([...names.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, root]) => deepFreeze({ name, root }))),
    async restore(name) {
      const identity = semanticId(name, "Archive checkpoint name");
      const root = names.get(identity);
      if (!root) {
        validationError(`Unknown archive checkpoint ${identity}`, "history-store/checkpoint-unknown");
      }
      const entry = checkpointByRoot.get(root);
      return restoreWorldCheckpoint({
        checkpoint: entry.checkpoint,
        regions: entry.regions,
        getSnapshot,
        registry,
      });
    },
  });
}
