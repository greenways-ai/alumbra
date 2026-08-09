import { normalizeAlumbraViewportModel } from "./model.js";

export const RENDERER_WORKSPACE_FORMAT = "alumbra.renderer-workspace/1";
export const RENDERER_WORKSPACE_EVIDENCE_FORMAT = "alumbra.renderer-workspace-evidence/1";
export const RENDERER_WORKSPACE_BREAKPOINT = 880;

export const RENDERER_WORKSPACE_SURFACES = Object.freeze([
  "catalog",
  "world",
  "code",
  "execution",
  "problems",
  "repl",
]);

export const RENDERER_WORKSPACE_COMPACT_SURFACES = Object.freeze([
  "catalog",
  "world",
  "code",
  "execution",
  "problems",
]);

export const RENDERER_WORKSPACE_AUTHORITIES = Object.freeze([
  "catalog/installed-identities",
  "viewport/engine-host",
  "code/document-metadata",
  "execution/bounded-events",
  "problems/bounded-diagnostics",
  "repl/session-status",
]);

const ACTIVITY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const SURFACE_SET = new Set(RENDERER_WORKSPACE_SURFACES);
const COMPACT_SURFACE_SET = new Set(RENDERER_WORKSPACE_COMPACT_SURFACES);
const MAX_ACTIVITIES = 256;

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

const requiredString = (value, label, maximum = 256) => {
  const output = String(value ?? "").trim();
  if (!output || output.length > maximum) throw new TypeError(`${label} is invalid`);
  return output;
};

const activityId = (value, label = "Renderer Workspace activity id") => {
  const output = requiredString(value, label, 192);
  if (!ACTIVITY_ID_PATTERN.test(output)) throw new TypeError(`${label} must be a semantic package/activity identity`);
  return output;
};

const viewportWidth = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 240 || number > 16384) {
    throw new RangeError("Renderer Workspace width must be between 240 and 16384 pixels");
  }
  return number;
};

const surfaceId = (value) => {
  const output = requiredString(value, "Renderer Workspace surface id", 64);
  if (!SURFACE_SET.has(output)) throw new Error(`Unsupported Renderer Workspace surface: ${output}`);
  return output;
};

const normalizeInstalledActivities = (values) => {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_ACTIVITIES) {
    throw new TypeError(`Renderer Workspace requires one to ${MAX_ACTIVITIES} installed activity identities`);
  }
  const output = [];
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const id = activityId(value, `Renderer Workspace installed activity ${index}`);
    if (seen.has(id)) throw new Error(`Duplicate Renderer Workspace activity: ${id}`);
    seen.add(id);
    output.push(id);
  }
  return Object.freeze(output);
};

const identityFromModel = (model) => {
  const engineId = model["engine/handle"];
  if (engineId == null) throw new TypeError("Renderer Workspace viewport models require an opaque engine identity");
  return Object.freeze({
    worldId: requiredString(model["world/id"], "Renderer Workspace world identity"),
    sessionId: requiredString(model["session/id"], "Renderer Workspace session identity"),
    engineId: requiredString(engineId, "Renderer Workspace engine identity"),
  });
};

const sameIdentity = (left, right) => left.worldId === right.worldId
  && left.sessionId === right.sessionId
  && left.engineId === right.engineId;

const bindHost = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Renderer Workspace viewport factory must return a host object");
  }
  if (typeof value.update !== "function") throw new TypeError("Renderer Workspace viewport host requires update(model)");
  if (typeof value.suspend !== "function") throw new TypeError("Renderer Workspace viewport host requires suspend(reason)");
  if (typeof value.resume !== "function") throw new TypeError("Renderer Workspace viewport host requires resume(reason)");
  const destroy = typeof value.destroy === "function"
    ? value.destroy.bind(value)
    : typeof value.dispose === "function"
      ? value.dispose.bind(value)
      : null;
  if (!destroy) throw new TypeError("Renderer Workspace viewport host requires destroy() or dispose()");
  return Object.freeze({
    update: value.update.bind(value),
    suspend: value.suspend.bind(value),
    resume: value.resume.bind(value),
    destroy,
  });
};

const maybeAwait = async (value) => value;

