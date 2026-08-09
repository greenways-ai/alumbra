import { createRendererWorkspaceSession } from "@greenways/alumbra-hodos/workspace";
import {
  ENVIRONMENT_PROFILE_ACTIVITY,
  MATERIAL_MATRIX_ACTIVITY,
  MATERIAL_STATE_IDS,
  createMaterialStoryHost,
} from "./material-host.js";
import {
  CHUNK_RESIDENCY_ACTIVITY,
  createResidencyStoryHost,
} from "./residency-host.js";

export const RENDERER_WORKSPACE_ACTIVITY = "alumbra-hodos/renderer-workspace";
export const RENDERER_WORKSPACE_STORY_FORMAT = "alumbra.renderer-workspace-story/1";
export const WORKSPACE_STATE_IDS = Object.freeze({
  wide: "workspace/wide",
  compact: "workspace/compact",
});

export const WORKSPACE_RENDERER_ACTIVITIES = Object.freeze([
  MATERIAL_MATRIX_ACTIVITY,
  ENVIRONMENT_PROFILE_ACTIVITY,
  CHUNK_RESIDENCY_ACTIVITY,
]);

const WORKSPACE_STATES = new Set(Object.values(WORKSPACE_STATE_IDS));
const MATERIAL_ACTIVITIES = new Set([MATERIAL_MATRIX_ACTIVITY, ENVIRONMENT_PROFILE_ACTIVITY]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

function modelFor(activityId, generation, revision = 0, identity = null) {
  const ids = identity ?? {
    worldId: `world:workspace/${activityId}/${generation}`,
    sessionId: `session:workspace/${generation}`,
    engineId: `engine:workspace/${generation}`,
  };
  return {
    "world/id": ids.worldId,
    "session/id": ids.sessionId,
    "world/revision": revision,
    "engine/handle": ids.engineId,
    camera: {
      position: [31, 16, 27],
      rotation: [-18, 44, 0],
      fov: 58,
      nearClip: 0.05,
      farClip: 320,
    },
    status: "active",
    capabilities: { move: true, look: true },
    metadata: {
      activityId,
      packageId: activityId.split("/")[0],
      projection: "installed-semantic-identity",
    },
  };
}

function boundedRuntime(runtime) {
  if (!runtime) return null;
  const value = runtime.host.snapshot();
  return deepFreeze({
    kind: runtime.kind,
    activityId: value.activeActivity ?? null,
    status: value.status ?? "unknown",
  });
}

export function createRendererWorkspaceStoryHost({ pc, canvas } = {}) {
  if (!canvas?.addEventListener) throw new TypeError("Renderer Workspace story requires a canvas");
  let workspace = null;
  let activeRuntime = null;
  let activeState = null;
  let status = "idle";
  let proofs = deepFreeze({});
  let scenario = null;
  let generation = 0;
  let destroyed = false;
  let operation = Promise.resolve();
  const disposals = [];

  const recordDisposal = (activityId, engineId, reason, result) => {
    const entry = deepFreeze({
      activityId,
      engineId,
      reason: String(reason ?? "destroyed").slice(0, 128),
      baseline: result?.disposal?.baseline === true,
    });
    disposals.push(entry);
    return entry;
  };

  const createRuntime = async (activityId) => {
    canvas.hidden = false;
    if (MATERIAL_ACTIVITIES.has(activityId)) {
      const host = createMaterialStoryHost({ pc, canvas });
      await host.open(activityId, {
        stateId: activityId === ENVIRONMENT_PROFILE_ACTIVITY
          ? MATERIAL_STATE_IDS.daylight
          : null,
      });
      return { kind: "material", host };
    }
    if (activityId === CHUNK_RESIDENCY_ACTIVITY) {
      const host = createResidencyStoryHost({ pc, canvas });
      await host.open(activityId);
      return { kind: "residency", host };
    }
    throw new Error(`Renderer Workspace activity has no installed viewport host: ${activityId}`);
  };

  const createViewportHost = async ({ activityId, model }) => {
    const runtime = await createRuntime(activityId);
    activeRuntime = runtime;
    let currentModel = model;
    let released = false;
    return {
      update(nextModel) {
        if (released) throw new Error("Renderer Workspace viewport host has been released");
        currentModel = nextModel;
        runtime.host.resize?.();
      },
      suspend(reason) {
        if (released) return false;
        return runtime.host.suspend(reason);
      },
      resume(reason) {
        if (released) return false;
        return runtime.host.resume(reason);
      },
      async destroy(reason) {
        if (released) return;
        released = true;
        const result = await runtime.host.destroy();
        recordDisposal(activityId, currentModel["engine/handle"], reason, result);
        if (activeRuntime === runtime) activeRuntime = null;
      },
    };
  };

  const snapshot = () => deepFreeze({
    format: RENDERER_WORKSPACE_STORY_FORMAT,
    hostReady: true,
    activeActivity: workspace ? RENDERER_WORKSPACE_ACTIVITY : null,
    activeState,
    status,
    workspace: workspace?.evidence() ?? null,
    activeViewport: boundedRuntime(activeRuntime),
    proofs,
    scenario,
    disposal: {
      count: disposals.length,
      baseline: disposals.length > 0 && disposals.every((entry) => entry.baseline),
    },
  });

  const buildScenario = (selectedRendererActivity) => deepFreeze({
    selectedRendererActivity,
    lifecycle: workspace.evidence(),
    activeViewport: boundedRuntime(activeRuntime),
    disposalCount: disposals.length,
  });

  const boundedEvidence = (value) => {
    const serialized = JSON.stringify(value);
    return ["project", "shader", "source", "callback", "PlayCanvas", "mesh"]
      .every((word) => !serialized.includes(word));
  };

  const runLifecycle = async (stateId) => {
    disposals.length = 0;
    generation = 0;
    workspace = createRendererWorkspaceSession({
      installedActivityIds: WORKSPACE_RENDERER_ACTIVITIES,
      createViewportHost,
      initialSurfaceId: "world",
      initialWidth: 1280,
    });

    const materialModel = modelFor(MATERIAL_MATRIX_ACTIVITY, ++generation, 0);
    await workspace.openActivity(MATERIAL_MATRIX_ACTIVITY, materialModel);
    const beforeUpdate = workspace.evidence();
    await workspace.updateModel({ ...materialModel, "world/revision": 1 });
    const afterUpdate = workspace.evidence();

    await workspace.setViewportWidth(640);
    await workspace.selectSurface("code");
    const suspended = workspace.evidence();
    await workspace.selectSurface("world");
    const resumed = workspace.evidence();

    const residencyModel = modelFor(CHUNK_RESIDENCY_ACTIVITY, ++generation, 0);
    await workspace.openActivity(CHUNK_RESIDENCY_ACTIVITY, residencyModel);
    if (stateId === WORKSPACE_STATE_IDS.wide) await workspace.setViewportWidth(1280);
    else await workspace.setViewportWidth(640);
    const switched = workspace.evidence();

    proofs = deepFreeze({
      modelUpdatePreserved: beforeUpdate.engineId === afterUpdate.engineId
        && beforeUpdate.worldId === afterUpdate.worldId
        && beforeUpdate.sessionId === afterUpdate.sessionId
        && afterUpdate.createdHosts === 1
        && afterUpdate.modelUpdates === 1,
      hiddenWorldSuspended: suspended.viewportStatus === "suspended"
        && suspended.suspendedHosts === 1
        && suspended.engineId === beforeUpdate.engineId
        && suspended.worldId === beforeUpdate.worldId,
      resumedSameWorld: resumed.viewportStatus === "active"
        && resumed.resumedHosts === 1
        && resumed.engineId === beforeUpdate.engineId
        && resumed.worldId === beforeUpdate.worldId
        && resumed.createdHosts === 1,
      activitySwitchDisposedPrevious: switched.activitySwitches === 1
        && switched.createdHosts === 2
        && switched.destroyedHosts === 1
        && disposals.length === 1
        && disposals[0].baseline === true,
      separateAuthorities: switched.authorityIds.length === 6
        && new Set(switched.authorityIds).size === 6,
      requestedLayoutProjected: switched.layout === (stateId === WORKSPACE_STATE_IDS.wide ? "wide" : "compact")
        && switched.activeSurfaceId === "world",
      boundedEvidence: boundedEvidence(switched),
    });
    scenario = buildScenario(CHUNK_RESIDENCY_ACTIVITY);
  };

  const enqueue = (task) => {
    const next = operation.then(task, task);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };

  return Object.freeze({
    snapshot,
    open(stateId = WORKSPACE_STATE_IDS.wide) {
      return enqueue(async () => {
        if (destroyed) throw new Error("Renderer Workspace story host has been destroyed");
        const requested = String(stateId);
        if (!WORKSPACE_STATES.has(requested)) throw new Error(`Unsupported Renderer Workspace state: ${requested}`);
        status = "opening";
        if (workspace) await workspace.destroy();
        workspace = null;
        activeRuntime = null;
        activeState = requested;
        canvas.hidden = false;
        await runLifecycle(requested);
        status = "ready";
        return snapshot();
      });
    },
    selectActivity(activityId) {
      return enqueue(async () => {
        if (!workspace) throw new Error("Renderer Workspace story is not open");
        const id = String(activityId);
        const current = workspace.evidence();
        const same = current.activeActivityId === id;
        const nextModel = same
          ? modelFor(id, generation, (current.worldRevision ?? 0) + 1, {
            worldId: current.worldId,
            sessionId: current.sessionId,
            engineId: current.engineId,
          })
          : modelFor(id, ++generation, 0);
        await workspace.openActivity(id, nextModel);
        scenario = buildScenario(id);
        return snapshot();
      });
    },
    selectSurface(surfaceId) {
      return enqueue(async () => {
        if (!workspace) throw new Error("Renderer Workspace story is not open");
        await workspace.selectSurface(surfaceId);
        scenario = buildScenario(workspace.evidence().activeActivityId);
        return snapshot();
      });
    },
    setViewportWidth(value) {
      return enqueue(async () => {
        if (!workspace) throw new Error("Renderer Workspace story is not open");
        await workspace.setViewportWidth(value);
        scenario = buildScenario(workspace.evidence().activeActivityId);
        return snapshot();
      });
    },
    resize() {
      activeRuntime?.host.resize?.();
    },
    close(reason = "closed") {
      return enqueue(async () => {
        if (!workspace) return snapshot();
        status = String(reason);
        await workspace.destroy();
        workspace = null;
        activeRuntime = null;
        activeState = null;
        scenario = null;
        canvas.hidden = true;
        status = "idle";
        return snapshot();
      });
    },
    destroy() {
      return enqueue(async () => {
        if (destroyed) return snapshot();
        if (workspace) await workspace.destroy();
        workspace = null;
        activeRuntime = null;
        activeState = null;
        scenario = null;
        canvas.hidden = true;
        destroyed = true;
        status = "destroyed";
        return snapshot();
      });
    },
  });
}
