import {
  createPlayerRuntime,
  createWorldRuntime,
} from "@greenways/alumbra-engine";
import {
  PACKAGED_WORLD_STATE_IDS,
  PACKAGED_WORLD_STATES,
  createFixturePackagedWorldSession,
  loadPackagedHaraWorld,
  packagedWorldState,
} from "@greenways/alumbra-hara";
import {createPlayableWorldController} from "@greenways/alumbra-viewport-playcanvas";

export const PACKAGED_HARA_ACTIVITY = "alumbra-hara/packaged-height-field";

const paletteFrom = (registry) => Object.freeze(registry.definitions
  .filter((definition) => !definition.empty)
  .map((definition) => Object.freeze({
    id: definition.id,
    label: definition.metadata?.label ?? definition.id.split("/").at(-1),
    color: Object.freeze([...(definition.metadata?.render?.color ?? [0.62, 0.67, 0.72])]),
  })));

const releasedRenderer = (renderer) => {
  const stats = renderer?.stats?.() ?? {};
  return stats.chunks === 0
    && stats.meshPool?.resources === 0
    && stats.meshPool?.references === 0
    && stats.materialPool?.resources === 0
    && stats.materialPool?.references === 0;
};

export async function createPackagedHaraWorldHost({
  pc,
  canvas,
  errorPanel,
  viewports,
  playerBody,
  onFrame = () => {},
  onActionResult = () => {},
  onError = () => {},
  onPalette = () => {},
  onState = () => {},
} = {}) {
  if (!canvas?.addEventListener || !errorPanel || !viewports?.create) {
    throw new TypeError("Packaged Hara host requires a canvas, error panel and viewport session group");
  }
  const session = createFixturePackagedWorldSession();
  const results = new Map();
  for (const state of Object.values(PACKAGED_WORLD_STATES)) {
    results.set(state.id, await loadPackagedHaraWorld({session, state}));
  }

  let activeState = null;
  let activeViewport = null;
  let activeResult = null;
  let frame = null;
  let disposals = 0;
  let disposalBaseline = false;
  let destroyed = false;

  const ensureActive = () => {
    if (destroyed) throw new Error("Packaged Hara host has been destroyed");
  };

  const removeViewport = () => {
    if (!activeViewport) return false;
    const renderer = activeViewport.renderer;
    viewports.remove("hara", {destroy: true});
    activeViewport = null;
    frame = null;
    disposals += 1;
    disposalBaseline = releasedRenderer(renderer) && !viewports.has("hara");
    return true;
  };

  const createViewport = (result, {initialSuspended = false, publishPalette = true} = {}) => {
    const world = createWorldRuntime({
      registry: result.registry,
      chunks: result.chunks,
      missingChunkPolicy: "solid",
      worldId: result.worldId,
    });
    const player = createPlayerRuntime({
      state: result.spawn,
      fixedStep: {tick: 1 / 60, maxFrame: 0.2, maxSteps: 10},
      config: {body: playerBody},
      getBlock: world.getBlock,
      isSolid: world.isSolidBlock,
      missingSolid: true,
    });
    const palette = paletteFrom(result.registry);
    let viewport = null;
    viewport = viewports.create("hara", {
      pc,
      canvas,
      world,
      player,
      createController: createPlayableWorldController,
      blockIds: palette.map((block) => block.id),
      playerBody,
      initialSuspended,
      inputOptions: {
        initialSlot: 0,
        onSelectionChange: (slot) => onPalette({palette, input: viewport?.input ?? null, slot}),
      },
      onFrame: (value) => {
        frame = value;
        onFrame(value);
      },
      onActionResult,
      onError,
    });
    if (publishPalette) onPalette({palette, input: viewport.input, slot: viewport.input.selectedSlot});
    return viewport;
  };

  // Exercise the complete GPU/session disposal path once before exposing the story.
  activeViewport = createViewport(results.get(PACKAGED_WORLD_STATE_IDS.defaultSeed), {
    initialSuspended: true,
    publishPalette: false,
  });
  removeViewport();

  const showError = (result) => {
    const error = result.evidence.error;
    errorPanel.hidden = false;
    errorPanel.dataset.errorCode = error.code;
    const title = errorPanel.querySelector?.("[data-packaged-world-error-title]");
    const message = errorPanel.querySelector?.("[data-packaged-world-error-message]");
    if (title) title.textContent = "Exact package lock rejected this world";
    if (message) message.textContent = error.message;
  };

  const hideError = () => {
    errorPanel.hidden = true;
    delete errorPanel.dataset.errorCode;
  };

  const snapshot = () => {
    const stateEvidence = Object.freeze(Object.fromEntries([...results].map(([id, result]) => [id, result.evidence])));
    return Object.freeze({
      activityId: PACKAGED_HARA_ACTIVITY,
      activeState,
      status: activeResult?.status ?? "closed",
      active: activeResult?.evidence ?? null,
      states: stateEvidence,
      viewport: activeViewport?.snapshot() ?? null,
      frame: frame?.sequence ?? 0,
      disposal: Object.freeze({count: disposals, baseline: disposalBaseline}),
      provider: session.snapshot(),
    });
  };

  return Object.freeze({
    stateIds: PACKAGED_WORLD_STATE_IDS,
    open(stateId = PACKAGED_WORLD_STATE_IDS.defaultSeed) {
      ensureActive();
      const state = packagedWorldState(stateId);
      const result = results.get(state.id);
      if (activeState === state.id && activeResult === result) {
        if (activeViewport?.status === "suspended") activeViewport.resume(`state:${state.id}`);
        canvas.hidden = result.status !== "ready";
        if (result.status === "rejected") showError(result);
        else hideError();
        return snapshot();
      }
      removeViewport();
      activeState = state.id;
      activeResult = result;
      if (result.status === "rejected") {
        canvas.hidden = true;
        showError(result);
        onState(Object.freeze({stateId: state.id, status: "rejected", result}));
        return snapshot();
      }
      hideError();
      canvas.hidden = false;
      activeViewport = createViewport(result);
      onState(Object.freeze({stateId: state.id, status: "ready", result}));
      return snapshot();
    },
    close(reason = "closed") {
      ensureActive();
      removeViewport();
      canvas.hidden = true;
      hideError();
      activeState = null;
      activeResult = null;
      onState(Object.freeze({stateId: null, status: reason, result: null}));
    },
    suspend(reason = "suspended") {
      ensureActive();
      if (activeViewport?.status === "active") activeViewport.suspend(reason);
    },
    resume(reason = "resumed") {
      ensureActive();
      if (activeViewport?.status === "suspended") activeViewport.resume(reason);
    },
    resize() {
      ensureActive();
      activeViewport?.resize();
    },
    snapshot,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      removeViewport();
      canvas.hidden = true;
      hideError();
      await session.dispose();
    },
  });
}
