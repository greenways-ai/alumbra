import { ALUMBRA_VIEWPORT_COMPONENT_ID, normalizeAlumbraViewportModel } from "./model.js";

const viewportFactory = (options, services) => {
  const candidate = options.createViewportHost
    ?? services?.alumbra?.createViewportHost
    ?? services?.alumbraViewport?.createHost
    ?? services?.createAlumbraViewportHost;
  if (typeof candidate !== "function") {
    throw new Error("Alumbra Hodos viewport requires an injected createViewportHost service");
  }
  return candidate;
};

export function createAlumbraViewportComponentFactory(options = {}) {
  return ({ root, model, services = {}, dispatch, context = {} }) => {
    const createViewportHost = viewportFactory(options, services);
    const initialModel = normalizeAlumbraViewportModel(model);
    const host = createViewportHost({ container: root, model: initialModel, services, dispatch, context });
    if (!host || typeof host !== "object") {
      throw new TypeError("Injected createViewportHost must return an Alumbra viewport host object");
    }
    if (typeof host.update !== "function") {
      throw new TypeError("Injected Alumbra viewport host must implement update(model)");
    }
    let destroyed = false;
    host.update(initialModel, context);
    return Object.freeze({
      update(nextModel, _descriptor, nextContext = {}) {
        if (destroyed) throw new Error("Alumbra viewport host has been destroyed");
        host.update(normalizeAlumbraViewportModel(nextModel), nextContext);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (typeof host.destroy === "function") host.destroy();
        else host.dispose?.();
      },
    });
  };
}

export function registerAlumbraViewportUi(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") {
    throw new TypeError("registerAlumbraViewportUi requires a Hodos component registry");
  }
  return registry.register(ALUMBRA_VIEWPORT_COMPONENT_ID, createAlumbraViewportComponentFactory(options));
}

export const registerAlumbraHodos = registerAlumbraViewportUi;
