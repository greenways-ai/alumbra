import {
  chunkKey,
  getBlock,
  normalizeBlockValue,
  normalizeChunkShape,
  normalizeVector3,
  validationError,
  worldToChunk,
} from "@greenways/alumbra-core";
import {
  createLightingRuntime,
} from "@greenways/alumbra-engine";
import {
  MESH_LIGHT_SNAPSHOT_FORMAT,
  buildChunkMesh,
} from "@greenways/alumbra-renderer-playcanvas";

export const VIEWPORT_LIGHTING_COORDINATOR_FORMAT = "alumbra.viewport-lighting-coordinator/1";
export const VIEWPORT_LIGHTING_EVIDENCE_FORMAT = "alumbra.viewport-lighting-evidence/1";
export const VIEWPORT_LIT_RENDERER_FORMAT = "alumbra.viewport-lit-renderer/1";

const MAX_COORDINATED_CHUNKS = 4096;
const CARDINAL_DIRECTIONS = Object.freeze([
  Object.freeze([-1, 0, 0]),
  Object.freeze([0, -1, 0]),
  Object.freeze([0, 0, -1]),
  Object.freeze([0, 0, 1]),
  Object.freeze([0, 1, 0]),
  Object.freeze([1, 0, 0]),
]);

const isThenable = (value) => value != null && typeof value.then === "function";

const compareCoord = (left, right) => left.coord[0] - right.coord[0]
  || left.coord[1] - right.coord[1]
  || left.coord[2] - right.coord[2];

const count = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0
  ? Number(value)
  : 0;

const releasedCount = (value) => {
  if (value == null || value === false) return 0;
  if (value === true) return 1;
  const released = Number(typeof value === "object" && !Array.isArray(value)
    ? value.resources
    : value);
  if (!Number.isSafeInteger(released) || released < 0) {
    validationError(
      "Viewport lighting removals must report a non-negative resource count",
      "viewport-lighting/removal-evidence",
    );
  }
  return released;
};

const sameVector = (left, right) => Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((entry, index) => entry === right[index]);

const keyFor = (coordOrKey) => Array.isArray(coordOrKey)
  ? chunkKey(coordOrKey)
  : String(coordOrKey);

function canonicalChunk(value, expectedShape = null) {
  if (!value || value.format !== "alumbra.chunk/1") {
    validationError("Viewport lighting requires canonical Core chunks", "viewport-lighting/chunk");
  }
  const coord = normalizeVector3(value.coord, "Viewport lighting chunk coordinate");
  const shape = normalizeChunkShape(value.shape);
  if (value.key !== chunkKey(coord)) {
    validationError("Viewport lighting chunk key does not match its coordinate", "viewport-lighting/chunk-key");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision > 0xffffffff) {
    validationError("Viewport lighting chunk revision must be an unsigned 32-bit integer", "viewport-lighting/revision");
  }
  if (expectedShape && !sameVector(shape, expectedShape)) {
    validationError("Viewport lighting chunks must use one shape", "viewport-lighting/chunk-shape");
  }
  return value;
}

function normalizedChunkMap(input) {
  const values = input instanceof Map
    ? [...input.values()]
    : Array.isArray(input)
      ? [...input]
      : validationError("Viewport lighting chunks must be an array or Map", "viewport-lighting/chunks");
  if (values.length > MAX_COORDINATED_CHUNKS) {
    validationError(
      `Viewport lighting cannot exceed ${MAX_COORDINATED_CHUNKS} chunks`,
      "viewport-lighting/chunk-limit",
    );
  }
  const output = new Map();
  let shape = null;
  for (const value of values) {
    const chunk = canonicalChunk(value, shape);
    shape ??= chunk.shape;
    if (output.has(chunk.key)) {
      validationError(`Duplicate viewport lighting chunk ${chunk.key}`, "viewport-lighting/chunk-duplicate");
    }
    output.set(chunk.key, chunk);
  }
  return Object.freeze({
    chunks: output,
    shape: shape == null ? null : Object.freeze([...shape]),
  });
}

