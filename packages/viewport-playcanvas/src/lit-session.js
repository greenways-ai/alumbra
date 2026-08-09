import {
  createPlayCanvasPrebuiltMeshRenderer,
} from "@greenways/alumbra-renderer-playcanvas";
import {
  createViewportLitRenderer,
} from "./lighting-coordinator.js";
import {
  createPlayCanvasViewportSession,
} from "./session.js";

export const LIT_VIEWPORT_SESSION_FORMAT = "alumbra.lit-viewport-session/1";

const callable = (value, label) => {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
};

export function createLitPlayCanvasViewportSession({
  rendererOptions = {},
  lightingOptions = {},
  createSession = createPlayCanvasViewportSession,
  createPrebuiltRenderer = createPlayCanvasPrebuiltMeshRenderer,
  createLitRenderer = createViewportLitRenderer,
  initialSuspended = false,
  ...sessionOptions
} = {}) {
  callable(createSession, "Lit viewport session factory");
  callable(createPrebuiltRenderer, "Lit viewport prebuilt-renderer factory");
  callable(createLitRenderer, "Lit viewport renderer factory");
  let projection = null;
  const session = createSession({
    ...sessionOptions,
    initialSuspended,
    renderer: null,
    createRenderer({ pc, app, registry, root }) {
      const prebuilt = createPrebuiltRenderer({
        pc,
        app,
        registry,
        root,
        ...rendererOptions,
      });
      projection = createLitRenderer({
        registry,
        chunks: [],
        renderer: prebuilt,
        ...lightingOptions,
      });
      if (initialSuspended) projection.suspend("initial");
      return projection;
    },
    disposeRenderer: false,
  });
  if (!projection) throw new Error("Lit viewport session did not create its projection renderer");
  let destroyed = false;
  let destroyPromise = null;

  const api = Object.create(session);
  Object.defineProperties(api, {
    format: { value: LIT_VIEWPORT_SESSION_FORMAT, enumerable: true },
    projection: { value: projection, enumerable: true },
    lighting: { value: projection.coordinator, enumerable: true },
    status: { enumerable: true, get: () => session.status },
    suspend: {
      enumerable: true,
      value(reason = "manual") {
        if (destroyed) throw new Error(`Lit viewport session ${session.id} has been destroyed`);
        const base = session.suspend(reason);
        const lighting = projection.suspend(reason);
        return Boolean(base || lighting);
      },
    },
    resume: {
      enumerable: true,
      value(reason = "manual") {
        if (destroyed) throw new Error(`Lit viewport session ${session.id} has been destroyed`);
        const lighting = projection.resume(reason);
        const base = session.resume(reason);
        return Boolean(base || lighting);
      },
    },
    project: {
      enumerable: true,
      value() {
        if (destroyed) throw new Error(`Lit viewport session ${session.id} has been destroyed`);
        return projection.project();
      },
    },
    drain: {
      enumerable: true,
      value() {
        if (destroyed) throw new Error(`Lit viewport session ${session.id} has been destroyed`);
        return projection.drain();
      },
    },
    snapshot: {
      enumerable: true,
      value() {
        return Object.freeze({
          ...session.snapshot(),
          lighting: projection.lightingEvidence(),
        });
      },
    },
    destroy: {
      enumerable: true,
      value() {
        if (destroyPromise) return destroyPromise;
        destroyed = true;
        const projectionDestroy = projection.destroy();
        session.destroy();
        destroyPromise = Promise.resolve(projectionDestroy);
        return destroyPromise;
      },
    },
  });
  return Object.freeze(api);
}
