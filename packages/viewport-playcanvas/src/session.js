import {
  createPlayCanvasVoxelRenderer,
  raycastVoxels,
} from "@greenways/alumbra-renderer-playcanvas";
import {createPlayableInput} from "./input.js";

let sessionSequence = 0;

function positiveFinite(value, fallback, label) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be positive and finite`);
  return number;
}

function nonNegativeFinite(value, fallback, label) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be non-negative and finite`);
  return number;
}

function positionOf(entity) {
  const value = entity?.getPosition?.() ?? entity?.getLocalPosition?.();
  if (!value) throw new Error("Viewport camera does not expose a position");
  return [Number(value.x), Number(value.y), Number(value.z)];
}

function forwardOf(entity) {
  const value = entity?.forward;
  if (!value) return [0, 0, -1];
  return [Number(value.x), Number(value.y), Number(value.z)];
}

function projectPlayer(camera, state, eyeHeight) {
  camera.setLocalPosition?.(
    state.position[0],
    state.position[1] + eyeHeight,
    state.position[2],
  );
  camera.setLocalEulerAngles?.(state.pitch, state.yaw, 0);
}

function defaultPickable(registry, block) {
  if (!block?.id) return false;
  const definition = registry.get(block.id);
  return !definition.empty && definition.metadata?.render?.visible !== false;
}

function rendererEvidence(renderer) {
  const value = renderer.stats?.() ?? {};
  return Object.freeze({...value});
}

function makeEntity(pc, name) {
  if (!pc || typeof pc.Entity !== "function") throw new TypeError("Viewport requires the PlayCanvas Entity API");
  return new pc.Entity(name);
}

function makeApplication(pc, canvas, graphicsDeviceOptions) {
  if (!pc || typeof pc.Application !== "function") throw new TypeError("Viewport requires the PlayCanvas Application API");
  return new pc.Application(canvas, {graphicsDeviceOptions});
}

