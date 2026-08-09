import {
  chunkKey,
  normalizeVector3,
} from "@greenways/alumbra-core/coordinates";
import { createDeterministicJobQueue } from "./job-queue.js";
import { createLocalMeshWorker } from "./mesh-worker.js";
import { normalizeResidencyEvidence } from "./residency-evidence.js";
import { visibleChunkCoordinates } from "./visibility.js";

const MAX_DESIRED_CHUNKS = 4096;

const isAbortError = (error) => error?.name === "AbortError";
const isThenable = (value) => value && typeof value.then === "function";

const normalizeConcurrency = (value, label) => {
  const number = Number(value ?? 1);
  if (!Number.isSafeInteger(number) || number < 1 || number > 64) {
    throw new RangeError(`${label} must be an integer between 1 and 64`);
  }
  return number;
};

const normalizeReleasedResources = (value) => {
  if (value == null || value === false) return 0;
  if (value === true) return 1;
  const number = Number(
    typeof value === "object" && !Array.isArray(value)
      ? value.resources
      : value,
  );
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError("Chunk eviction must report a non-negative resource count");
  }
  return number;
};

const validateChunk = (chunk, expectedKey) => {
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
    throw new TypeError("Chunk generation must return a canonical chunk object");
  }
  if (chunk.key !== expectedKey || chunkKey(chunk.coord) !== expectedKey) {
    throw new Error(`Generated chunk does not match requested coordinate ${expectedKey}`);
  }
  if (!Number.isSafeInteger(chunk.revision) || chunk.revision < 0 || chunk.revision > 0xffffffff) {
    throw new TypeError("Generated chunk revision must be an unsigned 32-bit integer");
  }
  if (!Array.isArray(chunk.shape) || chunk.shape.length !== 3) {
    throw new TypeError("Generated chunk must carry a three-axis shape");
  }
  return chunk;
};

