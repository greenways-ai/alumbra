import { CHUNK_MESH_FORMAT } from "./mesh.js";
import {
  createMeshLightingContext,
  meshLightingEvidenceEqual,
  normalizeMeshLightingEvidence,
  validateMeshLightGroup,
} from "./mesh-light.js";
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
  const lighting = value.lightSnapshots == null
    ? null
    : createMeshLightingContext({
      chunk: value.chunk,
      snapshots: value.lightSnapshots,
    });
  return Object.freeze({
    id,
    chunkKey,
    revision,
    chunk: value.chunk,
    priority: Number.isSafeInteger(value.priority) ? value.priority : 0,
    context: value.context ?? null,
    lightSnapshots: lighting?.snapshots() ?? null,
    lighting: lighting?.evidence() ?? null,
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
  const lighting = mesh.lighting == null
    ? null
    : normalizeMeshLightingEvidence(mesh.lighting, { chunk: job.chunk });
  if (job.lighting == null ? lighting != null : lighting == null) {
    throw new Error("Mesh worker result lighting does not match the submitted job");
  }
  if (job.lighting && !meshLightingEvidenceEqual(job.lighting, lighting)) {
    throw new Error("Mesh worker result light-field evidence does not match the submitted job");
  }
  if (!Array.isArray(mesh.groups)) {
    throw new TypeError("Mesh worker result requires mesh groups");
  }
  mesh.groups.forEach((group, index) => {
    const vertexCount = group?.positions?.length / 3;
    if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) {
      throw new TypeError(`Mesh worker group ${index} has invalid positions`);
    }
    validateMeshLightGroup(group, vertexCount, lighting, `Mesh worker group ${index}`);
  });
  const output = {
    id: job.id,
    chunkKey: job.chunkKey,
    revision: job.revision,
    mesh,
  };
  if (lighting) output.lighting = lighting;
  return Object.freeze(output);
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
      const request = {
        chunk: job.chunk,
        chunkKey: job.chunkKey,
        revision: job.revision,
        context: job.context,
        signal: execution.signal,
      };
      if (job.lighting) {
        request.lightSnapshots = job.lightSnapshots;
        request.lighting = job.lighting;
      }
      const mesh = await buildMesh(Object.freeze(request));
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
