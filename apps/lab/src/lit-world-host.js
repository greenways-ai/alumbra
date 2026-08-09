import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import {
  buildVoxelLightFields,
  createPlayerRuntime,
  createWorldRuntime,
} from "@greenways/alumbra-engine";
import {
  MESH_LIGHT_SNAPSHOT_FORMAT,
  buildChunkMesh,
  createChunkWorldAccessor,
  createPlayCanvasPrebuiltMeshRenderer,
} from "@greenways/alumbra-renderer-playcanvas";
import {
  createLitPlayCanvasViewportSession,
} from "@greenways/alumbra-viewport-playcanvas";

export const LIT_WORLD_ACTIVITY = "alumbra-viewport-playcanvas/lit-world";
export const LIT_WORLD_STORY_FORMAT = "alumbra.lit-world-story/1";
export const LIT_WORLD_ID = "world:alumbra/lit-cave";
export const LIT_WORLD_SHAPE = Object.freeze([16, 8, 8]);
export const LIT_WORLD_PLAYER_BODY = Object.freeze({
  radius: 0.34,
  height: 1.8,
  eyeHeight: 1.62,
});
export const LIT_WORLD_PLAYER = Object.freeze({
  position: Object.freeze([5.5, 2.05, 4.5]),
  velocity: Object.freeze([0, 0, 0]),
  yaw: 90,
  pitch: -8,
  grounded: false,
});

