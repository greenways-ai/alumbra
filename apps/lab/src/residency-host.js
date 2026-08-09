import { patchChunk } from "@greenways/alumbra-core";
import {
  buildChunkMesh,
  createChunkResidencyScheduler,
  createPlayCanvasPrebuiltMeshRenderer,
} from "@greenways/alumbra-renderer-playcanvas";
import {
  LAB_CHUNK_SHAPE,
  generateLabChunk,
} from "./block-pack.js";

export const CHUNK_RESIDENCY_ACTIVITY = "alumbra-renderer-playcanvas/chunk-residency";
export const STALE_MESH_ACTIVITY = "alumbra-renderer-playcanvas/stale-mesh-rejection";
export const RESIDENCY_STORY_FORMAT = "alumbra.residency-story/1";

const RESIDENCY_ACTIVITIES = new Set([
  CHUNK_RESIDENCY_ACTIVITY,
  STALE_MESH_ACTIVITY,
]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const sleep = (milliseconds, signal = null) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    const error = new Error("Residency job was aborted");
    error.name = "AbortError";
    reject(error);
    return;
  }
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    const error = new Error("Residency job was aborted");
    error.name = "AbortError";
    reject(error);
  }, { once: true });
});

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`${label} did not become ready`);
}

function rendererEvidence(renderer) {
  const stats = renderer.stats();
  return deepFreeze({
    chunks: stats.chunks,
    quads: stats.quads,
    triangles: stats.triangles,
    meshResources: stats.meshPool.resources,
    meshReferences: stats.meshPool.references,
    materialResources: stats.materialPool.resources,
    materialReferences: stats.materialPool.references,
  });
}

function rendererAtBaseline(renderer) {
  const evidence = rendererEvidence(renderer);
  return evidence.chunks === 0
    && evidence.meshResources === 0
    && evidence.meshReferences === 0
    && evidence.materialResources === 0
    && evidence.materialReferences === 0;
}

function createApplication(pc, canvas) {
  if (!pc || typeof pc.Application !== "function" || typeof pc.Entity !== "function") {
    throw new TypeError("Residency story host requires the PlayCanvas Application and Entity APIs");
  }
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    },
  });
  app.setCanvasFillMode?.(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution?.(pc.RESOLUTION_AUTO);
  if (app.scene && pc.Color) app.scene.ambientLight = new pc.Color(0.34, 0.38, 0.46);
  app.start?.();
  if ("autoRender" in app) app.autoRender = false;
  return app;
}

function createScene({ pc, app, registry }) {
  const root = new pc.Entity("Alumbra residency root");
  app.root.addChild(root);
  const renderer = createPlayCanvasPrebuiltMeshRenderer({
    pc,
    app,
    registry,
    root,
  });

  const camera = new pc.Entity("Alumbra residency camera");
  camera.addComponent?.("camera", {
    clearColor: pc.Color ? new pc.Color(0.36, 0.53, 0.68) : [0.36, 0.53, 0.68],
    fov: 64,
    nearClip: 0.05,
    farClip: 320,
  });
  app.root.addChild(camera);

  const sun = new pc.Entity("Alumbra residency sun");
  sun.addComponent?.("light", {
    type: "directional",
    color: pc.Color ? new pc.Color(1, 0.91, 0.73) : [1, 0.91, 0.73],
    intensity: 1.45,
    castShadows: true,
    shadowDistance: 110,
  });
  sun.setLocalEulerAngles?.(48, 28, 0);
  app.root.addChild(sun);

  return { app, root, renderer, camera, sun };
}

function frameScene(scene, targetX = 24, targetZ = 8) {
  scene.camera.setLocalPosition?.(targetX + 24, 26, targetZ + 26);
  if (typeof scene.camera.lookAt === "function") scene.camera.lookAt(targetX, 4, targetZ);
  else scene.camera.setLocalEulerAngles?.(-24, 42, 0);
  scene.app.resizeCanvas?.();
  if ("renderNextFrame" in scene.app) scene.app.renderNextFrame = true;
}

function centerPosition([chunkX, chunkZ]) {
  return Object.freeze([
    chunkX * LAB_CHUNK_SHAPE[0] + LAB_CHUNK_SHAPE[0] / 2,
    12,
    chunkZ * LAB_CHUNK_SHAPE[2] + LAB_CHUNK_SHAPE[2] / 2,
  ]);
}

const centerKey = ([chunkX, chunkZ]) => `${chunkX},0,${chunkZ}`;

function crossBoundaryScenario({ scene, from, to, initial, current, moves }) {
  const position = centerPosition(to);
  frameScene(scene, position[0], position[2]);
  return deepFreeze({
    kind: "cross-boundary",
    transition: {
      from: centerKey(from),
      to: centerKey(to),
    },
    viewpoint: {
      chunk: [to[0], 0, to[1]],
      position,
      moves,
      controls: ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"],
    },
    initial,
    current,
    renderer: rendererEvidence(scene.renderer),
    crossed: current.meshInstalls > initial.meshInstalls
      && current.evictedResources > initial.evictedResources
      && current.residentChunks === current.desiredChunks,
  });
}

