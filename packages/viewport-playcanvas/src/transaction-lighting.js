import {
  TRANSACTION_FORMAT,
  chunkKey,
  validationError,
} from "@greenways/alumbra-core";

export const VIEWPORT_LIGHTING_TRANSACTION_FORMAT = "alumbra.viewport-lighting-transaction/1";

const UINT32_MAX = 0xffffffff;

const safeCounter = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    validationError(`${label} must be a non-negative safe integer`, "viewport-lighting-transaction/counter", {
      label,
      value,
    });
  }
  return value;
};

const revision = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    validationError(`${label} must be an unsigned 32-bit integer`, "viewport-lighting-transaction/revision", {
      label,
      value,
    });
  }
  return value;
};

const sortedUnique = (values, label) => {
  if (!Array.isArray(values)) {
    validationError(`${label} must be an array`, "viewport-lighting-transaction/array", { label });
  }
  const output = values.map((value) => String(value)).sort();
  if (new Set(output).size !== output.length) {
    validationError(`${label} contains duplicates`, "viewport-lighting-transaction/duplicate", { label });
  }
  return Object.freeze(output);
};

const sameValues = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

const canonicalChunk = (value, expectedKey, expectedRevision) => {
  if (!value || value.format !== "alumbra.chunk/1") {
    validationError("Accepted lighting transactions require canonical post-transaction chunks", "viewport-lighting-transaction/chunk");
  }
  if (value.key !== expectedKey || chunkKey(value.coord) !== expectedKey) {
    validationError(
      `Post-transaction chunk identity does not match ${expectedKey}`,
      "viewport-lighting-transaction/chunk-key",
    );
  }
  if (value.revision !== expectedRevision) {
    validationError(
      `Post-transaction chunk ${expectedKey} is not revision ${expectedRevision}`,
      "viewport-lighting-transaction/chunk-revision",
      { expected: expectedRevision, actual: value.revision },
    );
  }
  return value;
};

const normalizeAcceptance = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError("Accepted lighting transaction must be an object", "viewport-lighting-transaction/acceptance");
  }
  const transaction = value.transaction;
  if (!transaction || transaction.format !== TRANSACTION_FORMAT || typeof transaction.id !== "string") {
    validationError("Accepted lighting transaction requires a canonical Core transaction", "viewport-lighting-transaction/transaction");
  }
  if (!Array.isArray(transaction.changes) || transaction.changes.length === 0) {
    validationError("Accepted lighting transaction requires changed voxels", "viewport-lighting-transaction/changes");
  }
  if (!Array.isArray(value.revisions) || value.revisions.length === 0) {
    validationError("Accepted lighting transaction requires revision receipts", "viewport-lighting-transaction/revisions");
  }

  const changedKeys = sortedUnique(
    [...new Set(transaction.changes.map((change) => chunkKey(change.chunk)))],
    "Accepted changed chunk keys",
  );
  const revisions = value.revisions.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      validationError(`Accepted revision ${index} must be an object`, "viewport-lighting-transaction/revision-entry");
    }
    const key = chunkKey(entry.chunk);
    const before = revision(entry.before, `Accepted revision ${index} before`);
    const after = revision(entry.after, `Accepted revision ${index} after`);
    if (after !== before + 1) {
      validationError(
        `Accepted revision ${key} must advance exactly once`,
        "viewport-lighting-transaction/revision-step",
        { key, before, after },
      );
    }
    return Object.freeze({ key, coord: Object.freeze([...entry.chunk]), before, after });
  }).sort((left, right) => left.key.localeCompare(right.key));
  const revisionKeys = sortedUnique(revisions.map((entry) => entry.key), "Accepted revision keys");
  if (!sameValues(changedKeys, revisionKeys)) {
    validationError(
      "Accepted transaction changes and revision receipts target different chunks",
      "viewport-lighting-transaction/revision-targets",
      { changedKeys, revisionKeys },
    );
  }
  const acceptedAffected = sortedUnique(value.affected, "Accepted affected chunk keys");
  if (!sameValues(acceptedAffected, revisionKeys)) {
    validationError(
      "Accepted world affected keys do not match revision receipts",
      "viewport-lighting-transaction/affected",
      { acceptedAffected, revisionKeys },
    );
  }

  return Object.freeze({
    transaction,
    revisions: Object.freeze(revisions),
    changedKeys,
    worldRevision: safeCounter(value.revision, "Accepted world revision"),
  });
};

const boundedLightingCounters = (coordinator) => {
  const evidence = coordinator.evidence();
  return Object.freeze({
    requestVersion: safeCounter(evidence.requestVersion ?? 0, "Coordinator request version"),
    requestedGeneration: safeCounter(
      evidence.lighting?.requestedGeneration ?? 0,
      "Coordinator requested lighting generation",
    ),
    installedGeneration: safeCounter(
      evidence.lighting?.installedGeneration ?? 0,
      "Coordinator installed lighting generation",
    ),
  });
};

export function routeAcceptedLightingTransaction({
  acceptance: acceptanceValue,
  getChunk,
  coordinator,
} = {}) {
  if (typeof getChunk !== "function") {
    validationError("Accepted lighting transaction routing requires getChunk", "viewport-lighting-transaction/get-chunk");
  }
  if (!coordinator
    || typeof coordinator.updateChunk !== "function"
    || typeof coordinator.chunks !== "function"
    || typeof coordinator.evidence !== "function") {
    validationError(
      "Accepted lighting transaction routing requires a viewport lighting coordinator",
      "viewport-lighting-transaction/coordinator",
    );
  }

  const acceptance = normalizeAcceptance(acceptanceValue);
  const current = coordinator.chunks();
  const postChunks = acceptance.revisions.map((entry) => canonicalChunk(
    getChunk(entry.coord),
    entry.key,
    entry.after,
  ));

  const pending = [];
  for (let index = 0; index < acceptance.revisions.length; index += 1) {
    const entry = acceptance.revisions[index];
    const chunk = postChunks[index];
    const installed = current.get(entry.key) ?? null;
    if (installed == null || installed.revision < entry.after) {
      pending.push({ entry, chunk });
      continue;
    }
    if (installed.revision > entry.after) {
      validationError(
        `Accepted transaction ${acceptance.transaction.id} is stale for ${entry.key}`,
        "viewport-lighting-transaction/stale",
        { expected: entry.after, actual: installed.revision },
      );
    }
    if (installed !== chunk) {
      validationError(
        `Accepted transaction collides with ${entry.key}@${entry.after}`,
        "viewport-lighting-transaction/collision",
      );
    }
  }

  const before = boundedLightingCounters(coordinator);
  const affected = new Set();
  for (const { chunk } of pending) {
    const invalidation = coordinator.updateChunk(chunk);
    for (const key of invalidation.affected ?? []) affected.add(String(key));
  }
  const after = boundedLightingCounters(coordinator);

  return Object.freeze({
    format: VIEWPORT_LIGHTING_TRANSACTION_FORMAT,
    transactionId: acceptance.transaction.id,
    worldRevision: acceptance.worldRevision,
    applied: pending.length > 0,
    changedKeys: acceptance.changedKeys,
    affectedKeys: Object.freeze([...affected].sort()),
    revisions: Object.freeze(acceptance.revisions.map((entry) => Object.freeze({
      key: entry.key,
      before: entry.before,
      after: entry.after,
    }))),
    before,
    after,
  });
}
