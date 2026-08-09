import {
  createBlockRegistry,
  createChunk,
  getBlock,
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
  routeAcceptedLightingTransaction,
} from "@greenways/alumbra-viewport-playcanvas";

export const LIT_WORLD_ACTIVITY = "alumbra-viewport-playcanvas/lit-world";
export const LIT_WORLD_STORY_FORMAT = "alumbra.lit-world-story/1";
export const LIT_WORLD_ID = "world:alumbra/lit-cave";
export const LIT_WORLD_SHAPE = Object.freeze([16, 8, 8]);
export const LIT_WORLD_STATE_IDS = Object.freeze({
  live: "lighting/live",
  removed: "lighting/lamp-removed",
  restored: "lighting/lamp-restored",
  stale: "lighting/stale-generation-rejected",
});
export const LIT_WORLD_DEFAULT_STATE = LIT_WORLD_STATE_IDS.live;
export const LIT_WORLD_LAMP = Object.freeze({
  chunk: Object.freeze([-1, 0, 0]),
  local: Object.freeze([15, 2, 4]),
  world: Object.freeze([-1, 2, 4]),
  adjacentChunk: Object.freeze([0, 0, 0]),
  adjacentLocal: Object.freeze([0, 2, 4]),
});
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
const STATE_IDS = new Set(Object.values(LIT_WORLD_STATE_IDS));
const AFFECTED_BOUNDARY_KEYS = Object.freeze(["-1,0,0", "0,0,0"]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
};