export function createPlayCanvasViewportSession({
  sessionId = null,
  pc,
  canvas,
  world,
  player,
  controller = null,
  createController = null,
  controllerOptions = {},
  application = null,
  renderer = null,
  createRenderer = createPlayCanvasVoxelRenderer,
  createInput = createPlayableInput,
  input = null,
  inputOptions = {},
  graphicsDeviceOptions = {},
  cameraOptions = {},
  lightOptions = {},
  view = {},
  blockIds = [],
  playerBody = null,
  reach = 6,
  isPickable = null,
  actionHandler = null,
  onActionResult = () => {},
  onFrame = () => {},
  onError = () => {},
  eventTarget = globalThis.window,
  documentTarget = globalThis.document,
  autoResize = true,
  startApplication = true,
  initialSuspended = false,
  disposeApplication = application == null,
  disposeRenderer = true,
  disposeInput = input == null,
  disposeController = controller == null && createController != null,
  manageApplicationRendering = application == null,
} = {}) {
  if (!canvas?.addEventListener) throw new TypeError("Viewport requires a canvas-like event target");
  if (!world?.registry || typeof world.chunks !== "function") throw new TypeError("Viewport requires an Alumbra world runtime");
  if (!player || typeof player.advance !== "function" || !player.state) throw new TypeError("Viewport requires an Alumbra player runtime");
  if (!Array.isArray(blockIds)) throw new TypeError("Viewport blockIds must be an array");
  if (typeof onFrame !== "function" || typeof onActionResult !== "function" || typeof onError !== "function") {
    throw new TypeError("Viewport callbacks must be functions");
  }
  if (autoResize && !eventTarget?.addEventListener) throw new TypeError("Auto-resize requires an event target");

  const id = String(sessionId ?? `viewport/${++sessionSequence}`);
  if (!id) throw new TypeError("Viewport sessionId must be non-empty");
  const acceptedReach = positiveFinite(reach, 6, "Viewport reach");
  const eyeHeight = nonNegativeFinite(playerBody?.eyeHeight, 1.62, "Player eye height");
  const horizontalDistance = nonNegativeFinite(view.horizontalDistance, 3, "Horizontal view distance");
  const verticalDistance = nonNegativeFinite(view.verticalDistance, 1, "Vertical view distance");
  const app = application ?? makeApplication(pc, canvas, {
    alpha: false,
    antialias: true,
    powerPreference: "high-performance",
    ...graphicsDeviceOptions,
  });
  if (!app?.root || typeof app.root.addChild !== "function") throw new TypeError("Viewport Application requires a root graph node");

  app.setCanvasFillMode?.(pc?.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution?.(pc?.RESOLUTION_AUTO);
  if (app.scene && pc?.Color) {
    const ambient = cameraOptions.ambientLight ?? [0.34, 0.38, 0.46];
    app.scene.ambientLight = new pc.Color(...ambient);
  }
  if (startApplication) app.start?.();

  const worldRoot = makeEntity(pc, `Alumbra viewport ${id}`);
  app.root.addChild(worldRoot);
  const viewportRenderer = renderer ?? createRenderer({pc, app, registry: world.registry, root: worldRoot});
  if (!viewportRenderer || typeof viewportRenderer.setChunk !== "function") {
    throw new TypeError("Viewport renderer must implement setChunk(chunk)");
  }
  for (const chunk of world.chunks().values()) viewportRenderer.setChunk(chunk);

  const viewportController = controller ?? (createController
    ? createController({world, renderer: viewportRenderer, ...controllerOptions})
    : null);
  if (viewportController && (typeof viewportController.applyAction !== "function" || typeof viewportController.undo !== "function")) {
    throw new TypeError("Viewport controller must implement applyAction() and undo()");
  }

  const camera = makeEntity(pc, `Alumbra camera ${id}`);
  camera.addComponent?.("camera", {
    clearColor: pc?.Color ? new pc.Color(...(cameraOptions.clearColor ?? [0.36, 0.53, 0.68])) : cameraOptions.clearColor,
    fov: cameraOptions.fov ?? 66,
    nearClip: cameraOptions.nearClip ?? 0.05,
    farClip: cameraOptions.farClip ?? 300,
  });
  app.root.addChild(camera);

  const sun = makeEntity(pc, `Alumbra sun ${id}`);
  sun.addComponent?.("light", {
    type: "directional",
    color: pc?.Color ? new pc.Color(...(lightOptions.color ?? [1, 0.91, 0.73])) : lightOptions.color,
    intensity: lightOptions.intensity ?? 1.45,
    castShadows: lightOptions.castShadows ?? true,
    shadowDistance: lightOptions.shadowDistance ?? 90,
  });
  const sunEuler = lightOptions.euler ?? [48, 28, 0];
  sun.setLocalEulerAngles?.(...sunEuler);
  app.root.addChild(sun);

  const viewportInput = input ?? createInput({
    canvas,
    eventTarget,
    documentTarget,
    slotCount: Math.max(1, blockIds.length || inputOptions.slotCount || 8),
    requirePointerLock: true,
    ...inputOptions,
  });
  if (!viewportInput || typeof viewportInput.sample !== "function") {
    throw new TypeError("Viewport input must implement sample()");
  }

  const pickable = typeof isPickable === "function"
    ? isPickable
    : (block) => defaultPickable(world.registry, block);
  let status = initialSuspended ? "suspended" : "active";
  let statusReason = initialSuspended ? "initial" : "created";
  let frameSequence = 0;
  let suspensionCount = initialSuspended ? 1 : 0;
  let resumeCount = 0;
  let currentHit = null;
  let lastFrame = null;
  let disposed = false;

  const ensureActive = () => {
    if (disposed) throw new Error(`Viewport session ${id} has been destroyed`);
  };

  const setRenderActivity = (active) => {
    worldRoot.enabled = active;
    camera.enabled = active;
    sun.enabled = active;
    if (manageApplicationRendering && "autoRender" in app) app.autoRender = active;
    if (active && "renderNextFrame" in app) app.renderNextFrame = true;
  };

  const reportError = (phase, error, details = {}) => {
    try {
      onError(Object.freeze({sessionId: id, phase, error, ...details}));
    } catch {
      // Host diagnostics must not destabilize the viewport lifecycle.
    }
  };

  const defaultAction = (action) => {
    if (!viewportController) return Object.freeze({status: "unhandled", action: action.type});
    if (action.type === "undo") {
      const result = viewportController.undo();
      return result
        ? Object.freeze({status: "applied", action: action.type, result})
        : Object.freeze({status: "noop", action: action.type, reason: "empty-undo-stack"});
    }
    if (action.type !== "break" && action.type !== "place") {
      return Object.freeze({status: "unhandled", action: action.type});
    }
    if (!currentHit) {
      return Object.freeze({status: "rejected", action: action.type, reason: "no-reachable-target"});
    }
    const origin = positionOf(camera);
    const intent = {
      type: action.type,
      origin,
      hit: currentHit,
      reach: acceptedReach,
    };
    if (action.type === "place") {
      const block = blockIds[viewportInput.selectedSlot];
      if (!block) return Object.freeze({status: "rejected", action: action.type, reason: "empty-hotbar-slot"});
      intent.block = block;
      intent.playerPosition = player.state.position;
      if (playerBody) intent.playerBody = playerBody;
    }
    const result = viewportController.applyAction(intent);
    return Object.freeze({status: "applied", action: action.type, result});
  };

  const runAction = (action, frameInput) => {
    try {
      const outcome = actionHandler
        ? actionHandler(Object.freeze({
          sessionId: id,
          action,
          hit: currentHit,
          input: frameInput,
          world,
          player,
          controller: viewportController,
          renderer: viewportRenderer,
          camera,
        }))
        : defaultAction(action);
      onActionResult(Object.freeze({sessionId: id, action, outcome, error: null}));
      return outcome;
    } catch (error) {
      reportError("action", error, {action});
      onActionResult(Object.freeze({sessionId: id, action, outcome: null, error}));
      return null;
    }
  };

  const update = (delta) => {
    if (status !== "active" || disposed) return;
    try {
      const seconds = Math.max(0, Number(delta) || 0);
      const frameInput = viewportInput.sample();
      const playerFrame = player.advance(seconds, frameInput);
      projectPlayer(camera, playerFrame.state, eyeHeight);

      const position = positionOf(camera);
      const projection = viewportRenderer.setView?.({
        position,
        horizontalDistance,
        verticalDistance,
      }) ?? Object.freeze({visible: 0, total: 0});
      currentHit = raycastVoxels({
        origin: position,
        direction: forwardOf(camera),
        maxDistance: acceptedReach,
        getBlock: viewportRenderer.getBlock,
        isSolid: pickable,
      });
      viewportRenderer.setSelection?.(currentHit);
      const actions = frameInput.actions.map((action) => runAction(action, frameInput));
      frameSequence += 1;
      lastFrame = Object.freeze({
        sessionId: id,
        sequence: frameSequence,
        delta: seconds,
        input: frameInput,
        player: playerFrame.state,
        hit: currentHit,
        view: Object.freeze({...projection}),
        renderer: rendererEvidence(viewportRenderer),
        world: Object.freeze({id: world.worldId, revision: world.revision}),
        actions: Object.freeze(actions),
      });
      onFrame(lastFrame);
    } catch (error) {
      reportError("frame", error);
    }
  };
  const updateHandle = app.on?.("update", update);
  const resize = () => app.resizeCanvas?.();
  if (autoResize) eventTarget.addEventListener("resize", resize);

  projectPlayer(camera, player.state, eyeHeight);
  setRenderActivity(!initialSuspended);
  if (initialSuspended) viewportInput.suspend?.();

  return Object.freeze({
    id,
    app,
    canvas,
    world,
    player,
    controller: viewportController,
    renderer: viewportRenderer,
    input: viewportInput,
    camera,
    get status() { return status; },
    get currentHit() { return currentHit; },
    get lastFrame() { return lastFrame; },
    snapshot() {
      return Object.freeze({
        sessionId: id,
        status,
        reason: statusReason,
        frame: frameSequence,
        suspensions: suspensionCount,
        resumes: resumeCount,
        worldId: world.worldId,
        worldRevision: world.revision,
        player: player.state,
        selectedSlot: viewportInput.selectedSlot,
        renderer: rendererEvidence(viewportRenderer),
      });
    },
    resize,
    suspend(reason = "manual") {
      ensureActive();
      if (status === "suspended") return false;
      status = "suspended";
      statusReason = String(reason);
      suspensionCount += 1;
      viewportInput.suspend?.();
      viewportRenderer.setSelection?.(null);
      setRenderActivity(false);
      return true;
    },
    resume(reason = "manual") {
      ensureActive();
      if (status === "active") return false;
      status = "active";
      statusReason = String(reason);
      resumeCount += 1;
      viewportInput.resume?.();
      setRenderActivity(true);
      resize();
      return true;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      status = "destroyed";
      statusReason = "destroyed";
      if (autoResize) eventTarget.removeEventListener("resize", resize);
      updateHandle?.off?.();
      if (!updateHandle?.off) app.off?.("update", update);
      if (disposeInput) viewportInput.destroy?.();
      if (disposeController) viewportController?.destroy?.();
      if (disposeRenderer) viewportRenderer.destroy?.();
      camera.destroy?.();
      sun.destroy?.();
      worldRoot.destroy?.();
      if (disposeApplication) app.destroy?.();
    },
  });
}
