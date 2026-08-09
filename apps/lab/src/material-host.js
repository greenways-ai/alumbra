import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import {
  ENVIRONMENT_PROFILE_IDS,
  MATERIAL_PROFILE_IDS,
  boundedEnvironmentProfileError,
  boundedMaterialProfileError,
  buildChunkMesh,
  createPlayCanvasEnvironmentController,
  createPlayCanvasPrebuiltMeshRenderer,
} from "@greenways/alumbra-renderer-playcanvas";

export const MATERIAL_MATRIX_ACTIVITY = "alumbra-renderer-playcanvas/material-matrix";
export const ENVIRONMENT_PROFILE_ACTIVITY = "alumbra-renderer-playcanvas/environment-profile";
export const MATERIAL_STORY_FORMAT = "alumbra.material-story/1";

export const MATERIAL_STATE_IDS = Object.freeze({
  daylight: "materials/daylight",
  fog: "materials/fog",
  emissive: "materials/emissive",
  unknownProfile: "materials/unknown-profile-error",
});

const MATERIAL_ACTIVITIES = new Set([
  MATERIAL_MATRIX_ACTIVITY,
  ENVIRONMENT_PROFILE_ACTIVITY,
]);
const MATERIAL_STATES = new Set(Object.values(MATERIAL_STATE_IDS));
const MATRIX_SHAPE = Object.freeze([16, 8, 16]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

export function createMaterialStoryRegistry() {
  const material = (profile, color, extra = {}) => ({
    profile,
    color,
    ...extra,
  });
  return createBlockRegistry([
    {
      id: "material/air",
      empty: true,
      metadata: {
        physics: { solid: false, replaceable: true },
        render: { visible: false, opaque: false },
      },
    },
    {
      id: "material/opaque",
      metadata: {
        label: "Opaque basalt",
        physics: { solid: true },
        render: material(MATERIAL_PROFILE_IDS.opaque, [0.24, 0.3, 0.36], { gloss: 0.18 }),
      },
    },
    {
      id: "material/cutout",
      metadata: {
        label: "Cutout leaf",
        physics: { solid: false },
        render: material(MATERIAL_PROFILE_IDS.cutout, [0.28, 0.74, 0.42, 0.78], {
          alphaCutoff: 0.5,
          opaque: true,
          gloss: 0.08,
        }),
      },
    },
    {
      id: "material/transparent",
      metadata: {
        label: "Transparent crystal",
        physics: { solid: true },
        render: material(MATERIAL_PROFILE_IDS.transparent, [0.45, 0.78, 0.9, 0.44], {
          opaque: false,
          opacity: 0.44,
          gloss: 0.78,
        }),
      },
    },
    {
      id: "material/emissive",
      metadata: {
        label: "Emissive ember",
        physics: { solid: true },
        emittedLight: 12,
        render: material(MATERIAL_PROFILE_IDS.emissive, [0.52, 0.12, 0.04], {
          emissive: [0.95, 0.22, 0.04],
          gloss: 0.34,
        }),
      },
    },
    {
      id: "material/selection-overlay",
      metadata: {
        label: "Selection overlay",
        physics: { solid: false },
        render: material(MATERIAL_PROFILE_IDS.selectionOverlay, [0.98, 0.78, 0.23, 0.28], {
          opaque: false,
          opacity: 0.28,
          selectionOverlay: true,
        }),
      },
    },
  ], {
    id: "material/story-registry",
    version: "0.1.0",
  });
}

function createMatrixChunk(registry, coord) {
  const chunk = createChunk({ registry, coord, shape: MATRIX_SHAPE });
  const ids = [
    "material/opaque",
    "material/cutout",
    "material/transparent",
    "material/emissive",
    "material/selection-overlay",
  ];
  const updates = [];
  ids.forEach((id, column) => {
    const startX = 1 + column * 3;
    for (let x = startX; x < startX + 2; x += 1) {
      for (let y = 1; y < 4; y += 1) {
        for (let z = 5; z < 7; z += 1) updates.push({ local: [x, y, z], value: id });
      }
    }
  });
  return patchChunk(chunk, updates, registry, { revision: 1 });
}

function createApplication(pc, canvas) {
  if (!pc || typeof pc.Application !== "function" || typeof pc.Entity !== "function") {
    throw new TypeError("Material story host requires the PlayCanvas Application and Entity APIs");
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
  app.start?.();
  if ("autoRender" in app) app.autoRender = false;
  return app;
}

function createScene({ pc, app, registry }) {
  const root = new pc.Entity("Alumbra material root");
  app.root.addChild(root);
  const renderer = createPlayCanvasPrebuiltMeshRenderer({ pc, app, registry, root });

  const camera = new pc.Entity("Alumbra material camera");
  camera.addComponent?.("camera", {
    clearColor: pc.Color ? new pc.Color(0.36, 0.53, 0.68) : [0.36, 0.53, 0.68],
    fov: 58,
    nearClip: 0.05,
    farClip: 320,
  });
  app.root.addChild(camera);

  const sun = new pc.Entity("Alumbra material sun");
  sun.addComponent?.("light", {
    type: "directional",
    color: pc.Color ? new pc.Color(1, 0.91, 0.73) : [1, 0.91, 0.73],
    intensity: 1.45,
    castShadows: true,
    shadowDistance: 110,
  });
  sun.setLocalEulerAngles?.(48, 28, 0);
  app.root.addChild(sun);

  const environment = createPlayCanvasEnvironmentController({ pc, app, camera, sun });
  camera.setLocalPosition?.(31, 16, 27);
  if (typeof camera.lookAt === "function") camera.lookAt(15, 2.5, 6);
  else camera.setLocalEulerAngles?.(-18, 44, 0);
  app.resizeCanvas?.();
  if ("renderNextFrame" in app) app.renderNextFrame = true;
  return { app, root, renderer, camera, sun, environment };
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
    materials: renderer.materialEvidence(),
  });
}

