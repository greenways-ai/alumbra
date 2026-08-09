import {
  createBlockTransaction,
  invertBlockTransaction,
} from "@greenways/alumbra-core";
import {createBuildTransaction} from "@greenways/alumbra-engine";

const nonNegativeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
  return value;
};

function validateTransactions(values, registry, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return values.map((entry) => createBlockTransaction(entry, registry));
}

function expectedCurrentRevisions(world, transaction) {
  const seen = new Set();
  const output = [];
  for (const change of transaction.changes) {
    const key = change.chunk.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const chunk = world.getChunk(change.chunk);
    if (!chunk) throw new Error(`Undo target chunk is unloaded: ${key}`);
    output.push({chunk: chunk.coord, revision: chunk.revision});
  }
  return output;
}

export function createPlayableWorldController({
  world,
  renderer,
  journal = [],
  undoStack = [],
  transactionSequence = 0,
  worldRevision = 0,
  actor = "actor:local",
} = {}) {
  if (!world?.registry || typeof world.apply !== "function") throw new TypeError("Playable controller requires an Alumbra world runtime");
  if (!renderer || typeof renderer.setChunk !== "function") throw new TypeError("Playable controller requires a renderer with setChunk(chunk)");
  const acceptedJournal = validateTransactions(journal, world.registry, "Playable journal");
  const acceptedUndoStack = validateTransactions(undoStack, world.registry, "Playable undo stack");
  let sequence = nonNegativeInteger(transactionSequence, "Transaction sequence");
  let revision = nonNegativeInteger(worldRevision, "World revision");
  let disposed = false;

  const ensureActive = () => {
    if (disposed) throw new Error("Playable world controller has been destroyed");
  };
  const sync = (affected) => {
    for (const key of affected) {
      const chunk = world.getChunk(key);
      if (!chunk) throw new Error(`Accepted transaction removed or omitted affected chunk ${key}`);
      renderer.setChunk(chunk);
    }
  };
  const candidateId = (kind) => `build/${sequence + 1}/${kind}`;

  return Object.freeze({
    get state() {
      return Object.freeze({
        transactionSequence: sequence,
        worldRevision: revision,
        journalLength: acceptedJournal.length,
        undoDepth: acceptedUndoStack.length,
      });
    },
    history() {
      return Object.freeze({
        journal: Object.freeze([...acceptedJournal]),
        undoStack: Object.freeze([...acceptedUndoStack]),
      });
    },
    applyAction({type, id = null, metadata = {}, ...intent} = {}) {
      ensureActive();
      const transaction = createBuildTransaction({
        ...intent,
        type,
        id: id ?? candidateId(type),
        actor,
        metadata: {...metadata, requestedWorldRevision: revision},
        world,
      });
      const result = world.apply(transaction, {record: false});
      sequence += 1;
      revision += 1;
      acceptedJournal.push(result.transaction);
      acceptedUndoStack.push(result.transaction);
      sync(result.affected);
      return Object.freeze({...result, transactionSequence: sequence, worldRevision: revision});
    },
    undo({id = null, metadata = {}} = {}) {
      ensureActive();
      const original = acceptedUndoStack.at(-1);
      if (!original) return null;
      const inverse = invertBlockTransaction(original, world.registry, {
        id: id ?? candidateId("undo"),
        expectedRevisions: expectedCurrentRevisions(world, original),
        metadata: {
          ...metadata,
          undoOf: original.id,
          requestedWorldRevision: revision,
        },
      });
      const result = world.apply(inverse, {record: false});
      sequence += 1;
      revision += 1;
      acceptedJournal.push(result.transaction);
      acceptedUndoStack.pop();
      sync(result.affected);
      return Object.freeze({
        ...result,
        undone: original.id,
        transactionSequence: sequence,
        worldRevision: revision,
      });
    },
    destroy() {
      disposed = true;
    },
  });
}