export function createRendererWorkspaceSession({
  installedActivityIds,
  createViewportHost,
  initialSurfaceId = "world",
  initialWidth = 1180,
} = {}) {
  const installed = normalizeInstalledActivities(installedActivityIds);
  const installedSet = new Set(installed);
  if (typeof createViewportHost !== "function") {
    throw new TypeError("Renderer Workspace requires createViewportHost");
  }

  let width = viewportWidth(initialWidth);
  let layout = width < RENDERER_WORKSPACE_BREAKPOINT ? "compact" : "wide";
  let activeSurfaceId = surfaceId(initialSurfaceId);
  if (layout === "compact" && !COMPACT_SURFACE_SET.has(activeSurfaceId)) {
    throw new Error(`Renderer Workspace compact layout cannot select ${activeSurfaceId}`);
  }
  let active = null;
  let status = "idle";
  let viewportStatus = "empty";
  let destroyed = false;
  let operation = Promise.resolve();
  const counters = {
    createdHosts: 0,
    modelUpdates: 0,
    destroyedHosts: 0,
    suspendedHosts: 0,
    resumedHosts: 0,
    activitySwitches: 0,
    surfaceChanges: 0,
    layoutChanges: 0,
  };

  const visibleSurfaceIds = () => layout === "compact"
    ? RENDERER_WORKSPACE_COMPACT_SURFACES
    : RENDERER_WORKSPACE_SURFACES;

  const evidence = () => deepFreeze({
    format: RENDERER_WORKSPACE_EVIDENCE_FORMAT,
    status,
    layout,
    viewportWidth: width,
    activeSurfaceId,
    activeActivityId: active?.activityId ?? null,
    viewportStatus,
    worldId: active?.identity.worldId ?? null,
    sessionId: active?.identity.sessionId ?? null,
    engineId: active?.identity.engineId ?? null,
    worldRevision: active?.model["world/revision"] ?? null,
    installedActivityCount: installed.length,
    surfaceCount: RENDERER_WORKSPACE_SURFACES.length,
    visibleSurfaceIds: visibleSurfaceIds(),
    authorityIds: RENDERER_WORKSPACE_AUTHORITIES,
    ...counters,
  });

  const enqueue = (task) => {
    const next = operation.then(task, task);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };

  const ensureActive = () => {
    if (destroyed) throw new Error("Renderer Workspace session has been destroyed");
  };

  const destroyCurrent = async (reason) => {
    if (!active) return;
    const previous = active;
    active = null;
    viewportStatus = "empty";
    await maybeAwait(previous.host.destroy(reason));
    counters.destroyedHosts += 1;
  };

  const updateExisting = async (model) => {
    const identity = identityFromModel(model);
    if (!sameIdentity(identity, active.identity)) {
      throw new Error("Renderer Workspace model-only updates cannot replace world, session or engine identity");
    }
    await maybeAwait(active.host.update(model));
    active.model = model;
    counters.modelUpdates += 1;
    status = viewportStatus === "suspended" ? "suspended" : "active";
    return evidence();
  };

  const open = async (value, inputModel) => {
    ensureActive();
    const id = activityId(value);
    if (!installedSet.has(id)) throw new Error(`Renderer Workspace activity is not installed: ${id}`);
    const model = normalizeAlumbraViewportModel(inputModel);
    if (active?.activityId === id) return updateExisting(model);

    const hadActive = Boolean(active);
    status = hadActive ? "switching" : "opening";
    if (hadActive) {
      await destroyCurrent(`activity:${id}`);
      counters.activitySwitches += 1;
    }

    try {
      const created = await maybeAwait(createViewportHost(Object.freeze({ activityId: id, model })));
      const host = bindHost(created);
      const identity = identityFromModel(model);
      active = { activityId: id, model, identity, host };
      counters.createdHosts += 1;
      viewportStatus = "active";
      if (activeSurfaceId !== "world") {
        await maybeAwait(host.suspend(`surface:${activeSurfaceId}`));
        counters.suspendedHosts += 1;
        viewportStatus = "suspended";
      }
      status = viewportStatus === "suspended" ? "suspended" : "active";
      return evidence();
    } catch (error) {
      active = null;
      viewportStatus = "empty";
      status = "failed";
      throw error;
    }
  };

  return Object.freeze({
    format: RENDERER_WORKSPACE_FORMAT,
    supportsActivity(value) {
      try {
        return installedSet.has(activityId(value));
      } catch {
        return false;
      }
    },
    evidence,
    openActivity(value, model) {
      return enqueue(() => open(value, model));
    },
    updateModel(model) {
      return enqueue(async () => {
        ensureActive();
        if (!active) throw new Error("Renderer Workspace has no active viewport to update");
        return updateExisting(normalizeAlumbraViewportModel(model));
      });
    },
    selectSurface(value) {
      return enqueue(async () => {
        ensureActive();
        const next = surfaceId(value);
        if (layout === "compact" && !COMPACT_SURFACE_SET.has(next)) {
          throw new Error(`Renderer Workspace compact layout cannot select ${next}`);
        }
        if (next === activeSurfaceId) return evidence();
        const previous = activeSurfaceId;
        activeSurfaceId = next;
        counters.surfaceChanges += 1;
        if (active && previous === "world" && next !== "world" && viewportStatus === "active") {
          await maybeAwait(active.host.suspend(`surface:${next}`));
          counters.suspendedHosts += 1;
          viewportStatus = "suspended";
          status = "suspended";
        } else if (active && previous !== "world" && next === "world" && viewportStatus === "suspended") {
          await maybeAwait(active.host.resume(`surface:${next}`));
          counters.resumedHosts += 1;
          viewportStatus = "active";
          status = "active";
        }
        return evidence();
      });
    },
    setViewportWidth(value) {
      return enqueue(async () => {
        ensureActive();
        const nextWidth = viewportWidth(value);
        const nextLayout = nextWidth < RENDERER_WORKSPACE_BREAKPOINT ? "compact" : "wide";
        width = nextWidth;
        if (nextLayout !== layout) {
          layout = nextLayout;
          counters.layoutChanges += 1;
          if (layout === "compact" && !COMPACT_SURFACE_SET.has(activeSurfaceId)) {
            activeSurfaceId = "execution";
            counters.surfaceChanges += 1;
          }
        }
        return evidence();
      });
    },
    destroy() {
      return enqueue(async () => {
        if (destroyed) return evidence();
        status = "destroying";
        await destroyCurrent("workspace-destroyed");
        destroyed = true;
        status = "destroyed";
        viewportStatus = "empty";
        return evidence();
      });
    },
  });
}