function sortedKeys(keys, chunks) {
  return Object.freeze([...keys]
    .map((key) => chunks.get(key))
    .filter(Boolean)
    .sort(compareCoord)
    .map((chunk) => chunk.key));
}

function addKeys(target, values) {
  for (const value of values ?? []) target.add(String(value));
}

function rendererCounts(renderer) {
  const stats = renderer?.stats?.() ?? {};
  return Object.freeze({
    chunks: count(stats.chunks),
    quads: count(stats.quads),
    triangles: count(stats.triangles),
    meshResources: count(stats.meshPool?.resources),
    meshReferences: count(stats.meshPool?.references),
    materialResources: count(stats.materialPool?.resources),
    materialReferences: count(stats.materialPool?.references),
  });
}

function lightingCounts(runtime) {
  const evidence = runtime.evidence();
  return Object.freeze({
    status: String(evidence.status),
    profileId: String(evidence.profileId),
    epoch: count(evidence.epoch),
    requestedGeneration: count(evidence.requestedGeneration),
    installedGeneration: count(evidence.installedGeneration),
    loadedChunks: count(evidence.loadedChunks),
    installedFieldChunks: count(evidence.installedFieldChunks),
    validFieldChunks: count(evidence.validFieldChunks),
    invalidatedChunks: count(evidence.invalidatedChunks),
    installs: count(evidence.installs),
    rejectedStaleResults: count(evidence.rejectedStaleResults),
    baseline: evidence.baseline === true,
  });
}

function snapshotFromField(field, fieldSet) {
  if (!field || typeof field.copySunlight !== "function" || typeof field.copyEmitted !== "function") {
    validationError("Viewport lighting cannot snapshot an invalid light field", "viewport-lighting/field");
  }
  return Object.freeze({
    format: MESH_LIGHT_SNAPSHOT_FORMAT,
    profileId: fieldSet.profile.id,
    generation: fieldSet.generation,
    epoch: fieldSet.epoch,
    maxLevel: fieldSet.profile.maxLevel,
    key: field.key,
    coord: field.coord,
    shape: field.shape,
    sourceRevision: field.sourceRevision,
    sunlight: field.copySunlight(),
    emitted: field.copyEmitted(),
  });
}

function snapshotsForChunk(chunk, fieldSet) {
  const coords = [chunk.coord, ...CARDINAL_DIRECTIONS.map((direction) =>
    chunk.coord.map((value, axis) => value + direction[axis]))];
  const fields = coords
    .map((coord) => fieldSet.getField(coord))
    .filter(Boolean)
    .sort(compareCoord);
  const target = fields.find((field) => field.key === chunk.key);
  if (!target || target.sourceRevision !== chunk.revision) {
    validationError(
      `Viewport lighting is missing the exact field for ${chunk.key}@${chunk.revision}`,
      "viewport-lighting/target-field",
    );
  }
  return Object.freeze(fields.map((field) => snapshotFromField(field, fieldSet)));
}

function meshCounts(mesh) {
  const groups = Array.isArray(mesh?.groups) ? mesh.groups : [];
  return Object.freeze({
    groups: groups.length,
    vertices: groups.reduce((sum, group) => sum + count(group.vertexCount), 0),
    triangles: count(mesh?.triangleCount),
  });
}

