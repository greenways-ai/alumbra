import {
  applyBlockTransaction,
  canonicalValue,
  chunkKey,
  deepFreeze,
  normalizeVector3,
  validationError,
} from "@greenways/alumbra-core";
import {
  createWorldCheckpoint,
  digestWorldChunks,
  restoreWorldCheckpoint,
} from "./checkpoint.js";
import {
  DEFAULT_REGION_SHAPE,
  chunkToRegionAddress,
  normalizeRegionShape,
  regionKey,
} from "./region.js";
import { normalizeSha256Digest } from "./digest.js";

export const HISTORY_TRANSACTION_FORMAT = "alumbra.history-transaction/1";
export const HISTORY_SESSION_FORMAT = "alumbra.history-session/1";

const NAME_PATTERN = /^[a-z][a-z0-9._:/-]*$/;
const RECORD_FIELDS = new Set([
  "format",
  "sequence",
  "transaction",
  "affectedRegions",
  "semanticHeadDigest",
]);

const semanticName = (value, label) => {
  const output = String(value ?? "").trim();
  if (!output || output.length > 256 || !NAME_PATTERN.test(output)) {
    validationError(`${label} must be a semantic identity`, "history/name", {
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

const chunkMap = (input) => {
  const values = input instanceof Map ? [...input.values()] : input;
  if (!Array.isArray(values) || values.length === 0) {
    validationError("History session requires canonical chunks", "history/chunks");
  }
  const output = new Map();
  for (const chunk of values) {
    if (!chunk || chunk.format !== "alumbra.chunk/1") {
      validationError("History session contains a non-canonical chunk", "history/chunk");
    }
    if (output.has(chunk.key)) {
      validationError(`Duplicate history chunk ${chunk.key}`, "history/chunk-duplicate");
    }
    output.set(chunk.key, chunk);
  }
  return output;
};

const exactRecord = (value, index) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError(`History record ${index} must be an object`, "history/record");
  }
  for (const key of Object.keys(value)) {
    if (!RECORD_FIELDS.has(key)) {
      validationError(
        `History record ${index} contains unknown field ${key}`,
        "history/record-field",
      );
    }
  }
  if (value.format !== HISTORY_TRANSACTION_FORMAT) {
    validationError(
      `Unsupported history transaction format: ${value.format}`,
      "history/record-format",
    );
  }
  if (!Array.isArray(value.affectedRegions) || value.affectedRegions.length === 0) {
    validationError(
      `History record ${index} requires affected regions`,
      "history/record-regions",
    );
  }
  return deepFreeze({
    format: value.format,
    sequence: unsignedSequence(value.sequence, `History record ${index} sequence`),
    transaction: canonicalValue(value.transaction, {
      label: `History record ${index} transaction`,
    }),
    affectedRegions: Object.freeze(value.affectedRegions.map((region, regionIndex) =>
      normalizeVector3(region, `History record ${index} region ${regionIndex}`))),
    semanticHeadDigest: normalizeSha256Digest(
      value.semanticHeadDigest,
      `History record ${index} semantic head`,
    ),
  });
};

const compareVector = (left, right) =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

const orderedAffectedRegions = (revisions, regionShape) => {
  const regions = new Map();
  for (const revision of revisions) {
    const address = chunkToRegionAddress(revision.chunk, regionShape);
    regions.set(address.regionKey, address.region);
  }
  return Object.freeze([...regions.values()].sort(compareVector));
};

const sameRegions = (left, right) =>
  left.length === right.length
  && left.every((region, index) => compareVector(region, right[index]) === 0);

export async function replayHistory({
  checkpoint,
  regions,
  getSnapshot,
  records = [],
  registry,
} = {}) {
  const restored = await restoreWorldCheckpoint({
    checkpoint,
    regions,
    getSnapshot,
    registry,
  });
  if (!Array.isArray(records)) {
    validationError("History records must be an array", "history/records");
  }
  let chunks = restored.chunks;
  let sequence = restored.checkpoint.sequence;
  const normalized = records.map(exactRecord);

  for (const [index, record] of normalized.entries()) {
    if (record.sequence !== sequence + 1) {
      validationError(
        `History record ${index} sequence is not contiguous`,
        "history/record-sequence",
        {
          expected: sequence + 1,
          actual: record.sequence,
        },
      );
    }
    const accepted = applyBlockTransaction(chunks, record.transaction, registry);
    const actualRegions = orderedAffectedRegions(
      accepted.revisions,
      restored.checkpoint.regionShape,
    );
    if (!sameRegions(actualRegions, record.affectedRegions)) {
      validationError(
        `History record ${record.sequence} affected regions do not match`,
        "history/record-regions",
        {
          expected: record.affectedRegions,
          actual: actualRegions,
        },
      );
    }
    chunks = accepted.chunks;
    sequence = record.sequence;
    const head = await digestWorldChunks({
      world: restored.checkpoint.world,
      chunks,
      registry,
      pins: restored.checkpoint.pins,
    });
    if (head !== record.semanticHeadDigest) {
      validationError(
        `History record ${record.sequence} semantic head does not match`,
        "history/record-head",
        {
          expected: record.semanticHeadDigest,
          actual: head,
        },
      );
    }
  }

  const semanticHeadDigest = normalized.length
    ? normalized.at(-1).semanticHeadDigest
    : restored.semanticHeadDigest;
  return Object.freeze({
    chunks,
    sequence,
    semanticHeadDigest,
    records: Object.freeze(normalized),
  });
}

export function createHistorySession({
  world,
  registry,
  chunks: initialChunks,
  regionShape = DEFAULT_REGION_SHAPE,
  pins = {},
  sequence: initialSequence = 0,
} = {}) {
  if (!registry || typeof registry.get !== "function") {
    validationError("History session requires a block registry", "history/registry");
  }
  const normalizedWorld = canonicalValue(world, { label: "History world identity" });
  const normalizedPins = canonicalValue(pins, { label: "History pins" });
  const normalizedRegionShape = normalizeRegionShape(regionShape);
  let chunks = chunkMap(initialChunks);
  let sequence = unsignedSequence(initialSequence);
  let transactionRecords = [];
  let baseCheckpointRoot = null;
  const bundles = new Map();
  const names = new Map();
  let destroyed = false;

  const ensureActive = () => {
    if (destroyed) {
      validationError("History session has been destroyed", "history/destroyed");
    }
  };

  const headDigest = () => digestWorldChunks({
    world: normalizedWorld,
    chunks,
    registry,
    pins: normalizedPins,
  });

  const snapshot = async () => deepFreeze({
    format: HISTORY_SESSION_FORMAT,
    status: destroyed ? "destroyed" : "active",
    world: normalizedWorld,
    sequence,
    chunkCount: chunks.size,
    transactionCount: transactionRecords.length,
    namedCheckpointCount: names.size,
    baseCheckpointRoot,
    semanticHeadDigest: destroyed ? null : await headDigest(),
  });

  const storeBundle = (bundle, name = null) => {
    bundles.set(bundle.checkpoint.root, bundle);
    if (name != null) names.set(semanticName(name, "Checkpoint name"), bundle.checkpoint.root);
    return bundle;
  };

  return Object.freeze({
    format: HISTORY_SESSION_FORMAT,
    async evidence() {
      return snapshot();
    },
    chunks() {
      ensureActive();
      return new Map(chunks);
    },
    records() {
      ensureActive();
      return Object.freeze([...transactionRecords]);
    },
    namedCheckpoints() {
      ensureActive();
      return Object.freeze([...names.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, root]) => deepFreeze({ name, root })));
    },
    async headDigest() {
      ensureActive();
      return headDigest();
    },
    async append({
      sequence: requestedSequence,
      transaction,
    } = {}) {
      ensureActive();
      const next = unsignedSequence(requestedSequence);
      if (next !== sequence + 1) {
        validationError(
          `History sequence must advance from ${sequence} to ${sequence + 1}`,
          "history/sequence-conflict",
          { expected: sequence + 1, actual: next },
        );
      }
      const accepted = applyBlockTransaction(chunks, transaction, registry);
      const nextChunks = accepted.chunks;
      const semanticHeadDigest = await digestWorldChunks({
        world: normalizedWorld,
        chunks: nextChunks,
        registry,
        pins: normalizedPins,
      });
      const record = deepFreeze({
        format: HISTORY_TRANSACTION_FORMAT,
        sequence: next,
        transaction: accepted.transaction,
        affectedRegions: orderedAffectedRegions(
          accepted.revisions,
          normalizedRegionShape,
        ),
        semanticHeadDigest,
      });
      chunks = nextChunks;
      sequence = next;
      transactionRecords = [...transactionRecords, record];
      return deepFreeze({
        record,
        revisions: accepted.revisions,
        semanticHeadDigest,
      });
    },
    async checkpoint({
      id,
      name = null,
      metadata = {},
      setBase = false,
    } = {}) {
      ensureActive();
      const bundle = await createWorldCheckpoint({
        id,
        world: normalizedWorld,
        sequence,
        chunks,
        registry,
        regionShape: normalizedRegionShape,
        pins: normalizedPins,
        metadata,
      });
      storeBundle(bundle, name);
      if (setBase) baseCheckpointRoot = bundle.checkpoint.root;
      return bundle;
    },
    async restore(target) {
      ensureActive();
      const identity = String(target ?? "");
      const root = names.get(identity) ?? normalizeSha256Digest(identity, "Checkpoint root");
      const bundle = bundles.get(root);
      if (!bundle) {
        validationError(`Unknown checkpoint ${identity}`, "history/checkpoint-unknown", {
          target: identity,
        });
      }
      const restored = await restoreWorldCheckpoint({
        checkpoint: bundle.checkpoint,
        regions: bundle.regions,
        getSnapshot: bundle.getSnapshot,
        registry,
      });
      chunks = restored.chunks;
      sequence = restored.checkpoint.sequence;
      transactionRecords = transactionRecords.filter((record) => record.sequence <= sequence);
      return deepFreeze({
        root,
        sequence,
        semanticHeadDigest: restored.semanticHeadDigest,
      });
    },
    async compact({
      id,
      name = null,
      metadata = {},
    } = {}) {
      ensureActive();
      const before = await headDigest();
      const bundle = await createWorldCheckpoint({
        id,
        world: normalizedWorld,
        sequence,
        chunks,
        registry,
        regionShape: normalizedRegionShape,
        pins: normalizedPins,
        metadata,
      });
      if (bundle.checkpoint.semanticHeadDigest !== before) {
        validationError(
          "History compaction changed the semantic world head",
          "history/compaction-head",
          {
            before,
            after: bundle.checkpoint.semanticHeadDigest,
          },
        );
      }
      storeBundle(bundle, name);
      baseCheckpointRoot = bundle.checkpoint.root;
      transactionRecords = [];
      return deepFreeze({
        checkpoint: bundle.checkpoint,
        semanticHeadDigest: before,
        transactionCount: 0,
      });
    },
    async replayFrom(target, records = transactionRecords) {
      ensureActive();
      const identity = String(target ?? "");
      const root = names.get(identity) ?? normalizeSha256Digest(identity, "Checkpoint root");
      const bundle = bundles.get(root);
      if (!bundle) {
        validationError(`Unknown checkpoint ${identity}`, "history/checkpoint-unknown", {
          target: identity,
        });
      }
      return replayHistory({
        checkpoint: bundle.checkpoint,
        regions: bundle.regions,
        getSnapshot: bundle.getSnapshot,
        records,
        registry,
      });
    },
    async destroy() {
      if (destroyed) return snapshot();
      destroyed = true;
      chunks = new Map();
      transactionRecords = [];
      bundles.clear();
      names.clear();
      baseCheckpointRoot = null;
      return snapshot();
    },
  });
}
