import { normalizeBlockValue } from "@greenways/alumbra-core/blocks";
import { getBlock } from "@greenways/alumbra-core/chunks";
import { chunkKey, worldToChunk } from "@greenways/alumbra-core/coordinates";
import { applyBlockTransaction, createBlockTransaction, invertBlockTransaction } from "@greenways/alumbra-core/transactions";

const MISSING_POLICIES = new Set(["solid", "empty", "error"]);

function chunkMap(input) {
  const entries = input instanceof Map ? [...input.values()] : [...(input ?? [])];
  const output = new Map();
  for (const chunk of entries) {
    if (!chunk?.key || !Array.isArray(chunk.coord) || !Array.isArray(chunk.shape)) {
      throw new TypeError("Alumbra world contains an invalid chunk");
    }
    if (output.has(chunk.key)) throw new Error(`Duplicate Alumbra world chunk: ${chunk.key}`);
    output.set(chunk.key, chunk);
  }
  return output;
}

export function createWorldRuntime({
  registry,
  chunks = [],
  missingChunkPolicy = "solid",
  worldId = "world:alumbra/local",
} = {}) {
  if (!registry) throw new TypeError("Alumbra world runtime requires a block registry");
  if (!MISSING_POLICIES.has(missingChunkPolicy)) throw new Error(`Unsupported missing chunk policy: ${missingChunkPolicy}`);
  const map = chunkMap(chunks);
  const firstChunk = map.values().next().value ?? null;
  const shape = firstChunk ? Object.freeze([...firstChunk.shape]) : null;
  for (const chunk of map.values()) {
    if (shape.some((entry, axis) => entry !== chunk.shape[axis])) {
      throw new Error("All chunks in one Alumbra world runtime must use the same shape");
    }
  }
  const emptyBlock = normalizeBlockValue(registry, registry.emptyBlock);
  let revision = 0;
  const history = [];

  const locate = (world) => {
    if (!Array.isArray(world) || world.length !== 3 || world.some((entry) => !Number.isSafeInteger(entry))) {
      throw new TypeError("World voxel position must contain three safe integers");
    }
    if (!shape) return Object.freeze({loaded: false, chunk: null, local: null, key: null});
    const location = worldToChunk(world, shape);
    const key = chunkKey(location.chunk);
    const chunk = map.get(key) ?? null;
    return Object.freeze({loaded: Boolean(chunk), chunk, local: location.local, key, coord: location.chunk});
  };

  const blockAt = (world) => {
    const location = locate(world);
    if (location.chunk) return getBlock(location.chunk, location.local);
    if (missingChunkPolicy === "empty") return emptyBlock;
    if (missingChunkPolicy === "error") throw new Error(`World voxel is in an unloaded chunk: ${world.join(",")}`);
    return null;
  };

  const isSolidBlock = (block) => {
    if (block == null) return missingChunkPolicy === "solid";
    const definition = registry.get(block.id);
    if (!definition) throw new Error(`World references an unknown block: ${block.id}`);
    if (definition.empty) return false;
    return definition.metadata?.physics?.solid !== false;
  };

  const apply = (value, {record = true} = {}) => {
    const transaction = createBlockTransaction(value, registry);
    const result = applyBlockTransaction(map, transaction, registry);
    map.clear();
    for (const [key, chunk] of result.chunks) map.set(key, chunk);
    revision += 1;
    const affected = Object.freeze(result.revisions.map((entry) => chunkKey(entry.chunk)).sort());
    if (record) {
      const inverse = invertBlockTransaction(transaction, registry, {
        id: `${transaction.id}/undo`,
        expectedRevisions: result.revisions.map((entry) => ({chunk: entry.chunk, revision: entry.after})),
        metadata: {worldRevision: revision},
      });
      history.push(Object.freeze({transaction, inverse, affected, revision}));
    }
    return Object.freeze({transaction: result.transaction, revisions: result.revisions, affected, revision});
  };

  return Object.freeze({
    worldId: String(worldId),
    registry,
    missingChunkPolicy,
    chunkShape: shape,
    get revision() { return revision; },
    get historyLength() { return history.length; },
    chunks() { return new Map(map); },
    getChunk(coordOrKey) { return map.get(Array.isArray(coordOrKey) ? chunkKey(coordOrKey) : String(coordOrKey)) ?? null; },
    locate,
    getBlock: blockAt,
    isSolidBlock,
    apply,
    undo({id} = {}) {
      if (!history.length) return null;
      const record = history.at(-1);
      const inverse = id
        ? invertBlockTransaction(record.transaction, registry, {
          id,
          expectedRevisions: record.inverse.expectedRevisions,
          metadata: {undoOf: record.transaction.id, worldRevision: revision},
        })
        : record.inverse;
      const result = apply(inverse, {record: false});
      history.pop();
      return Object.freeze({...result, undone: record.transaction.id});
    },
  });
}
