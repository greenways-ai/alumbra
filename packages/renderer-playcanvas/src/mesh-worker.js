import { CHUNK_MESH_FORMAT } from "./mesh.js";
import { createDeterministicJobQueue } from "./job-queue.js";

const normalizeMeshJob = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Mesh worker job must be an object");
  }
  const id = String(value.id ?? "").trim();
  const chunkKey = String(value.chunkKey ?? "").trim();
  const revision = Number(value.revision);
  if (!id || !chunkKey) throw new TypeError("Mesh worker job requires id and chunkKey");
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 0xffffffff) {
    throw new TypeError("Mesh worker revision must be an unsigned 32-bit integer");
  }
  if (!value.chunk || value.chunk.key !== chunkKey || value.chunk.revision !== revision) {
    throw new TypeError("Mesh worker job must carry the matching canonical chunk revision");
  }
  return Object.freeze({
    id,
    chunkKey,
    revision,
    chunk: value.chunk,
    priority: Number.isSafeInteger(value.priority) ? value.priority : 0,
    context: value.context ?? null,
  });
};

const normalizeMeshResult = (job, mesh) => {
  if (!mesh || typeof mesh !== "object" || Array.isArray(mesh)) {
    throw new TypeError("Mesh worker result must be a chunk mesh object");
  }
  if (mesh.format !== CHUNK_MESH_FORMAT) {
    throw new Error(`Unsupported mesh worker result format: ${mesh.format}`);
  }
  if (mesh.chunkKey !== job.chunkKey || mesh.revision !== job.revision) {
    throw new Error("Mesh worker result does not match the submitted chunk revision");
  }
  return Object.freeze({
    id: job.id,
    chunkKey: job.chunkKey,
    revision: job.revision,
    mesh,
  });
};

export function createLocalMeshWorker({
  buildMesh,
  concurrency = 1,
  name = "Alumbra local mesh worker",
} = {}) {
  if (typeof buildMesh !== "function") throw new TypeError("A local mesh worker requires buildMesh");
  const queue = createDeterministicJobQueue({
    name,
    concurrency,
    execute: async (job, execution) => {
      const mesh = await buildMesh(Object.freeze({
        chunk: job.chunk,
        chunkKey: job.chunkKey,
        revision: job.revision,
        context: job.context,
        signal: execution.signal,
      }));
      return normalizeMeshResult(job, mesh);
    },
  });

  return Object.freeze({
    submit(value) {
      const job = normalizeMeshJob(value);
      return queue.submit({
        id: job.id,
        priority: job.priority,
        value: job,
      });
    },
    cancel: queue.cancel,
    has: queue.has,
    stats: queue.stats,
    drain: queue.drain,
    destroy: queue.destroy,
  });
}
