import {
  createPlayCanvasPrebuiltMeshRenderer,
} from "@greenways/alumbra-renderer-playcanvas";
import {
  createPlayerRuntime,
  createWorldRuntime,
} from "@greenways/alumbra-engine";
import {
  createLitPlayCanvasViewportSession,
  createPlayableWorldController,
} from "@greenways/alumbra-viewport-playcanvas";
import {
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_BLOCK_IDS,
  PEACOCK_BALLROOM_LANDMARK_IDS,
  PEACOCK_BALLROOM_PACKAGE,
  PEACOCK_BALLROOM_PLAYER_BODY,
  PEACOCK_BALLROOM_PROVIDER_ID,
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_STORY_FORMAT,
  PEACOCK_BALLROOM_VERSION,
  PEACOCK_BALLROOM_WORLD,
  PEACOCK_BALLROOM_WORLD_ID,
  createPeacockBallroomChunks,
  createPeacockBallroomProviderDescriptor,
  createPeacockBallroomRegistry,
  describePeacockBallroomChunks,
  peacockBallroomView,
} from "@greenways/alumbra-hara";

const STATE_SET = new Set(PEACOCK_BALLROOM_STATE_IDS);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const count = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0
  ? Number(value)
  : 0;

function paletteFrom(registry) {
  return Object.freeze(registry.definitions
    .filter((definition) => !definition.empty)
    .map((definition) => Object.freeze({
      id: definition.id,
      label: definition.metadata?.label ?? definition.id.split("/").at(-1),
      color: Object.freeze([...(definition.metadata?.render?.color ?? [0.62, 0.67, 0.72])]),
    })));
}

function blockCounts(chunks) {
  const counts = Object.fromEntries(PEACOCK_BALLROOM_BLOCK_IDS.map((id) => [id, 0]));
  for (const chunk of chunks) {
    for (const paletteIndex of chunk.indices) {
      const id = chunk.palette[paletteIndex]?.id;
      if (Object.hasOwn(counts, id)) counts[id] += 1;
    }
  }
  return deepFreeze(counts);
}

function spawnIsSafe(world, spawn) {
  const x = Math.floor(spawn.position[0]);
  const y = Math.floor(spawn.position[1]);
  const z = Math.floor(spawn.position[2]);
  const feet = world.getBlock([x, y, z]);
  const head = world.getBlock([x, y + 1, z]);
  const ground = world.getBlock([x, y - 1, z]);
  return !world.isSolidBlock(feet)
    && !world.isSolidBlock(head)
    && world.isSolidBlock(ground);
}

function lightingSummary(value) {
  return deepFreeze({
    format: String(value?.format ?? "alumbra.viewport-lighting-evidence/1"),
    status: String(value?.status ?? "idle"),
    profileId: String(value?.profileId ?? ""),
    loadedChunks: count(value?.loadedChunks),
    dirtyChunks: count(value?.dirtyChunks),
    installedChunks: count(value?.installedChunks),
    meshInstalls: count(value?.meshInstalls),
    maximumSunlight: count(value?.maximumSunlight),
    maximumEmitted: count(value?.maximumEmitted),
    maximumCombined: count(value?.maximumCombined),
    retainedProjections: count(value?.retainedProjections),
    discardedLightingResults: count(value?.discardedLightingResults),
    discardedMeshResults: count(value?.discardedMeshResults),
    renderer: {
      chunks: count(value?.renderer?.chunks),
      quads: count(value?.renderer?.quads),
      triangles: count(value?.renderer?.triangles),
      meshResources: count(value?.renderer?.meshResources),
      materialResources: count(value?.renderer?.materialResources),
    },
    baseline: value?.baseline === true,
  });
}

function materialSummary(prebuilt) {
  const evidence = prebuilt?.materialEvidence?.() ?? {};
  const lighting = evidence.lighting ?? null;
  return deepFreeze({
    format: String(evidence.format ?? "alumbra.material-render-evidence/1"),
    materialGroupCount: count(evidence.materialGroupCount),
    profileCount: count(evidence.profileCount),
    profileIds: Object.freeze([...(evidence.profileIds ?? [])]),
    opaquePassCount: count(evidence.opaquePassCount),
    transparentPassCount: count(evidence.transparentPassCount),
    emissivePassCount: count(evidence.emissivePassCount),
    materialResources: count(evidence.materialResources),
    materialReferences: count(evidence.materialReferences),
    lighting: lighting == null ? null : {
      format: String(lighting.format),
      litGroupCount: count(lighting.litGroupCount),
      vertices: count(lighting.vertices),
      sunlightVertices: count(lighting.sunlightVertices),
      emittedVertices: count(lighting.emittedVertices),
      minimumByte: count(lighting.minimumByte),
      maximumByte: count(lighting.maximumByte),
    },
  });
}