const normalizeDesired = (coords) => {
  if (!Array.isArray(coords)) throw new TypeError("Desired chunks must be an array of coordinates");
  if (coords.length > MAX_DESIRED_CHUNKS) {
    throw new RangeError(`Desired chunks cannot exceed ${MAX_DESIRED_CHUNKS}`);
  }
  const seen = new Set();
  const output = [];
  for (const [index, value] of coords.entries()) {
    const coord = normalizeVector3(value, `desired chunk ${index}`);
    const key = chunkKey(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(Object.freeze({ coord, key, priority: coords.length - index }));
  }
  return Object.freeze(output);
};

export function createChunkResidencyScheduler({
  generateChunk,
  buildMesh = null,
  meshWorker = null,
  installMesh,
  evictChunk = null,
  generationConcurrency = 1,
  meshConcurrency = 1,
} = {}) {
  if (typeof generateChunk !== "function") throw new TypeError("Chunk residency requires generateChunk");
  if (typeof installMesh !== "function") throw new TypeError("Chunk residency requires installMesh");
  if (!meshWorker && typeof buildMesh !== "function") {
    throw new TypeError("Chunk residency requires buildMesh or an injected meshWorker");
  }
  if (meshWorker && (
    typeof meshWorker.submit !== "function"
    || typeof meshWorker.drain !== "function"
    || typeof meshWorker.stats !== "function"
    || typeof meshWorker.destroy !== "function"
  )) {
    throw new TypeError("Injected meshWorker does not implement the residency worker contract");
  }

  const records = new Map();
  const activeTasks = new Set();
  const worker = meshWorker ?? createLocalMeshWorker({
    buildMesh,
    concurrency: normalizeConcurrency(meshConcurrency, "Mesh concurrency"),
  });
  let generationSequence = 0;
  let meshSequence = 0;
  let desiredEpoch = 0;
  let meshInstalls = 0;
  let discardedStaleJobs = 0;
  let evictedResources = 0;
  let failedJobs = 0;
  let destroyed = false;
  let destroyPromise = null;

  const generationQueue = createDeterministicJobQueue({
    name: "Alumbra chunk generation",
    concurrency: normalizeConcurrency(generationConcurrency, "Generation concurrency"),
    execute: async (job, execution) => validateChunk(await generateChunk(Object.freeze({
      coord: job.coord,
      key: job.key,
      requestId: job.id,
      signal: execution.signal,
    })), job.key),
  });

  const track = (promise) => {
    activeTasks.add(promise);
    promise.finally(() => activeTasks.delete(promise));
    return promise;
  };

  const callInstall = (record, mesh) => {
    const result = installMesh(Object.freeze({
      coord: record.coord,
      key: record.key,
      chunk: record.chunk,
      revision: record.chunk.revision,
      mesh,
    }));
    if (isThenable(result)) {
      throw new TypeError("Chunk mesh installation must be synchronous so revision fencing remains atomic");
    }
    return result;
  };

  const callEvict = (record) => {
    if (record.installedRevision == null || typeof evictChunk !== "function") return 0;
    const result = evictChunk(Object.freeze({
      coord: record.coord,
      key: record.key,
      chunk: record.chunk,
      revision: record.installedRevision,
    }));
    if (isThenable(result)) {
      throw new TypeError("Chunk eviction must be synchronous so residency evidence remains exact");
    }
    return normalizeReleasedResources(result);
  };

  const scheduleMesh = (record) => {
    if (destroyed || !record.desired || !record.chunk) return null;
    if (record.installedRevision === record.chunk.revision && record.meshToken == null) return null;
    const token = `mesh:${record.key}:${record.chunk.revision}:${meshSequence++}`;
    record.meshToken = token;
    const revision = record.chunk.revision;
    const task = worker.submit({
      id: token,
      chunkKey: record.key,
      revision,
      chunk: record.chunk,
      priority: record.priority,
      context: Object.freeze({ desiredEpoch: record.desiredEpoch }),
    }).then((result) => {
      if (destroyed) return Object.freeze({ status: "disposed", key: record.key, revision });
      const current = records.get(record.key);
      if (
        !current
        || !current.desired
        || current.meshToken !== token
        || !current.chunk
        || current.chunk.revision !== result.revision
      ) {
        discardedStaleJobs += 1;
        return Object.freeze({ status: "stale", key: record.key, revision });
      }
      callInstall(current, result.mesh);
      current.installedRevision = result.revision;
      current.meshToken = null;
      meshInstalls += 1;
      return Object.freeze({ status: "installed", key: record.key, revision });
    }).catch((error) => {
      if (!isAbortError(error)) failedJobs += 1;
      const current = records.get(record.key);
      if (current?.meshToken === token) current.meshToken = null;
      return Object.freeze({
        status: isAbortError(error) ? "cancelled" : "failed",
        key: record.key,
        revision,
      });
    });
    return track(task);
  };

  const scheduleGeneration = (record) => {
    if (destroyed || !record.desired || record.generationToken || record.chunk) return null;
    const token = `generate:${record.key}:${record.desiredEpoch}:${generationSequence++}`;
    record.generationToken = token;
    const task = generationQueue.submit({
      id: token,
      priority: record.priority,
      value: Object.freeze({
        id: token,
        coord: record.coord,
        key: record.key,
        desiredEpoch: record.desiredEpoch,
      }),
    }).then((chunk) => {
      if (destroyed) return Object.freeze({ status: "disposed", key: record.key });
      const current = records.get(record.key);
      if (
        !current
        || !current.desired
        || current.generationToken !== token
        || current.desiredEpoch !== record.desiredEpoch
      ) {
        return Object.freeze({ status: "stale", key: record.key });
      }
      current.generationToken = null;
      if (current.chunk && current.chunk.revision > chunk.revision) {
        discardedStaleJobs += 1;
        return Object.freeze({ status: "stale", key: record.key });
      }
      current.chunk = chunk;
      scheduleMesh(current);
      return Object.freeze({ status: "generated", key: record.key, revision: chunk.revision });
    }).catch((error) => {
      if (!isAbortError(error)) failedJobs += 1;
      const current = records.get(record.key);
      if (current?.generationToken === token) current.generationToken = null;
      return Object.freeze({
        status: isAbortError(error) ? "cancelled" : "failed",
        key: record.key,
      });
    });
    return track(task);
  };

  const evictRecord = (record) => {
    record.desired = false;
    if (record.generationToken) generationQueue.cancel(record.generationToken, `Chunk ${record.key} left residency`);
    record.generationToken = null;
    record.meshToken = null;
    try {
      evictedResources += callEvict(record);
    } catch (error) {
      failedJobs += 1;
      throw error;
    } finally {
      records.delete(record.key);
    }
  };

  const evidence = () => {
    const generation = generationQueue.stats();
    const meshes = worker.stats();
    const desiredChunks = records.size;
    const residentChunks = [...records.values()]
      .filter((record) => record.desired && record.installedRevision != null)
      .length;
    return normalizeResidencyEvidence({
      status: destroyed ? "disposed" : "active",
      desiredChunks,
      residentChunks,
      pendingGeneration: generation.pending,
      runningGeneration: generation.running,
      pendingMeshes: meshes.pending,
      runningMeshes: meshes.running,
      meshInstalls,
      discardedStaleJobs,
      evictedResources,
      failedJobs,
    });
  };

  const api = {
    setDesired(coords) {
      if (destroyed) throw new Error("Chunk residency scheduler has been destroyed");
      const desired = normalizeDesired(coords);
      const desiredKeys = new Set(desired.map((entry) => entry.key));
      desiredEpoch += 1;

      for (const record of [...records.values()]) {
        if (!desiredKeys.has(record.key)) evictRecord(record);
      }
      for (const entry of desired) {
        let record = records.get(entry.key);
        if (!record) {
          record = {
            coord: entry.coord,
            key: entry.key,
            priority: entry.priority,
            desired: true,
            desiredEpoch,
            generationToken: null,
            meshToken: null,
            chunk: null,
            installedRevision: null,
          };
          records.set(entry.key, record);
        } else {
          record.desired = true;
          record.priority = entry.priority;
          record.desiredEpoch = desiredEpoch;
        }
        scheduleGeneration(record);
      }
      return evidence();
    },
    setView(options = {}) {
      const coords = visibleChunkCoordinates(options);
      return api.setDesired(coords);
    },
    updateChunk(chunk) {
      if (destroyed) throw new Error("Chunk residency scheduler has been destroyed");
      if (!chunk?.key) throw new TypeError("updateChunk requires a canonical chunk");
      validateChunk(chunk, chunk.key);
      let record = records.get(chunk.key);
      if (!record) {
        desiredEpoch += 1;
        record = {
          coord: chunk.coord,
          key: chunk.key,
          priority: 0,
          desired: true,
          desiredEpoch,
          generationToken: null,
          meshToken: null,
          chunk: null,
          installedRevision: null,
        };
        records.set(chunk.key, record);
      }
      if (record.chunk && chunk.revision < record.chunk.revision) {
        throw new Error(`Cannot install stale canonical chunk revision ${chunk.revision} over ${record.chunk.revision}`);
      }
      if (record.generationToken) {
        generationQueue.cancel(record.generationToken, `Canonical chunk ${chunk.key} arrived before generation completed`);
        record.generationToken = null;
      }
      record.chunk = chunk;
      scheduleMesh(record);
      return evidence();
    },
    evidence,
    async drain() {
      for (let iteration = 0; iteration < 128; iteration += 1) {
        await generationQueue.drain();
        await Promise.resolve();
        await worker.drain();
        await Promise.resolve();
        if (activeTasks.size) await Promise.allSettled([...activeTasks]);
        const generation = generationQueue.stats();
        const meshes = worker.stats();
        if (!generation.pending && !generation.running && !meshes.pending && !meshes.running && !activeTasks.size) {
          return evidence();
        }
      }
      throw new Error("Chunk residency scheduler did not quiesce within the bounded drain loop");
    },
    destroy() {
      if (destroyPromise) return destroyPromise;
      destroyed = true;
      destroyPromise = (async () => {
        for (const record of [...records.values()]) evictRecord(record);
        await Promise.all([generationQueue.destroy(), worker.destroy()]);
        if (activeTasks.size) await Promise.allSettled([...activeTasks]);
        return evidence();
      })();
      return destroyPromise;
    },
  };

  return Object.freeze(api);
}
