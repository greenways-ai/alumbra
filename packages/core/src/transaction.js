import {
  blockValueKey,
  blockValuesEqual,
  normalizeBlockValue,
} from "./block-registry.js";
import {
  assertCanonicalByteLimit,
  canonicalValue,
  deepFreeze,
} from "./canonical.js";
import { patchChunk } from "./chunk.js";
import {
  chunkKey,
  normalizeLocalCoordinate,
  normalizeVector3,
} from "./coordinates.js";
import { conflictError, validationError } from "./errors.js";

export const TRANSACTION_FORMAT = "alumbra.block-transaction/1";
const MAX_TRANSACTION_METADATA_BYTES = 16 * 1024;
const TRANSACTION_ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/;

function normalizeRevision(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    validationError(`${label} must be an unsigned 32-bit integer`, "transaction/revision", {
      value,
    });
  }
  return value;
}

function normalizeExpectedRevisions(values = []) {
  if (!Array.isArray(values)) {
    validationError("Expected revisions must be an array", "transaction/expectations");
  }
  const seen = new Set();
  const normalized = values.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      validationError(`Expected revision ${index} must be an object`, "transaction/expectation");
    }
    const chunk = normalizeVector3(entry.chunk, `expected revision ${index} chunk`);
    const key = chunkKey(chunk);
    if (seen.has(key)) {
      validationError(`Duplicate expected revision for chunk ${key}`, "transaction/expectation-duplicate", {
        chunk,
      });
    }
    seen.add(key);
    return deepFreeze({
      chunk,
      revision: normalizeRevision(entry.revision, `expected revision ${index}`),
    });
  });
  normalized.sort((left, right) => chunkKey(left.chunk).localeCompare(chunkKey(right.chunk)));
  return Object.freeze(normalized);
}

function normalizeChanges(values, registry) {
  if (!Array.isArray(values) || values.length === 0) {
    validationError("Block transaction requires at least one change", "transaction/changes");
  }
  const targets = new Set();
  return Object.freeze(values.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      validationError(`Transaction change ${index} must be an object`, "transaction/change");
    }
    const chunk = normalizeVector3(entry.chunk, `change ${index} chunk`);
    const local = normalizeVector3(entry.local, `change ${index} local`);
    const target = `${chunkKey(chunk)}:${local.join(",")}`;
    if (targets.has(target)) {
      validationError(`Transaction contains duplicate target ${target}`, "transaction/change-duplicate", {
        target,
      });
    }
    targets.add(target);
    const before = normalizeBlockValue(registry, entry.before);
    const after = normalizeBlockValue(registry, entry.after);
    if (blockValuesEqual(before, after)) {
      validationError(`Transaction change ${index} is a no-op`, "transaction/change-noop", { target });
    }
    return deepFreeze({ chunk, local, before, after });
  }));
}

export function createBlockTransaction(value, registry) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError("Block transaction must be an object", "transaction/value");
  }
  const id = String(value.id || "");
  if (!TRANSACTION_ID_PATTERN.test(id)) {
    validationError(`Invalid transaction id: ${id}`, "transaction/id", { id });
  }
  const metadata = canonicalValue(value.metadata ?? {}, { label: "Transaction metadata" });
  assertCanonicalByteLimit(metadata, MAX_TRANSACTION_METADATA_BYTES, "Transaction metadata");

  return deepFreeze({
    format: TRANSACTION_FORMAT,
    id,
    expectedRevisions: normalizeExpectedRevisions(value.expectedRevisions),
    changes: normalizeChanges(value.changes, registry),
    metadata: deepFreeze(metadata),
  });
}

function chunkMap(input) {
  if (input instanceof Map) return new Map(input);
  if (!Array.isArray(input)) {
    validationError("Chunks must be a Map or array", "transaction/chunks");
  }
  const output = new Map();
  for (const chunk of input) {
    if (!chunk || typeof chunk !== "object" || !chunk.key) {
      validationError("Chunk collection contains an invalid chunk", "transaction/chunk");
    }
    if (output.has(chunk.key)) {
      validationError(`Duplicate chunk ${chunk.key}`, "transaction/chunk-duplicate", {
        chunk: chunk.coord,
      });
    }
    output.set(chunk.key, chunk);
  }
  return output;
}

export function applyBlockTransaction(inputChunks, value, registry) {
  const transaction = createBlockTransaction(value, registry);
  const chunks = chunkMap(inputChunks);

  for (const expectation of transaction.expectedRevisions) {
    const key = chunkKey(expectation.chunk);
    const chunk = chunks.get(key);
    if (!chunk) {
      conflictError(`Transaction expects missing chunk ${key}`, "transaction/chunk-missing", {
        transaction: transaction.id,
        chunk: expectation.chunk,
      });
    }
    if (chunk.revision !== expectation.revision) {
      conflictError(`Chunk ${key} revision conflict`, "transaction/revision-conflict", {
        transaction: transaction.id,
        chunk: expectation.chunk,
        expected: expectation.revision,
        actual: chunk.revision,
      });
    }
  }

  const grouped = new Map();
  for (const change of transaction.changes) {
    const key = chunkKey(change.chunk);
    const chunk = chunks.get(key);
    if (!chunk) {
      conflictError(`Transaction targets missing chunk ${key}`, "transaction/chunk-missing", {
        transaction: transaction.id,
        chunk: change.chunk,
      });
    }
    const local = normalizeLocalCoordinate(change.local, chunk.shape);
    const current = chunk.palette[chunk.indices[
      local[0] + chunk.shape[0] * (local[1] + chunk.shape[1] * local[2])
    ]];
    if (!blockValuesEqual(current, change.before)) {
      conflictError(`Block conflict at ${key}:${local.join(",")}`, "transaction/block-conflict", {
        transaction: transaction.id,
        chunk: change.chunk,
        local,
        expected: change.before,
        actual: current,
      });
    }
    const updates = grouped.get(key) ?? [];
    updates.push({ local, value: change.after });
    grouped.set(key, updates);
  }

  const revisions = [];
  for (const [key, updates] of grouped) {
    const before = chunks.get(key);
    const after = patchChunk(before, updates, registry, { revision: before.revision + 1 });
    chunks.set(key, after);
    revisions.push(deepFreeze({
      chunk: after.coord,
      before: before.revision,
      after: after.revision,
    }));
  }
  revisions.sort((left, right) => chunkKey(left.chunk).localeCompare(chunkKey(right.chunk)));

  return Object.freeze({
    chunks,
    transaction,
    revisions: Object.freeze(revisions),
  });
}

export function invertBlockTransaction(value, registry, {
  id,
  expectedRevisions = [],
  metadata = {},
} = {}) {
  const transaction = createBlockTransaction(value, registry);
  return createBlockTransaction({
    id,
    expectedRevisions,
    metadata: {
      ...canonicalValue(metadata, { label: "Inverse transaction metadata" }),
      inverseOf: transaction.id,
    },
    changes: [...transaction.changes].reverse().map((change) => ({
      chunk: change.chunk,
      local: change.local,
      before: change.after,
      after: change.before,
    })),
  }, registry);
}

export function transactionTargetKeys(value, registry) {
  const transaction = createBlockTransaction(value, registry);
  return Object.freeze(transaction.changes.map((change) =>
    `${chunkKey(change.chunk)}:${change.local.join(",")}:${blockValueKey(change.after)}`));
}