function createScheduler({
  registry,
  scene,
  buildMesh,
  generationConcurrency = 2,
  meshConcurrency = 2,
}) {
  return createChunkResidencyScheduler({
    generationConcurrency,
    meshConcurrency,
    generateChunk: async ({ coord, signal }) => {
      await sleep(4, signal);
      return generateLabChunk(registry, coord);
    },
    buildMesh,
    installMesh: ({ chunk, mesh }) => scene.renderer.installChunkMesh({ chunk, mesh }),
    evictChunk: ({ key }) => scene.renderer.removeChunk(key),
  });
}

async function disposeRuntime(runtime) {
  if (!runtime) return deepFreeze({
    scheduler: null,
    renderer: null,
    baseline: true,
  });
  const scheduler = await runtime.scheduler.destroy();
  runtime.scene.renderer.destroy();
  const renderer = rendererEvidence(runtime.scene.renderer);
  runtime.scene.camera.destroy?.();
  runtime.scene.sun.destroy?.();
  runtime.scene.root.destroy?.();
  return deepFreeze({
    scheduler,
    renderer,
    baseline: scheduler.status === "disposed"
      && scheduler.residentChunks === 0
      && rendererAtBaseline(runtime.scene.renderer),
  });
}

export function createResidencyStoryHost({
  pc,
  canvas,
  registry,
} = {}) {
  if (!canvas?.addEventListener || !registry) {
    throw new TypeError("Residency story host requires a canvas and block registry");
  }
  const app = createApplication(pc, canvas);

  let runtime = null;
  let activeActivity = null;
  let status = "idle";
  let scenario = null;
  let operation = Promise.resolve();
  let destroyed = false;
  let probeComplete = false;
  let disposalCount = 0;
  let disposalBaseline = false;

  const ensureActive = () => {
    if (destroyed) throw new Error("Residency story host has been destroyed");
  };

  const snapshot = () => deepFreeze({
    format: RESIDENCY_STORY_FORMAT,
    hostReady: true,
    activeActivity,
    status,
    scenario,
    disposal: {
      count: disposalCount,
      baseline: disposalBaseline,
    },
  });

  const disposeCurrent = async () => {
    if (!runtime) return;
    const result = await disposeRuntime(runtime);
    runtime = null;
    disposalCount += 1;
    disposalBaseline = result.baseline;
  };

  const runProbe = async () => {
    if (probeComplete) return;
    const scene = createScene({ pc, app, registry });
    const scheduler = createScheduler({
      registry,
      scene,
      buildMesh: async ({ chunk, signal }) => {
        await sleep(2, signal);
        return buildChunkMesh({ chunk, registry });
      },
      generationConcurrency: 1,
      meshConcurrency: 1,
    });
    scheduler.setDesired([[0, 0, 0]]);
    await scheduler.drain();
    const result = await disposeRuntime({ scene, scheduler });
    disposalCount += 1;
    disposalBaseline = result.baseline;
    probeComplete = true;
    if (!disposalBaseline) {
      throw new Error("Residency renderer disposal probe did not return resources to baseline");
    }
  };

  const runCrossBoundary = async () => {
    const scene = createScene({ pc, app, registry });
    const scheduler = createScheduler({
      registry,
      scene,
      buildMesh: async ({ chunk, signal }) => {
        await sleep(8, signal);
        return buildChunkMesh({ chunk, registry });
      },
    });
    const from = [0, 0];
    const to = [1, 0];
    runtime = { scene, scheduler, kind: "cross-boundary", center: from, moves: 0 };

    scheduler.setView({
      position: centerPosition(from),
      shape: LAB_CHUNK_SHAPE,
      horizontalDistance: 1,
      verticalDistance: 0,
    });
    const initial = await scheduler.drain();

    scheduler.setView({
      position: centerPosition(to),
      shape: LAB_CHUNK_SHAPE,
      horizontalDistance: 1,
      verticalDistance: 0,
    });
    const current = await scheduler.drain();
    runtime.center = to;
    runtime.moves = 1;

    return crossBoundaryScenario({
      scene,
      from,
      to,
      initial,
      current,
      moves: runtime.moves,
    });
  };

  const runStaleMesh = async () => {
    const scene = createScene({ pc, app, registry });
    const scheduler = createScheduler({
      registry,
      scene,
      buildMesh: async ({ chunk, signal }) => {
        await sleep(chunk.revision === 1 ? 80 : 5, signal);
        return buildChunkMesh({ chunk, registry });
      },
      generationConcurrency: 1,
      meshConcurrency: 2,
    });
    runtime = { scene, scheduler };

    scheduler.setDesired([[0, 0, 0]]);
    await waitFor(
      () => scheduler.evidence().runningMeshes === 1,
      "Initial stale-mesh job",
    );
    const initial = scheduler.evidence();
    const base = generateLabChunk(registry, [0, 0, 0]);
    const revised = patchChunk(base, [{
      local: [2, 12, 2],
      value: "alumbra/ember-brick",
    }], registry, { revision: 2 });
    scheduler.updateChunk(revised);
    const current = await scheduler.drain();
    frameScene(scene, 8);
    const installed = scene.renderer.getChunk([0, 0, 0]);

    return deepFreeze({
      kind: "stale-mesh-rejection",
      initial,
      current,
      renderer: rendererEvidence(scene.renderer),
      installedRevision: installed?.revision ?? null,
      rejected: current.meshInstalls === 1
        && current.discardedStaleJobs === 1
        && installed?.revision === 2,
    });
  };

  const enqueue = (task) => {
    operation = operation.then(task, task);
    return operation;
  };

  return Object.freeze({
    snapshot,
    open(activityId) {
      return enqueue(async () => {
        ensureActive();
        const id = String(activityId);
        if (!RESIDENCY_ACTIVITIES.has(id)) {
          throw new Error(`Unsupported residency activity: ${id}`);
        }
        if (activeActivity === id && status === "ready") return snapshot();
        status = "opening";
        scenario = null;
        await disposeCurrent();
        await runProbe();
        activeActivity = id;
        canvas.hidden = false;
        if ("autoRender" in app) app.autoRender = true;
        scenario = id === CHUNK_RESIDENCY_ACTIVITY
          ? await runCrossBoundary()
          : await runStaleMesh();
        status = "ready";
        return snapshot();
      });
    },
    moveView(delta = [0, 0]) {
      return enqueue(async () => {
        ensureActive();
        if (activeActivity !== CHUNK_RESIDENCY_ACTIVITY || runtime?.kind !== "cross-boundary") {
          throw new Error("Residency viewpoint movement requires the active chunk-residency story");
        }
        if (
          !Array.isArray(delta)
          || delta.length !== 2
          || delta.some((entry) => !Number.isSafeInteger(entry) || entry < -1 || entry > 1)
          || (delta[0] === 0 && delta[1] === 0)
        ) {
          throw new TypeError("Residency viewpoint delta must contain one bounded horizontal chunk step");
        }
        const from = [...runtime.center];
        const to = [from[0] + delta[0], from[1] + delta[1]];
        const initial = runtime.scheduler.evidence();
        status = "moving";
        try {
          runtime.scheduler.setView({
            position: centerPosition(to),
            shape: LAB_CHUNK_SHAPE,
            horizontalDistance: 1,
            verticalDistance: 0,
          });
          const current = await runtime.scheduler.drain();
          runtime.center = to;
          runtime.moves += 1;
          scenario = crossBoundaryScenario({
            scene: runtime.scene,
            from,
            to,
            initial,
            current,
            moves: runtime.moves,
          });
          status = "ready";
          return snapshot();
        } catch (error) {
          status = "failed";
          throw error;
        }
      });
    },
    close(reason = "closed") {
      return enqueue(async () => {
        if (destroyed) return snapshot();
        status = String(reason);
        await disposeCurrent();
        activeActivity = null;
        scenario = null;
        canvas.hidden = true;
        if ("autoRender" in app) app.autoRender = false;
        status = "idle";
        return snapshot();
      });
    },
    suspend(reason = "document-hidden") {
      if (!runtime || status !== "ready") return false;
      runtime.scene.root.enabled = false;
      runtime.scene.camera.enabled = false;
      runtime.scene.sun.enabled = false;
      if ("autoRender" in runtime.scene.app) runtime.scene.app.autoRender = false;
      status = String(reason);
      return true;
    },
    resume(reason = "resumed") {
      if (!runtime || activeActivity == null) return false;
      runtime.scene.root.enabled = true;
      runtime.scene.camera.enabled = true;
      runtime.scene.sun.enabled = true;
      if ("autoRender" in runtime.scene.app) runtime.scene.app.autoRender = true;
      runtime.scene.app.resizeCanvas?.();
      if ("renderNextFrame" in runtime.scene.app) runtime.scene.app.renderNextFrame = true;
      status = "ready";
      void reason;
      return true;
    },
    resize() {
      runtime?.scene.app.resizeCanvas?.();
    },
    destroy() {
      return enqueue(async () => {
        if (destroyed) return snapshot();
        await disposeCurrent();
        destroyed = true;
        activeActivity = null;
        scenario = null;
        canvas.hidden = true;
        if ("autoRender" in app) app.autoRender = false;
        app.destroy?.();
        status = "destroyed";
        return snapshot();
      });
    },
  });
}