const LIT_BLOCK_IDS = Object.freeze([
  "lit/stone",
  "lit/glass",
  "lit/lamp",
]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fixtureUpdates = (coord) => {
  const updates = [];
  const [sizeX, sizeY, sizeZ] = LIT_WORLD_SHAPE;
  for (let z = 0; z < sizeZ; z += 1) {
    for (let x = 0; x < sizeX; x += 1) {
      updates.push({ local: [x, 0, z], value: "lit/stone" });
      if (!((x === 7 || x === 8) && (z === 3 || z === 4))) {
        updates.push({ local: [x, sizeY - 1, z], value: "lit/stone" });
      }
    }
  }
  for (let y = 1; y < sizeY - 1; y += 1) {
    for (let x = 0; x < sizeX; x += 1) {
      updates.push({ local: [x, y, 0], value: "lit/stone" });
      updates.push({ local: [x, y, sizeZ - 1], value: "lit/stone" });
    }
    const outerX = coord[0] < 0 ? 0 : sizeX - 1;
    for (let z = 1; z < sizeZ - 1; z += 1) {
      updates.push({ local: [outerX, y, z], value: "lit/stone" });
    }
  }
  for (let y = 1; y <= 3; y += 1) {
    updates.push({ local: [6, y, 2], value: "lit/stone" });
    updates.push({ local: [9, y, 5], value: "lit/stone" });
  }
  if (coord[0] < 0) {
    updates.push({ local: [15, 2, 4], value: "lit/lamp" });
    updates.push({ local: [13, 1, 2], value: "lit/glass" });
    updates.push({ local: [13, 2, 2], value: "lit/glass" });
  } else {
    updates.push({ local: [2, 1, 5], value: "lit/glass" });
    updates.push({ local: [2, 2, 5], value: "lit/glass" });
  }
  return updates;
};

export function createLitWorldRegistry() {
  return createBlockRegistry([
    {
      id: "lit/air",
      empty: true,
      metadata: {
        label: "Air",
        physics: { solid: false, replaceable: true },
        render: { visible: false, opaque: false },
        light: { opacity: 0, emission: 0 },
      },
    },
    {
      id: "lit/stone",
      metadata: {
        label: "Cave stone",
        physics: { solid: true, breakable: true, replaceable: false },
        render: {
          color: [0.18, 0.22, 0.28],
          gloss: 0.16,
          opaque: true,
        },
        light: { opacity: 15, emission: 0 },
      },
    },
    {
      id: "lit/glass",
      metadata: {
        label: "Cave glass",
        physics: { solid: true, breakable: true, replaceable: false },
        render: {
          color: [0.38, 0.66, 0.72, 0.42],
          gloss: 0.72,
          opaque: false,
          opacity: 0.42,
        },
        light: { opacity: 1, emission: 0 },
      },
    },
    {
      id: "lit/lamp",
      metadata: {
        label: "Boundary lamp",
        physics: { solid: true, breakable: true, replaceable: false },
        render: {
          profile: "alumbra/material-emissive",
          color: [0.78, 0.28, 0.08],
          emissive: [1, 0.22, 0.04],
          gloss: 0.32,
          opaque: true,
        },
        light: { opacity: 15, emission: 15 },
      },
    },
  ], {
    id: "alumbra/lit-world-blocks",
    version: "0.1.0",
  });
}

export function createLitWorldChunks(registry) {
  return Object.freeze([-1, 0].map((x) => {
    const chunk = createChunk({
      registry,
      coord: [x, 0, 0],
      shape: LIT_WORLD_SHAPE,
      fill: "lit/air",
    });
    return patchChunk(chunk, fixtureUpdates(chunk.coord), registry, { revision: 1 });
  }));
}

const snapshotFromField = (field, fields) => Object.freeze({
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId: fields.profile.id,
  generation: fields.generation,
  epoch: fields.epoch,
  maxLevel: fields.profile.maxLevel,
  key: field.key,
  coord: field.coord,
  shape: field.shape,
  sourceRevision: field.sourceRevision,
  sunlight: field.copySunlight(),
  emitted: field.copyEmitted(),
});

export function deriveLitWorldHeadlessEvidence({
  registry = createLitWorldRegistry(),
  chunks = createLitWorldChunks(registry),
} = {}) {
  const fields = buildVoxelLightFields({ registry, chunks });
  const accessor = createChunkWorldAccessor(chunks, registry);
  const snapshots = chunks.map((chunk) => snapshotFromField(fields.getField(chunk.key), fields));
  const meshes = chunks.map((chunk) => buildChunkMesh({
    chunk,
    registry,
    getBlockAtWorld: accessor.getBlock,
    lightSnapshots: snapshots,
  }));
  const groups = meshes.flatMap((mesh) => mesh.groups);
  const vertices = groups.reduce((sum, group) => sum + group.vertexCount, 0);
  const aligned = groups.length > 0 && groups.every((group) =>
    group.sunlight instanceof Uint8Array
    && group.emitted instanceof Uint8Array
    && group.sunlight.length === group.vertexCount
    && group.emitted.length === group.vertexCount);
  const boundaryEmission = fields.getField([0, 0, 0]).emittedAt([0, 2, 4]);
  return deepFreeze({
    worldId: LIT_WORLD_ID,
    chunkKeys: chunks.map((chunk) => chunk.key),
    negativeToZero: chunks[0].key === "-1,0,0" && chunks[1].key === "0,0,0",
    boundaryEmission,
    maximumSunlight: fields.evidence().maxSunlight,
    maximumEmitted: fields.evidence().maxEmitted,
    meshGroups: groups.length,
    vertices,
    alignedVertexChannels: aligned,
  });
}

function createApplication(pc, canvas) {
  if (!pc || typeof pc.Application !== "function" || typeof pc.Entity !== "function") {
    throw new TypeError("Lit-world host requires the PlayCanvas Application and Entity APIs");
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
  if (app.scene && pc.Color) app.scene.ambientLight = new pc.Color(0.08, 0.09, 0.12);
  app.start?.();
  if ("autoRender" in app) app.autoRender = false;
  return app;
}

function materialSummary(prebuilt) {
  const evidence = prebuilt?.materialEvidence?.() ?? {};
  const lighting = evidence.lighting ?? null;
  return deepFreeze({
    format: String(evidence.format ?? "alumbra.material-render-evidence/1"),
    materialGroupCount: Number(evidence.materialGroupCount ?? 0),
    profileCount: Number(evidence.profileCount ?? 0),
    materialResources: Number(evidence.materialResources ?? 0),
    materialReferences: Number(evidence.materialReferences ?? 0),
    lighting: lighting == null ? null : {
      format: String(lighting.format),
      litGroupCount: Number(lighting.litGroupCount ?? 0),
      profileIds: [...(lighting.profileIds ?? [])],
      colorProfileIds: [...(lighting.colorProfileIds ?? [])],
      vertices: Number(lighting.vertices ?? 0),
      sunlightVertices: Number(lighting.sunlightVertices ?? 0),
      emittedVertices: Number(lighting.emittedVertices ?? 0),
      minimumByte: Number(lighting.minimumByte ?? 0),
      maximumByte: Number(lighting.maximumByte ?? 0),
    },
  });
}

function lightingSummary(value) {
  return deepFreeze({
    format: String(value?.format ?? "alumbra.viewport-lighting-evidence/1"),
    status: String(value?.status ?? "idle"),
    profileId: String(value?.profileId ?? ""),
    suspended: value?.suspended === true,
    loadedChunks: Number(value?.loadedChunks ?? 0),
    dirtyChunks: Number(value?.dirtyChunks ?? 0),
    installedChunks: Number(value?.installedChunks ?? 0),
    meshInstalls: Number(value?.meshInstalls ?? 0),
    maximumSunlight: Number(value?.maximumSunlight ?? 0),
    maximumEmitted: Number(value?.maximumEmitted ?? 0),
    maximumCombined: Number(value?.maximumCombined ?? 0),
    suspensionCount: Number(value?.suspensionCount ?? 0),
    resumeCount: Number(value?.resumeCount ?? 0),
    discardedLightingResults: Number(value?.discardedLightingResults ?? 0),
    discardedMeshResults: Number(value?.discardedMeshResults ?? 0),
    lastMesh: {
      groups: Number(value?.lastMesh?.groups ?? 0),
      vertices: Number(value?.lastMesh?.vertices ?? 0),
      triangles: Number(value?.lastMesh?.triangles ?? 0),
    },
    renderer: {
      chunks: Number(value?.renderer?.chunks ?? 0),
      quads: Number(value?.renderer?.quads ?? 0),
      triangles: Number(value?.renderer?.triangles ?? 0),
      meshResources: Number(value?.renderer?.meshResources ?? 0),
      materialResources: Number(value?.renderer?.materialResources ?? 0),
    },
    baseline: value?.baseline === true,
  });
}

function sessionSummary(value) {
  return deepFreeze({
    sessionId: String(value?.sessionId ?? ""),
    status: String(value?.status ?? "unknown"),
    reason: String(value?.reason ?? ""),
    suspensions: Number(value?.suspensions ?? 0),
    resumes: Number(value?.resumes ?? 0),
    worldId: String(value?.worldId ?? ""),
    worldRevision: Number(value?.worldRevision ?? 0),
  });
}

function runtimeScenario(runtime) {
  const snapshot = runtime.session.snapshot();
  const lighting = lightingSummary(snapshot.lighting);
  const materials = materialSummary(runtime.prebuilt);
  const field = runtime.session.lighting.getField([0, 0, 0]);
  const boundaryEmission = field?.emittedAt?.([0, 2, 4]) ?? 0;
  const materialLighting = materials.lighting;
  const alignedVertexColors = materialLighting != null
    && materialLighting.litGroupCount > 0
    && materialLighting.vertices > 0
    && materialLighting.vertices === lighting.lastMesh.vertices;
  const session = sessionSummary(snapshot);
  return deepFreeze({
    kind: "lit-world",
    world: {
      id: LIT_WORLD_ID,
      chunks: 2,
      chunkKeys: ["-1,0,0", "0,0,0"],
      negativeToZero: true,
      lamp: {
        chunk: "-1,0,0",
        local: [15, 2, 4],
        adjacentChunk: "0,0,0",
        adjacentLocal: [0, 2, 4],
      },
    },
    session,
    lighting,
    materials,
    boundaryEmission,
    proofs: {
      ready: lighting.status === "ready"
        && lighting.loadedChunks === 2
        && lighting.installedChunks === 2,
      crossChunkEmission: boundaryEmission > 0
        && lighting.maximumEmitted > 0,
      sunlightPresent: lighting.maximumSunlight > 0,
      alignedVertexColors,
      sameCanonicalSessionAfterResume: runtime.lifecycle.sameCanonicalSessionAfterResume === true,
      boundedEvidence: true,
    },
  });
}

async function disposeRuntime(runtime) {
  if (!runtime) return deepFreeze({
    lighting: null,
    materials: null,
    baseline: true,
  });
  const lightingValue = await runtime.session.destroy();
  const lighting = lightingSummary(lightingValue);
  const materials = materialSummary(runtime.prebuilt);
  return deepFreeze({
    lighting,
    materials,
    baseline: lighting.baseline === true
      && materials.materialGroupCount === 0
      && materials.materialResources === 0,
  });
}

export function createLitWorldStoryHost({
  pc,
  canvas,
  createSession = createLitPlayCanvasViewportSession,
  createPrebuiltRenderer = createPlayCanvasPrebuiltMeshRenderer,
  application = null,
} = {}) {
  if (!canvas?.addEventListener) {
    throw new TypeError("Lit-world host requires a canvas-like event target");
  }
  if (typeof createSession !== "function" || typeof createPrebuiltRenderer !== "function") {
    throw new TypeError("Lit-world host factories must be functions");
  }
  const app = application ?? createApplication(pc, canvas);
  const ownsApplication = application == null;
  let runtime = null;
  let activeActivity = null;
  let status = "idle";
  let scenario = null;
  let operation = Promise.resolve();
  let destroyed = false;
  let probeComplete = false;
  let disposalCount = 0;
  let disposalBaseline = false;
  let openCount = 0;
  let suspensionCount = 0;
  let resumeCount = 0;

  const snapshot = () => deepFreeze({
    format: LIT_WORLD_STORY_FORMAT,
    hostReady: true,
    activeActivity,
    status,
    scenario,
    lifecycle: {
      opens: openCount,
      suspensions: suspensionCount,
      resumes: resumeCount,
    },
    disposal: {
      count: disposalCount,
      baseline: disposalBaseline,
    },
  });

  const createRuntime = async (suffix) => {
    const registry = createLitWorldRegistry();
    const chunks = createLitWorldChunks(registry);
    const world = createWorldRuntime({
      registry,
      chunks,
      missingChunkPolicy: "empty",
      worldId: LIT_WORLD_ID,
    });
    const player = createPlayerRuntime({
      state: LIT_WORLD_PLAYER,
      fixedStep: { tick: 1 / 60, maxFrame: 0.2, maxSteps: 10 },
      config: { body: LIT_WORLD_PLAYER_BODY },
      getBlock: world.getBlock,
      isSolid: world.isSolidBlock,
      missingSolid: false,
    });
    let prebuilt = null;
    const session = createSession({
      sessionId: `lit-world/${suffix}`,
      pc,
      canvas,
      application: app,
      world,
      player,
      blockIds: LIT_BLOCK_IDS,
      playerBody: LIT_WORLD_PLAYER_BODY,
      view: { horizontalDistance: 2, verticalDistance: 0 },
      cameraOptions: {
        clearColor: [0.035, 0.045, 0.065],
        ambientLight: [0.08, 0.09, 0.12],
        fov: 66,
        nearClip: 0.05,
        farClip: 120,
      },
      lightOptions: {
        color: [0.38, 0.42, 0.52],
        intensity: 0.22,
        castShadows: true,
        shadowDistance: 60,
        euler: [55, 35, 0],
      },
      inputOptions: { requirePointerLock: false },
      autoResize: false,
      startApplication: false,
      initialSuspended: true,
      manageApplicationRendering: false,
      createPrebuiltRenderer(options) {
        prebuilt = createPrebuiltRenderer(options);
        return prebuilt;
      },
      onError(event) {
        console.error(`Lit-world viewport ${event.phase} failed`, event.error);
      },
    });
    session.resume("lit-world-open");
    await session.drain();
    if (!prebuilt) throw new Error("Lit-world session did not create its prebuilt renderer");
    return {
      registry,
      chunks,
      world,
      player,
      session,
      prebuilt,
      lifecycle: {
        sameCanonicalSessionAfterResume: false,
      },
    };
  };

  const runLifecycleProbe = async (current) => {
    const before = current.session.snapshot();
    current.session.suspend("lit-world-lifecycle-probe");
    suspensionCount += 1;
    const hidden = current.session.snapshot();
    current.session.resume("lit-world-lifecycle-probe");
    resumeCount += 1;
    await current.session.drain();
    const after = current.session.snapshot();
    current.lifecycle.sameCanonicalSessionAfterResume = before.worldId === after.worldId
      && before.worldRevision === after.worldRevision
      && hidden.status === "suspended"
      && after.status === "active"
      && after.lighting.installedChunks === before.lighting.installedChunks;
  };

  const disposeCurrent = async () => {
    if (!runtime) return;
    const result = await disposeRuntime(runtime);
    runtime = null;
    disposalCount += 1;
    disposalBaseline = result.baseline;
  };

  const runDisposalProbe = async () => {
    if (probeComplete) return;
    const probe = await createRuntime("probe");
    const result = await disposeRuntime(probe);
    disposalCount += 1;
    disposalBaseline = result.baseline;
    probeComplete = true;
    if (!disposalBaseline) {
      throw new Error("Lit-world disposal probe did not return lighting and renderer resources to baseline");
    }
  };

  const enqueue = (task) => {
    operation = operation.then(task, task);
    return operation;
  };

  return Object.freeze({
    snapshot,
    open(activityId = LIT_WORLD_ACTIVITY) {
      return enqueue(async () => {
        if (destroyed) throw new Error("Lit-world host has been destroyed");
        if (String(activityId) !== LIT_WORLD_ACTIVITY) {
          throw new Error(`Unsupported lit-world activity: ${activityId}`);
        }
        if (activeActivity === LIT_WORLD_ACTIVITY && status === "ready") return snapshot();
        status = "opening";
        scenario = null;
        await disposeCurrent();
        await runDisposalProbe();
        runtime = await createRuntime(`open-${openCount + 1}`);
        await runLifecycleProbe(runtime);
        activeActivity = LIT_WORLD_ACTIVITY;
        openCount += 1;
        scenario = runtimeScenario(runtime);
        status = "ready";
        canvas.hidden = false;
        if ("autoRender" in app) app.autoRender = true;
        app.resizeCanvas?.();
        if ("renderNextFrame" in app) app.renderNextFrame = true;
        return snapshot();
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
      runtime.session.suspend(reason);
      suspensionCount += 1;
      if ("autoRender" in app) app.autoRender = false;
      status = "suspended";
      scenario = runtimeScenario(runtime);
      return true;
    },
    resume(reason = "document-visible") {
      return enqueue(async () => {
        if (!runtime || activeActivity !== LIT_WORLD_ACTIVITY) return snapshot();
        runtime.session.resume(reason);
        resumeCount += 1;
        await runtime.session.drain();
        if ("autoRender" in app) app.autoRender = true;
        app.resizeCanvas?.();
        if ("renderNextFrame" in app) app.renderNextFrame = true;
        status = "ready";
        scenario = runtimeScenario(runtime);
        return snapshot();
      });
    },
    resize() {
      app.resizeCanvas?.();
      if ("renderNextFrame" in app) app.renderNextFrame = true;
    },
    destroy() {
      return enqueue(async () => {
        if (destroyed) return snapshot();
        destroyed = true;
        await disposeCurrent();
        activeActivity = null;
        scenario = null;
        status = "disposed";
        canvas.hidden = true;
        if ("autoRender" in app) app.autoRender = false;
        if (ownsApplication) app.destroy?.();
        return snapshot();
      });
    },
  });
}