export function createViewportLightingCoordinator({
  registry,
  chunks = [],
  profile = undefined,
  renderer,
  lightingRuntime: lightingRuntimeValue = null,
  createLighting = createLightingRuntime,
  buildMesh = buildChunkMesh,
  runLighting = (job) => job.run(),
  runMeshing = (request) => buildMesh(request),
  autoProject = true,
  disposeRenderer = true,
  onError = () => {},
} = {}) {
  if (!registry || typeof registry.get !== "function") {
    validationError("Viewport lighting requires a block registry", "viewport-lighting/registry");
  }
  if (!renderer
    || typeof renderer.installChunkMesh !== "function"
    || typeof renderer.removeChunk !== "function") {
    validationError(
      "Viewport lighting requires a prebuilt renderer boundary",
      "viewport-lighting/renderer",
    );
  }
  if (typeof createLighting !== "function"
    || typeof buildMesh !== "function"
    || typeof runLighting !== "function"
    || typeof runMeshing !== "function") {
    validationError("Viewport lighting execution boundaries must be functions", "viewport-lighting/executor");
  }
  if (typeof onError !== "function") {
    validationError("Viewport lighting onError must be a function", "viewport-lighting/callback");
  }

  const initial = normalizedChunkMap(chunks);
  const map = initial.chunks;
  let shape = initial.shape;
  const lighting = lightingRuntimeValue ?? createLighting({
    registry,
    chunks: map,
    ...(profile == null ? {} : { profile }),
  });
  if (!lighting
    || typeof lighting.plan !== "function"
    || typeof lighting.install !== "function"
    || typeof lighting.updateChunk !== "function"
    || typeof lighting.removeChunk !== "function"
    || typeof lighting.evidence !== "function") {
    validationError("Viewport lighting runtime is malformed", "viewport-lighting/runtime");
  }

  const emptyBlock = normalizeBlockValue(registry, registry.emptyBlock);
  const dirty = new Set(map.keys());
  const installed = new Set();
  let status = map.size ? "dirty" : "idle";
  let requestVersion = 0;
  let cycles = 0;
  let lightingInstalls = 0;
  let meshInstalls = 0;
  let pendingLightingJobs = 0;
  let pendingMeshJobs = 0;
  let discardedLightingResults = 0;
  let discardedMeshResults = 0;
  let failures = 0;
  let suspensionCount = 0;
  let resumeCount = 0;
  let removalCount = 0;
  let releasedResources = 0;
  let suspended = false;
  let destroyed = false;
  let scheduled = false;
  let activePromise = null;
  let destroyPromise = null;
  let lastAffectedKeys = Object.freeze([...dirty].sort());
  let lastLightEvidence = null;
  let lastMesh = Object.freeze({ groups: 0, vertices: 0, triangles: 0 });

  const report = (phase, error) => {
    failures += 1;
    try {
      onError(Object.freeze({ phase, error }));
    } catch {
      // Host diagnostics must not destabilize the projection lifecycle.
    }
  };

  const ensureActive = () => {
    if (destroyed) {
      validationError("Viewport lighting coordinator has been destroyed", "viewport-lighting/destroyed");
    }
  };

  const getBlockAtWorld = (world) => {
    if (shape == null) return emptyBlock;
    const location = worldToChunk(world, shape);
    const chunk = map.get(chunkKey(location.chunk));
    return chunk ? getBlock(chunk, location.local) : emptyBlock;
  };

  const evidence = () => {
    const lightingEvidence = lightingCounts(lighting);
    const render = rendererCounts(renderer);
    const dirtyKeys = sortedKeys(dirty, map);
    const installedKeys = sortedKeys(installed, map);
    const baseline = destroyed
      && map.size === 0
      && dirty.size === 0
      && installed.size === 0
      && pendingLightingJobs === 0
      && pendingMeshJobs === 0
      && lightingEvidence.baseline
      && render.chunks === 0
      && render.meshResources === 0
      && render.materialResources === 0;
    return Object.freeze({
      format: VIEWPORT_LIGHTING_EVIDENCE_FORMAT,
      status,
      profileId: lightingEvidence.profileId,
      suspended,
      requestVersion,
      cycles,
      lightingInstalls,
      meshInstalls,
      pendingLightingJobs,
      pendingMeshJobs,
      discardedLightingResults,
      discardedMeshResults,
      failures,
      suspensionCount,
      resumeCount,
      removalCount,
      releasedResources,
      loadedChunks: map.size,
      dirtyChunks: dirtyKeys.length,
      installedChunks: installedKeys.length,
      dirtyKeys,
      installedKeys,
      lastAffectedKeys,
      maximumSunlight: count(lastLightEvidence?.maxSunlight),
      maximumEmitted: count(lastLightEvidence?.maxEmitted),
      maximumCombined: Math.max(
        count(lastLightEvidence?.maxSunlight),
        count(lastLightEvidence?.maxEmitted),
      ),
      lastMesh,
      lighting: lightingEvidence,
      renderer: render,
      baseline,
    });
  };

  const schedule = () => {
    if (!autoProject || scheduled || destroyed || suspended || dirty.size === 0) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      start().catch((error) => report("scheduled-projection", error));
    });
  };

  const markChanged = (affected) => {
    addKeys(dirty, affected);
    lastAffectedKeys = Object.freeze([...(affected ?? [])].map(String).sort());
    requestVersion += 1;
    status = map.size ? "dirty" : "idle";
    schedule();
  };

  const currentFor = (key, revision) => {
    const chunk = map.get(key);
    return chunk && chunk.revision === revision ? chunk : null;
  };

  const runCycle = async () => {
    if (destroyed || suspended || dirty.size === 0) return false;
    const cycleVersion = requestVersion;
    const job = lighting.plan();
    cycles += 1;
    status = "lighting";

    let result;
    pendingLightingJobs += 1;
    try {
      result = await runLighting(job);
    } catch (error) {
      if (!destroyed) status = "error";
      report("lighting", error);
      return false;
    } finally {
      pendingLightingJobs -= 1;
    }

    if (destroyed || suspended || cycleVersion !== requestVersion) {
      discardedLightingResults += 1;
      return false;
    }

    const installation = lighting.install(result);
    if (!installation.installed) {
      discardedLightingResults += 1;
      status = map.size ? "dirty" : "idle";
      return false;
    }
    lightingInstalls += 1;
    lastLightEvidence = result.evidence();

    const targetKeys = sortedKeys(dirty, map);
    status = "meshing";
    let outputs;
    pendingMeshJobs += targetKeys.length;
    try {
      outputs = await Promise.all(targetKeys.map(async (key) => {
        const chunk = map.get(key);
        const lightSnapshots = snapshotsForChunk(chunk, result);
        const request = Object.freeze({
          chunk,
          registry,
          getBlockAtWorld,
          lightSnapshots,
          lighting: result.evidence(),
        });
        const mesh = await runMeshing(request);
        return Object.freeze({
          key,
          revision: chunk.revision,
          generation: result.generation,
          epoch: result.epoch,
          mesh,
        });
      }));
    } catch (error) {
      if (!destroyed) status = "error";
      report("meshing", error);
      return false;
    } finally {
      pendingMeshJobs -= targetKeys.length;
    }

    if (destroyed || suspended || cycleVersion !== requestVersion) {
      discardedMeshResults += outputs.length;
      return false;
    }

    let groups = 0;
    let vertices = 0;
    let triangles = 0;
    try {
      for (const output of outputs.sort((left, right) => {
        const leftChunk = map.get(left.key);
        const rightChunk = map.get(right.key);
        return leftChunk && rightChunk ? compareCoord(leftChunk, rightChunk) : left.key.localeCompare(right.key);
      })) {
        const chunk = currentFor(output.key, output.revision);
        const field = lighting.getField(output.key);
        if (!chunk
          || !field
          || field.sourceRevision !== output.revision
          || field.generation !== output.generation) {
          discardedMeshResults += 1;
          continue;
        }
        const receipt = renderer.installChunkMesh({ chunk, mesh: output.mesh });
        if (isThenable(receipt)) {
          validationError(
            "Viewport lit-mesh installation must be synchronous",
            "viewport-lighting/async-install",
          );
        }
        installed.add(output.key);
        dirty.delete(output.key);
        meshInstalls += 1;
        const counts = meshCounts(output.mesh);
        groups += counts.groups;
        vertices += counts.vertices;
        triangles += counts.triangles;
      }
    } catch (error) {
      if (!destroyed) status = "error";
      report("renderer-install", error);
      return false;
    }
    lastMesh = Object.freeze({ groups, vertices, triangles });
    status = dirty.size ? "dirty" : map.size ? "ready" : "idle";
    return true;
  };

  const start = () => {
    ensureActive();
    if (suspended || dirty.size === 0) return Promise.resolve(evidence());
    if (activePromise) return activePromise;
    activePromise = (async () => {
      while (!destroyed && !suspended && dirty.size > 0) {
        const version = requestVersion;
        const failuresBefore = failures;
        await runCycle();
        if (destroyed || suspended) break;
        if (status === "error" && version === requestVersion && failures > failuresBefore) break;
      }
      return evidence();
    })().finally(() => {
      activePromise = null;
      schedule();
    });
    return activePromise;
  };

  const api = {
    format: VIEWPORT_LIGHTING_COORDINATOR_FORMAT,
    profile: lighting.profile,
    evidence,
    chunks() { return new Map(map); },
    getBlock: getBlockAtWorld,
    getField(coordOrKey) {
      ensureActive();
      return lighting.getField(coordOrKey);
    },
    updateChunk(value) {
      ensureActive();
      const chunk = canonicalChunk(value, shape);
      shape ??= Object.freeze([...chunk.shape]);
      const previous = map.get(chunk.key);
      if (previous && chunk.revision === previous.revision) {
        if (previous === chunk) {
          return Object.freeze({
            format: "alumbra.lighting-invalidation/1",
            epoch: lighting.evidence().epoch,
            changed: Object.freeze([]),
            affected: Object.freeze([]),
          });
        }
        validationError(
          `Cannot replace ${chunk.key}@${chunk.revision} without advancing its revision`,
          "viewport-lighting/revision-collision",
        );
      }
      if (previous && chunk.revision < previous.revision) {
        validationError(
          `Cannot replace ${chunk.key}@${previous.revision} with stale revision ${chunk.revision}`,
          "viewport-lighting/stale-chunk",
        );
      }
      if (!previous && map.size >= MAX_COORDINATED_CHUNKS) {
        validationError("Viewport lighting chunk limit exceeded", "viewport-lighting/chunk-limit");
      }
      map.set(chunk.key, chunk);
      const invalidation = lighting.updateChunk(chunk);
      markChanged(invalidation.affected);
      return invalidation;
    },
    setChunks(values) {
      ensureActive();
      const next = normalizedChunkMap(values);
      if (shape && next.shape && !sameVector(shape, next.shape)) {
        validationError("Viewport lighting replacement set changed chunk shape", "viewport-lighting/chunk-shape");
      }
      shape ??= next.shape;
      const affected = new Set();
      for (const key of [...map.keys()].sort()) {
        if (next.chunks.has(key)) continue;
        map.delete(key);
        installed.delete(key);
        dirty.delete(key);
        const removal = renderer.removeChunk(key);
        if (isThenable(removal)) {
          validationError("Viewport lit-mesh removal must be synchronous", "viewport-lighting/async-removal");
        }
        releasedResources += releasedCount(removal);
        removalCount += 1;
        addKeys(affected, lighting.removeChunk(key).affected);
      }
      for (const chunk of [...next.chunks.values()].sort(compareCoord)) {
        const previous = map.get(chunk.key);
        if (previous === chunk) continue;
        if (previous && chunk.revision === previous.revision) {
          validationError(
            `Viewport lighting replacement collides at ${chunk.key}@${chunk.revision}`,
            "viewport-lighting/revision-collision",
          );
        }
        if (previous && chunk.revision < previous.revision) {
          validationError(`Viewport lighting replacement contains stale ${chunk.key}`, "viewport-lighting/stale-chunk");
        }
        map.set(chunk.key, chunk);
        addKeys(affected, lighting.updateChunk(chunk).affected);
      }
      if (affected.size) markChanged(affected);
      return evidence();
    },
    removeChunk(coordOrKey) {
      ensureActive();
      const key = keyFor(coordOrKey);
      if (!map.has(key)) return Object.freeze({ removed: false, affected: Object.freeze([]) });
      map.delete(key);
      dirty.delete(key);
      installed.delete(key);
      const removal = renderer.removeChunk(key);
      if (isThenable(removal)) {
        validationError("Viewport lit-mesh removal must be synchronous", "viewport-lighting/async-removal");
      }
      releasedResources += releasedCount(removal);
      const invalidation = lighting.removeChunk(key);
      removalCount += 1;
      markChanged(invalidation.affected);
      return Object.freeze({
        removed: removal?.removed !== false,
        affected: invalidation.affected,
      });
    },
    invalidate(values) {
      ensureActive();
      const invalidation = lighting.invalidate(values);
      markChanged(invalidation.affected);
      return invalidation;
    },
    project: start,
    drain() {
      ensureActive();
      return activePromise ?? start();
    },
    suspend(reason = "manual") {
      ensureActive();
      if (suspended) return false;
      suspended = true;
      suspensionCount += 1;
      requestVersion += 1;
      status = "suspended";
      return Object.freeze({ suspended: true, reason: String(reason) });
    },
    resume(reason = "manual") {
      ensureActive();
      if (!suspended) return false;
      suspended = false;
      resumeCount += 1;
      requestVersion += 1;
      status = dirty.size ? "dirty" : map.size ? "ready" : "idle";
      schedule();
      return Object.freeze({ resumed: true, reason: String(reason) });
    },
    destroy() {
      if (destroyPromise) return destroyPromise;
      destroyed = true;
      suspended = true;
      requestVersion += 1;
      status = "disposed";
      const pending = activePromise;
      destroyPromise = (async () => {
        if (pending) Promise.resolve(pending).catch(() => {});
        map.clear();
        dirty.clear();
        installed.clear();
        lighting.destroy();
        if (disposeRenderer) {
          const result = renderer.destroy?.();
          if (isThenable(result)) await result;
        }
        status = "disposed";
        return evidence();
      })();
      return destroyPromise;
    },
  };

  schedule();
  return Object.freeze(api);
}

export function createViewportLitRenderer({
  registry,
  chunks = [],
  renderer,
  ...options
} = {}) {
  const coordinator = createViewportLightingCoordinator({
    registry,
    chunks,
    renderer,
    ...options,
  });
  let selection = null;
  return Object.freeze({
    format: VIEWPORT_LIT_RENDERER_FORMAT,
    coordinator,
    setChunk(chunk) { return coordinator.updateChunk(chunk); },
    removeChunk(coordOrKey) { return coordinator.removeChunk(coordOrKey); },
    getBlock: coordinator.getBlock,
    getField(coordOrKey) { return coordinator.getField(coordOrKey); },
    setSelection(value) { selection = value ?? null; },
    get selection() { return selection; },
    setView() {
      const evidence = coordinator.evidence();
      return Object.freeze({ visible: evidence.loadedChunks, total: evidence.loadedChunks });
    },
    project: coordinator.project,
    drain: coordinator.drain,
    suspend: coordinator.suspend,
    resume: coordinator.resume,
    lightingEvidence: coordinator.evidence,
    stats() {
      const render = renderer.stats?.() ?? {};
      return Object.freeze({
        ...render,
        lighting: coordinator.evidence(),
      });
    },
    destroy: coordinator.destroy,
  });
}