function rendererAtBaseline(renderer) {
  const evidence = rendererEvidence(renderer);
  return evidence.chunks === 0
    && evidence.meshResources === 0
    && evidence.meshReferences === 0
    && evidence.materialResources === 0
    && evidence.materialReferences === 0
    && evidence.materials.materialGroupCount === 0;
}

async function disposeRuntime(runtime) {
  if (!runtime) return deepFreeze({ baseline: true, renderer: null, environment: null });
  const environment = runtime.scene.environment.destroy();
  runtime.scene.renderer.destroy();
  const renderer = rendererEvidence(runtime.scene.renderer);
  const baseline = environment.status === "disposed"
    && environment.baseline === true
    && rendererAtBaseline(runtime.scene.renderer);
  runtime.scene.camera.destroy?.();
  runtime.scene.sun.destroy?.();
  runtime.scene.root.destroy?.();
  return deepFreeze({ baseline, renderer, environment });
}

function installMatrix(scene, registry, coordinates) {
  for (const coord of coordinates) {
    const chunk = createMatrixChunk(registry, coord);
    const mesh = buildChunkMesh({ chunk, registry });
    scene.renderer.installChunkMesh({ chunk, mesh });
  }
}

function unknownMaterialProfileProbe({ pc, app }) {
  const registry = createBlockRegistry([
    {
      id: "material/air",
      empty: true,
      metadata: { render: { visible: false, opaque: false } },
    },
    {
      id: "material/unknown-profile",
      metadata: {
        render: {
          profile: "alumbra/profile-does-not-exist",
          color: [0.8, 0.1, 0.8],
        },
      },
    },
  ], { id: "material/unknown-profile-registry", version: "0.1.0" });
  const chunk = createChunk({
    registry,
    coord: [0, 0, 0],
    shape: [1, 1, 1],
    fill: "material/unknown-profile",
    revision: 1,
  });
  const mesh = buildChunkMesh({ chunk, registry });
  const root = new pc.Entity("Alumbra missing-profile probe");
  app.root.addChild(root);
  const renderer = createPlayCanvasPrebuiltMeshRenderer({ pc, app, registry, root });
  let error;
  try {
    renderer.installChunkMesh({ chunk, mesh });
    throw new Error("Unknown material profile unexpectedly installed");
  } catch (caught) {
    error = boundedMaterialProfileError(caught);
  }
  const beforeDestroy = rendererEvidence(renderer);
  const allocationBaseline = beforeDestroy.chunks === 0
    && beforeDestroy.meshResources === 0
    && beforeDestroy.materialResources === 0;
  renderer.destroy();
  root.destroy?.();
  return deepFreeze({ error, allocationBaseline });
}