function createLightingDelayGate() {
  let armed = false;
  let used = false;
  let started = null;
  let release = null;
  let delayed = null;
  return Object.freeze({
    arm() {
      if (armed) throw new Error("Lit-world lighting delay gate is already armed");
      armed = true;
      used = false;
      started = deferred();
      release = deferred();
      delayed = null;
      return Object.freeze({
        started: started.promise,
        release() { release.resolve(); },
      });
    },
    async run(job) {
      if (!armed || used) return job.run();
      used = true;
      delayed = deepFreeze({
        generation: Number(job.generation ?? 0),
        epoch: Number(job.epoch ?? 0),
        sourceRevisions: (job.sourceRevisions ?? []).map((entry) => ({
          key: String(entry.key),
          revision: Number(entry.revision),
        })),
      });
      started.resolve(delayed);
      await release.promise;
      armed = false;
      return job.run();
    },
    evidence() {
      return deepFreeze({ armed, used, delayed });
    },
  });
}

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
    updates.push({ local: LIT_WORLD_LAMP.local, value: "lit/lamp" });
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
        render: { color: [0.18, 0.22, 0.28], gloss: 0.16, opaque: true },
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
  ], { id: "alumbra/lit-world-blocks", version: "0.1.0" });
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
  const boundaryEmission = fields.getField(LIT_WORLD_LAMP.adjacentChunk)
    .emittedAt(LIT_WORLD_LAMP.adjacentLocal);
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
    graphicsDeviceOptions: { alpha: false, antialias: true, powerPreference: "high-performance" },
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
    requestVersion: Number(value?.requestVersion ?? 0),
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
    lastAffectedKeys: [...(value?.lastAffectedKeys ?? [])],
    lastMesh: {
      groups: Number(value?.lastMesh?.groups ?? 0),
      vertices: Number(value?.lastMesh?.vertices ?? 0),
      triangles: Number(value?.lastMesh?.triangles ?? 0),
    },
    lighting: {
      epoch: Number(value?.lighting?.epoch ?? 0),
      requestedGeneration: Number(value?.lighting?.requestedGeneration ?? 0),
      installedGeneration: Number(value?.lighting?.installedGeneration ?? 0),
      rejectedStaleResults: Number(value?.lighting?.rejectedStaleResults ?? 0),
      invalidatedChunks: Number(value?.lighting?.invalidatedChunks ?? 0),
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

function receiptSummary(value) {
  if (!value) return null;
  return deepFreeze({
    format: String(value.format),
    transactionId: String(value.transactionId),
    worldRevision: Number(value.worldRevision),
    applied: value.applied === true,
    changedKeys: [...value.changedKeys],
    affectedKeys: [...value.affectedKeys],
    revisions: value.revisions.map((entry) => ({
      key: String(entry.key),
      before: Number(entry.before),
      after: Number(entry.after),
    })),
    before: {
      requestVersion: Number(value.before.requestVersion),
      requestedGeneration: Number(value.before.requestedGeneration),
      installedGeneration: Number(value.before.installedGeneration),
    },
    after: {
      requestVersion: Number(value.after.requestVersion),
      requestedGeneration: Number(value.after.requestedGeneration),
      installedGeneration: Number(value.after.installedGeneration),
    },
  });
}

function phaseSummary(runtime, id) {
  const lighting = lightingSummary(runtime.session.snapshot().lighting);
  const field = runtime.session.lighting.getField(LIT_WORLD_LAMP.adjacentChunk);
  const boundaryEmission = field?.emittedAt?.(LIT_WORLD_LAMP.adjacentLocal) ?? 0;
  const lampBlock = getBlock(runtime.world.getChunk(LIT_WORLD_LAMP.chunk), LIT_WORLD_LAMP.local);
  const lampChunkRevision = runtime.world.getChunk(LIT_WORLD_LAMP.chunk).revision;
  const installedFieldRevision = runtime.session.lighting.getField(LIT_WORLD_LAMP.chunk)?.sourceRevision ?? null;
  return deepFreeze({
    id,
    lampPresent: lampBlock.id === "lit/lamp",
    boundaryEmission,
    worldRevision: runtime.world.revision,
    lampChunkRevision,
    installedFieldRevision,
    requestVersion: lighting.requestVersion,
    requestedGeneration: lighting.lighting.requestedGeneration,
    installedGeneration: lighting.lighting.installedGeneration,
    discardedLightingResults: lighting.discardedLightingResults,
    meshInstalls: lighting.meshInstalls,
  });
}

function expectedStateProof(stateId, phase) {
  if (stateId === LIT_WORLD_STATE_IDS.removed) {
    return phase.lampPresent === false && phase.boundaryEmission === 0;
  }
  return phase.lampPresent === true && phase.boundaryEmission > 0;
}

function runtimeScenario(runtime) {
  const snapshot = runtime.session.snapshot();
  const lighting = lightingSummary(snapshot.lighting);
  const materials = materialSummary(runtime.prebuilt);
  const currentPhase = phaseSummary(runtime, runtime.activeState);
  const materialLighting = materials.lighting;
  const alignedVertexColors = materialLighting != null
    && materialLighting.litGroupCount > 0
    && materialLighting.vertices > 0
    && materialLighting.vertices === lighting.lastMesh.vertices;
  const session = sessionSummary(snapshot);
  const receipts = runtime.transition.receipts.map(receiptSummary);
  const stale = runtime.transition.stale;
  return deepFreeze({
    kind: "lit-world",
    stateId: runtime.activeState,
    world: {
      id: LIT_WORLD_ID,
      chunks: 2,
      chunkKeys: ["-1,0,0", "0,0,0"],
      negativeToZero: true,
      lamp: LIT_WORLD_LAMP,
    },
    session,
    lighting,
    materials,
    boundaryEmission: currentPhase.boundaryEmission,
    mutation: {
      stateId: runtime.activeState,
      phases: runtime.transition.phases,
      receipts,
      duplicateRejected: runtime.transition.duplicateRejected,
      stale,
      current: currentPhase,
    },
    proofs: {
      ready: lighting.status === "ready"
        && lighting.loadedChunks === 2
        && lighting.installedChunks === 2,
      expectedState: expectedStateProof(runtime.activeState, currentPhase),
      boundedAffected: receipts.every((receipt) =>
        JSON.stringify(receipt.affectedKeys) === JSON.stringify(AFFECTED_BOUNDARY_KEYS)),
      staleGenerationRejected: runtime.activeState !== LIT_WORLD_STATE_IDS.stale
        || (stale?.rejected === true
          && stale.finalRequestedGeneration === stale.finalInstalledGeneration
          && currentPhase.installedFieldRevision === currentPhase.lampChunkRevision),
      crossChunkEmission: currentPhase.boundaryEmission > 0
        && lighting.maximumEmitted > 0,
      sunlightPresent: lighting.maximumSunlight > 0,
      alignedVertexColors,
      sameCanonicalSessionAfterResume: runtime.lifecycle.sameCanonicalSessionAfterResume === true,
      duplicateActionRejected: runtime.activeState === LIT_WORLD_STATE_IDS.live
        || runtime.transition.duplicateRejected === true,
      boundedEvidence: true,
    },
  });
}

async function disposeRuntime(runtime) {
  if (!runtime) return deepFreeze({ lighting: null, materials: null, baseline: true });
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

function lampTransaction(runtime, { id, before, after, action }) {
  const chunk = runtime.world.getChunk(LIT_WORLD_LAMP.chunk);
  const current = getBlock(chunk, LIT_WORLD_LAMP.local).id;
  if (current !== before) {
    const error = new Error(`Boundary lamp action ${action} requires ${before}, found ${current}`);
    error.code = "lit-world/lamp-state";
    throw error;
  }
  return {
    id,
    expectedRevisions: [{ chunk: chunk.coord, revision: chunk.revision }],
    changes: [{
      chunk: chunk.coord,
      local: LIT_WORLD_LAMP.local,
      before,
      after,
    }],
    metadata: { action, state: runtime.activeState },
  };
}

function routeAcceptance(runtime, acceptance) {
  return routeAcceptedLightingTransaction({
    acceptance,
    getChunk: runtime.world.getChunk,
    coordinator: runtime.session.lighting,
  });
}

async function removeLamp(runtime) {
  const acceptance = runtime.world.apply(lampTransaction(runtime, {
    id: `lit-world/remove-boundary-lamp-${runtime.world.revision + 1}`,
    before: "lit/lamp",
    after: "lit/air",
    action: "remove-boundary-lamp",
  }));
  const receipt = routeAcceptance(runtime, acceptance);
  runtime.transition.receipts.push(receipt);
  await runtime.session.drain();
  runtime.transition.phases.push(phaseSummary(runtime, LIT_WORLD_STATE_IDS.removed));
  return receipt;
}

async function restoreLamp(runtime) {
  const chunk = runtime.world.getChunk(LIT_WORLD_LAMP.chunk);
  const current = getBlock(chunk, LIT_WORLD_LAMP.local).id;
  if (current !== "lit/air") {
    const error = new Error(`Boundary lamp restore requires lit/air, found ${current}`);
    error.code = "lit-world/lamp-state";
    throw error;
  }
  const acceptance = runtime.world.undo({
    id: `lit-world/restore-boundary-lamp-${runtime.world.revision + 1}`,
  });
  if (!acceptance) {
    const error = new Error("Boundary lamp restore has no accepted inverse transaction");
    error.code = "lit-world/no-inverse";
    throw error;
  }
  const receipt = routeAcceptance(runtime, acceptance);
  runtime.transition.receipts.push(receipt);
  await runtime.session.drain();
  runtime.transition.phases.push(phaseSummary(runtime, LIT_WORLD_STATE_IDS.restored));
  return receipt;
}

async function rejectDuplicate(action) {
  try {
    await action();
    return false;
  } catch (error) {
    if (error?.code !== "lit-world/lamp-state") throw error;
    return true;
  }
}

async function applyState(runtime, stateId) {
  runtime.activeState = stateId;
  runtime.transition.phases.push(phaseSummary(runtime, LIT_WORLD_STATE_IDS.live));
  if (stateId === LIT_WORLD_STATE_IDS.live) return;
  if (stateId === LIT_WORLD_STATE_IDS.removed) {
    await removeLamp(runtime);
    runtime.transition.duplicateRejected = await rejectDuplicate(() => removeLamp(runtime));
    return;
  }
  if (stateId === LIT_WORLD_STATE_IDS.restored) {
    await removeLamp(runtime);
    await restoreLamp(runtime);
    runtime.transition.duplicateRejected = await rejectDuplicate(() => restoreLamp(runtime));
    return;
  }

  const before = lightingSummary(runtime.session.snapshot().lighting);
  const gate = runtime.gate.arm();
  const acceptance = runtime.world.apply(lampTransaction(runtime, {
    id: `lit-world/remove-boundary-lamp-${runtime.world.revision + 1}`,
    before: "lit/lamp",
    after: "lit/air",
    action: "stale-remove-boundary-lamp",
  }));
  runtime.transition.receipts.push(routeAcceptance(runtime, acceptance));
  const projection = runtime.session.drain();
  const delayed = await gate.started;
  runtime.transition.phases.push(deepFreeze({
    id: "lighting/delayed-generation",
    lampPresent: false,
    boundaryEmission: null,
    worldRevision: runtime.world.revision,
    lampChunkRevision: runtime.world.getChunk(LIT_WORLD_LAMP.chunk).revision,
    installedFieldRevision: runtime.session.lighting.getField(LIT_WORLD_LAMP.chunk)?.sourceRevision ?? null,
    requestVersion: runtime.session.lighting.evidence().requestVersion,
    requestedGeneration: delayed.generation,
    installedGeneration: before.lighting.installedGeneration,
    discardedLightingResults: before.discardedLightingResults,
    meshInstalls: before.meshInstalls,
  }));

  const restored = runtime.world.undo({
    id: `lit-world/restore-boundary-lamp-${runtime.world.revision + 1}`,
  });
  runtime.transition.receipts.push(routeAcceptance(runtime, restored));
  gate.release();
  await projection;
  await runtime.session.drain();
  const after = lightingSummary(runtime.session.snapshot().lighting);
  runtime.transition.phases.push(phaseSummary(runtime, LIT_WORLD_STATE_IDS.stale));
  runtime.transition.stale = deepFreeze({
    delayedGeneration: delayed.generation,
    delayedEpoch: delayed.epoch,
    discardedBefore: before.discardedLightingResults,
    discardedAfter: after.discardedLightingResults,
    finalRequestedGeneration: after.lighting.requestedGeneration,
    finalInstalledGeneration: after.lighting.installedGeneration,
    rejected: after.discardedLightingResults > before.discardedLightingResults,
  });
  runtime.transition.duplicateRejected = await rejectDuplicate(() => restoreLamp(runtime));
}

export function createLitWorldStoryHost({
  pc,
  canvas,
  createSession = createLitPlayCanvasViewportSession,
  createPrebuiltRenderer = createPlayCanvasPrebuiltMeshRenderer,
  application = null,
} = {}) {
  if (!canvas?.addEventListener) throw new TypeError("Lit-world host requires a canvas-like event target");
  if (typeof createSession !== "function" || typeof createPrebuiltRenderer !== "function") {
    throw new TypeError("Lit-world host factories must be functions");
  }
  const app = application ?? createApplication(pc, canvas);
  const ownsApplication = application == null;
  let runtime = null;
  let activeActivity = null;
  let activeState = null;
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
    activeState,
    status,
    scenario,
    lifecycle: { opens: openCount, suspensions: suspensionCount, resumes: resumeCount },
    disposal: { count: disposalCount, baseline: disposalBaseline },
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
    const gate = createLightingDelayGate();
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
      lightingOptions: { runLighting: (job) => gate.run(job) },
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
      gate,
      activeState: LIT_WORLD_DEFAULT_STATE,
      transition: {
        phases: [],
        receipts: [],
        duplicateRejected: false,
        stale: null,
      },
      lifecycle: { sameCanonicalSessionAfterResume: false },
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
      && after.lighting.installedChunks === before.lighting.installedChunks
      && after.lighting.dirtyChunks === 0;
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
    open(activityId = LIT_WORLD_ACTIVITY, options = {}) {
      return enqueue(async () => {
        if (destroyed) throw new Error("Lit-world host has been destroyed");
        if (String(activityId) !== LIT_WORLD_ACTIVITY) {
          throw new Error(`Unsupported lit-world activity: ${activityId}`);
        }
        const requestedState = typeof options === "string"
          ? options
          : options?.stateId ?? LIT_WORLD_DEFAULT_STATE;
        if (!STATE_IDS.has(requestedState)) {
          throw new Error(`Unsupported lit-world state: ${requestedState}`);
        }
        if (activeActivity === LIT_WORLD_ACTIVITY
          && activeState === requestedState
          && status === "ready") return snapshot();
        status = "opening";
        scenario = null;
        await disposeCurrent();
        await runDisposalProbe();
        runtime = await createRuntime(`open-${openCount + 1}`);
        await applyState(runtime, requestedState);
        await runLifecycleProbe(runtime);
        activeActivity = LIT_WORLD_ACTIVITY;
        activeState = requestedState;
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
        activeState = null;
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
        activeState = null;
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