function sessionSummary(value) {
  return deepFreeze({
    sessionId: String(value?.sessionId ?? ""),
    status: String(value?.status ?? "unknown"),
    reason: String(value?.reason ?? ""),
    frame: count(value?.frame),
    suspensions: count(value?.suspensions),
    resumes: count(value?.resumes),
    worldId: String(value?.worldId ?? ""),
    worldRevision: count(value?.worldRevision),
    selectedSlot: count(value?.selectedSlot),
    renderer: {
      chunks: count(value?.renderer?.chunks),
      quads: count(value?.renderer?.quads),
      triangles: count(value?.renderer?.triangles),
    },
  });
}

async function disposeRuntime(runtime) {
  if (!runtime) return deepFreeze({baseline: true, lighting: null, materials: null});
  const lighting = lightingSummary(await runtime.session.destroy());
  const materials = materialSummary(runtime.prebuilt);
  return deepFreeze({
    lighting,
    materials,
    baseline: lighting.baseline === true
      && materials.materialGroupCount === 0
      && materials.materialResources === 0,
  });
}

function scenarioFrom(runtime, lifecycle) {
  const snapshot = runtime.session.snapshot();
  const lighting = lightingSummary(snapshot.lighting);
  const materials = materialSummary(runtime.prebuilt);
  const session = sessionSummary(snapshot);
  const counts = blockCounts(runtime.chunks);
  const serializedBoundary = JSON.stringify({
    generation: runtime.generation,
    lighting,
    materials,
    session,
  });
  const nonAirVoxels = Object.entries(counts)
    .filter(([id]) => id !== "ballroom/air")
    .reduce((sum, [, value]) => sum + value, 0);
  return deepFreeze({
    kind: "peacock-ballroom",
    stateId: runtime.stateId,
    view: runtime.view.label,
    provider: createPeacockBallroomProviderDescriptor(),
    world: {
      id: PEACOCK_BALLROOM_WORLD_ID,
      package: `${PEACOCK_BALLROOM_PACKAGE}@${PEACOCK_BALLROOM_VERSION}`,
      providerId: PEACOCK_BALLROOM_PROVIDER_ID,
      activityId: PEACOCK_BALLROOM_ACTIVITY_ID,
      chunkCount: runtime.chunks.length,
      minimumChunk: [...PEACOCK_BALLROOM_WORLD.envelope.minimumChunk],
      maximumChunk: [...PEACOCK_BALLROOM_WORLD.envelope.maximumChunk],
      landmarks: [...PEACOCK_BALLROOM_LANDMARK_IDS],
      blockCounts: counts,
      nonAirVoxels,
    },
    generation: runtime.generation,
    session,
    lighting,
    materials,
    lifecycle,
    proofs: {
      exactEnvelope: runtime.generation.chunkCount === 48
        && runtime.generation.uniqueChunkCount === 48,
      crossOrigin: runtime.generation.negativeAndPositive === true,
      namedState: STATE_SET.has(runtime.stateId),
      safeSpawn: runtime.safeSpawn,
      landmarkSet: runtime.generation.landmarks.length === PEACOCK_BALLROOM_LANDMARK_IDS.length,
      sunlight: lighting.maximumSunlight > 0,
      emittedLight: lighting.maximumEmitted > 0,
      litProjection: lighting.loadedChunks === 48
        && lighting.installedChunks === 48
        && lighting.dirtyChunks === 0
        && materials.lighting?.vertices > 0,
      materialPasses: materials.opaquePassCount > 0
        && materials.transparentPassCount > 0
        && materials.emissivePassCount > 0,
      sameCanonicalSessionAfterResume: lifecycle.sameCanonicalSessionAfterResume === true,
      boundedEvidence: !serializedBoundary.includes("Uint8Array")
        && !serializedBoundary.includes("indices")
        && !serializedBoundary.includes("meshBuffer")
        && !serializedBoundary.includes("callback")
        && !serializedBoundary.includes("PlayCanvas"),
    },
  });
}