function materialMatrixScenario(scene) {
  const renderer = rendererEvidence(scene.renderer);
  const materials = renderer.materials;
  return deepFreeze({
    kind: "material-matrix",
    renderer,
    environment: scene.environment.evidence(),
    installedProfiles: materials.profileIds,
    complete: materials.profileCount === 5
      && materials.opaquePassCount > 0
      && materials.cutoutPassCount > 0
      && materials.transparentPassCount > 0
      && materials.emissivePassCount > 0
      && materials.overlayPassCount > 0
      && materials.sharedResourceCount > 0,
  });
}

function environmentState(profileId, evidence) {
  return deepFreeze({
    status: "ready",
    profileId,
    environment: evidence,
  });
}

export function createMaterialStoryHost({ pc, canvas } = {}) {
  if (!canvas?.addEventListener) throw new TypeError("Material story host requires a canvas");
  const registry = createMaterialStoryRegistry();
  const app = createApplication(pc, canvas);
  let runtime = null;
  let activeActivity = null;
  let activeState = null;
  let status = "idle";
  let scenario = null;
  let states = deepFreeze({});
  let operation = Promise.resolve();
  let destroyed = false;
  let probeComplete = false;
  let disposalCount = 0;
  let disposalBaseline = false;

  const snapshot = () => deepFreeze({
    format: MATERIAL_STORY_FORMAT,
    hostReady: true,
    activeActivity,
    activeState,
    status,
    scenario,
    states,
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
    installMatrix(scene, registry, [[0, 0, 0]]);
    scene.environment.apply(ENVIRONMENT_PROFILE_IDS.daylight);
    const result = await disposeRuntime({ scene });
    disposalCount += 1;
    disposalBaseline = result.baseline;
    probeComplete = true;
    if (!disposalBaseline) throw new Error("Material renderer disposal probe did not return to baseline");
  };

  const runMaterialMatrix = () => {
    const scene = createScene({ pc, app, registry });
    installMatrix(scene, registry, [[0, 0, 0], [1, 0, 0]]);
    scene.environment.apply(ENVIRONMENT_PROFILE_IDS.daylight);
    runtime = { scene };
    states = deepFreeze({
      [MATERIAL_STATE_IDS.daylight]: environmentState(
        ENVIRONMENT_PROFILE_IDS.daylight,
        scene.environment.evidence(),
      ),
    });
    activeState = MATERIAL_STATE_IDS.daylight;
    return materialMatrixScenario(scene);
  };

  const runEnvironmentProfile = (requestedState) => {
    const scene = createScene({ pc, app, registry });
    installMatrix(scene, registry, [[0, 0, 0]]);
    runtime = { scene };

    const daylight = scene.environment.apply(ENVIRONMENT_PROFILE_IDS.daylight);
    const fog = scene.environment.apply(ENVIRONMENT_PROFILE_IDS.fog);
    const emissive = scene.environment.apply(ENVIRONMENT_PROFILE_IDS.emissive);
    let missingEnvironmentProfile;
    try {
      scene.environment.apply("alumbra/profile-does-not-exist");
      throw new Error("Unknown environment profile unexpectedly applied");
    } catch (error) {
      missingEnvironmentProfile = boundedEnvironmentProfileError(error);
    }
    const missingMaterialProfile = unknownMaterialProfileProbe({ pc, app });

    const stateMap = {
      [MATERIAL_STATE_IDS.daylight]: environmentState(ENVIRONMENT_PROFILE_IDS.daylight, daylight),
      [MATERIAL_STATE_IDS.fog]: environmentState(ENVIRONMENT_PROFILE_IDS.fog, fog),
      [MATERIAL_STATE_IDS.emissive]: environmentState(ENVIRONMENT_PROFILE_IDS.emissive, emissive),
      [MATERIAL_STATE_IDS.unknownProfile]: deepFreeze({
        status: "rejected",
        error: missingMaterialProfile.error,
        allocationBaseline: missingMaterialProfile.allocationBaseline,
      }),
    };
    states = deepFreeze(stateMap);
    activeState = requestedState;
    const selected = stateMap[requestedState];
    if (selected.status === "ready") scene.environment.apply(selected.profileId);
    else scene.environment.apply(ENVIRONMENT_PROFILE_IDS.daylight);

    const renderer = rendererEvidence(scene.renderer);
    return deepFreeze({
      kind: "environment-profile",
      active: selected,
      renderer,
      environment: scene.environment.evidence(),
      missingProfileRejected: missingMaterialProfile.error.code === "renderer/material-profile-not-installed"
        && missingMaterialProfile.allocationBaseline === true
        && missingEnvironmentProfile.code === "renderer/environment-profile-not-installed",
      missingEnvironmentProfile,
      shaderSourceExposed: false,
    });
  };

  const enqueue = (task) => {
    operation = operation.then(task, task);
    return operation;
  };

  return Object.freeze({
    snapshot,
    open(activityId, { stateId = null } = {}) {
      return enqueue(async () => {
        if (destroyed) throw new Error("Material story host has been destroyed");
        const id = String(activityId);
        if (!MATERIAL_ACTIVITIES.has(id)) throw new Error(`Unsupported material activity: ${id}`);
        const requestedState = id === MATERIAL_MATRIX_ACTIVITY
          ? MATERIAL_STATE_IDS.daylight
          : String(stateId ?? MATERIAL_STATE_IDS.daylight);
        if (!MATERIAL_STATES.has(requestedState)) throw new Error(`Unsupported material state: ${requestedState}`);
        if (activeActivity === id && activeState === requestedState && status === "ready") return snapshot();
        status = "opening";
        scenario = null;
        states = deepFreeze({});
        await disposeCurrent();
        await runProbe();
        activeActivity = id;
        activeState = requestedState;
        canvas.hidden = false;
        if ("autoRender" in app) app.autoRender = true;
        try {
          scenario = id === MATERIAL_MATRIX_ACTIVITY
            ? runMaterialMatrix()
            : runEnvironmentProfile(requestedState);
          status = "ready";
          return snapshot();
        } catch (error) {
          scenario = deepFreeze({
            kind: id === MATERIAL_MATRIX_ACTIVITY ? "material-matrix" : "environment-profile",
            error: boundedMaterialProfileError(error),
          });
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
        activeState = null;
        scenario = null;
        states = deepFreeze({});
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
    resume() {
      if (!runtime || activeActivity == null) return false;
      runtime.scene.root.enabled = true;
      runtime.scene.camera.enabled = true;
      runtime.scene.sun.enabled = true;
      if ("autoRender" in runtime.scene.app) runtime.scene.app.autoRender = true;
      runtime.scene.app.resizeCanvas?.();
      if ("renderNextFrame" in runtime.scene.app) runtime.scene.app.renderNextFrame = true;
      status = "ready";
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
        activeState = null;
        scenario = null;
        states = deepFreeze({});
        canvas.hidden = true;
        if ("autoRender" in app) app.autoRender = false;
        app.destroy?.();
        status = "destroyed";
        return snapshot();
      });
    },
  });
}