export function createPeacockBallroomPreviewHost({
  pc,
  canvas,
  createSession = createLitPlayCanvasViewportSession,
  createPrebuiltRenderer = createPlayCanvasPrebuiltMeshRenderer,
  onFrame = () => {},
  onActionResult = () => {},
  onError = () => {},
  onPalette = () => {},
  onState = () => {},
} = {}) {
  if (!canvas?.addEventListener) throw new TypeError("Peacock Ballroom host requires a canvas-like event target");
  if (typeof createSession !== "function" || typeof createPrebuiltRenderer !== "function") {
    throw new TypeError("Peacock Ballroom host factories must be functions");
  }
  for (const callback of [onFrame, onActionResult, onError, onPalette, onState]) {
    if (typeof callback !== "function") throw new TypeError("Peacock Ballroom host callbacks must be functions");
  }

  let runtime = null;
  let activeState = null;
  let status = "idle";
  let scenario = null;
  let operation = Promise.resolve();
  let destroyed = false;
  let openCount = 0;
  let suspensionCount = 0;
  let resumeCount = 0;
  let disposalCount = 0;
  let disposalBaseline = false;
  let probeComplete = false;

  const lifecycle = () => deepFreeze({
    opens: openCount,
    suspensions: suspensionCount,
    resumes: resumeCount,
    sameCanonicalSessionAfterResume: runtime?.sameCanonicalSessionAfterResume === true,
  });

  const snapshot = () => deepFreeze({
    format: PEACOCK_BALLROOM_STORY_FORMAT,
    hostReady: true,
    activeActivity: activeState == null ? null : PEACOCK_BALLROOM_ACTIVITY_ID,
    activeState,
    status,
    scenario,
    lifecycle: lifecycle(),
    disposal: {count: disposalCount, baseline: disposalBaseline},
  });

  const createRuntime = async (stateId, suffix, {probe = false} = {}) => {
    const registry = createPeacockBallroomRegistry();
    const chunks = createPeacockBallroomChunks({
      registry,
      coordinates: probe ? [[0, 0, 0]] : PEACOCK_BALLROOM_WORLD.chunkCoordinates,
    });
    const generation = probe
      ? deepFreeze({
        format: "alumbra.peacock-ballroom-generation-evidence/1",
        chunkCount: chunks.length,
        uniqueChunkCount: chunks.length,
        minimumChunk: [0, 0, 0],
        maximumChunk: [0, 0, 0],
        negativeAndPositive: false,
        revisions: [1],
        paletteIds: [...PEACOCK_BALLROOM_BLOCK_IDS],
        landmarks: [...PEACOCK_BALLROOM_LANDMARK_IDS],
      })
      : describePeacockBallroomChunks(chunks);
    const world = createWorldRuntime({
      registry,
      chunks,
      missingChunkPolicy: "empty",
      worldId: probe ? `${PEACOCK_BALLROOM_WORLD_ID}/probe` : PEACOCK_BALLROOM_WORLD_ID,
    });
    const view = probe
      ? {
        position: [-0.5, 2.05, 5.5], velocity: [0, 0, 0], yaw: 0, pitch: -16,
        grounded: false, label: "Lifecycle probe",
      }
      : peacockBallroomView(stateId);
    const player = createPlayerRuntime({
      state: view,
      fixedStep: {tick: 1 / 60, maxFrame: 0.2, maxSteps: 10},
      config: {body: PEACOCK_BALLROOM_PLAYER_BODY},
      getBlock: world.getBlock,
      isSolid: world.isSolidBlock,
      missingSolid: false,
    });
    let prebuilt = null;
    const session = createSession({
      sessionId: `peacock-ballroom/${suffix}`,
      pc,
      canvas,
      world,
      player,
      blockIds: PEACOCK_BALLROOM_BLOCK_IDS.filter((id) => id !== "ballroom/air"),
      playerBody: PEACOCK_BALLROOM_PLAYER_BODY,
      view: {horizontalDistance: probe ? 1 : 4, verticalDistance: probe ? 0 : 2},
      cameraOptions: {
        clearColor: [0.50, 0.68, 0.72],
        ambientLight: [0.28, 0.25, 0.20],
        fov: 66,
        nearClip: 0.05,
        farClip: 180,
      },
      lightOptions: {
        color: [1, 0.91, 0.73],
        intensity: 1.35,
        castShadows: true,
        shadowDistance: 100,
        euler: [48, 28, 0],
      },
      createController: createPlayableWorldController,
      controllerOptions: {actor: "actor:peacock-ballroom-preview"},
      inputOptions: {requirePointerLock: true, initialSlot: 0},
      initialSuspended: false,
      createPrebuiltRenderer(options) {
        prebuilt = createPrebuiltRenderer(options);
        return prebuilt;
      },
      onFrame,
      onActionResult,
      onError(event) {
        try {
          onError(event);
        } catch {
          // Host diagnostics must not destabilize the viewport.
        }
      },
    });
    await session.drain();
    if (!prebuilt) throw new Error("Peacock Ballroom session did not create its prebuilt renderer");
    return {
      registry,
      chunks,
      generation,
      world,
      view,
      player,
      session,
      prebuilt,
      stateId,
      safeSpawn: spawnIsSafe(world, view),
      sameCanonicalSessionAfterResume: false,
    };
  };

  const runDisposalProbe = async () => {
    if (probeComplete) return;
    const probe = await createRuntime(PEACOCK_BALLROOM_WORLD.defaultState, "probe", {probe: true});
    const result = await disposeRuntime(probe);
    disposalCount += 1;
    disposalBaseline = result.baseline;
    probeComplete = true;
    if (!disposalBaseline) {
      throw new Error("Peacock Ballroom disposal probe did not return renderer and lighting resources to baseline");
    }
  };

  const runLifecycleProbe = async (current) => {
    const before = current.session.snapshot();
    current.session.suspend("peacock-ballroom-lifecycle-probe");
    suspensionCount += 1;
    const hidden = current.session.snapshot();
    current.session.resume("peacock-ballroom-lifecycle-probe");
    resumeCount += 1;
    await current.session.drain();
    const after = current.session.snapshot();
    current.sameCanonicalSessionAfterResume = before.worldId === after.worldId
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

  const enqueue = (task) => {
    operation = operation.then(task, task);
    return operation;
  };

  return Object.freeze({
    activityId: PEACOCK_BALLROOM_ACTIVITY_ID,
    stateIds: PEACOCK_BALLROOM_STATE_IDS,
    snapshot,
    open(stateId = PEACOCK_BALLROOM_WORLD.defaultState) {
      return enqueue(async () => {
        if (destroyed) throw new Error("Peacock Ballroom host has been destroyed");
        const requestedState = String(stateId);
        if (!STATE_SET.has(requestedState)) throw new Error(`Unsupported Peacock Ballroom state: ${requestedState}`);
        if (activeState === requestedState && status === "ready") return snapshot();
        status = "opening";
        scenario = null;
        await disposeCurrent();
        await runDisposalProbe();
        runtime = await createRuntime(requestedState, `open-${openCount + 1}`);
        await runLifecycleProbe(runtime);
        activeState = requestedState;
        openCount += 1;
        scenario = scenarioFrom(runtime, lifecycle());
        status = "ready";
        canvas.hidden = false;
        onPalette({
          palette: paletteFrom(runtime.registry),
          input: runtime.session.input,
          slot: runtime.session.input.selectedSlot,
        });
        onState({stateId: requestedState, status: "ready", scenario});
        return snapshot();
      });
    },
    close(reason = "closed") {
      return enqueue(async () => {
        if (destroyed) return snapshot();
        status = String(reason);
        await disposeCurrent();
        activeState = null;
        scenario = null;
        canvas.hidden = true;
        status = "idle";
        return snapshot();
      });
    },
    suspend(reason = "document-hidden") {
      if (!runtime || status !== "ready") return false;
      runtime.session.suspend(reason);
      suspensionCount += 1;
      status = "suspended";
      scenario = scenarioFrom(runtime, lifecycle());
      return true;
    },
    resume(reason = "document-visible") {
      return enqueue(async () => {
        if (!runtime || activeState == null) return snapshot();
        runtime.session.resume(reason);
        resumeCount += 1;
        await runtime.session.drain();
        status = "ready";
        scenario = scenarioFrom(runtime, lifecycle());
        return snapshot();
      });
    },
    select(slot) {
      if (!runtime) return false;
      runtime.session.input.select(Number(slot));
      return true;
    },
    resize() {
      runtime?.session.resize();
    },
    destroy() {
      return enqueue(async () => {
        if (destroyed) return snapshot();
        destroyed = true;
        await disposeCurrent();
        activeState = null;
        scenario = null;
        status = "disposed";
        canvas.hidden = true;
        return snapshot();
      });
    },
  });
}
