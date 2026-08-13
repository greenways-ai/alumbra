import * as pc from "playcanvas";
import {
  createPlayerRuntime,
  createWorldRuntime,
} from "@greenways/alumbra-engine";
import {
  createPlayableWorldController,
  createViewportSessionGroup,
} from "@greenways/alumbra-viewport-playcanvas";
import {
  createLabRegistry,
  generateLabChunks,
  LAB_BLOCKS,
  LAB_GENERATOR,
  LAB_PLAYER_BODY,
  LAB_SAFE_SPAWN,
  LAB_SAVE_KEY,
  LAB_WORLD_ID,
} from "./block-pack.js";
import {createOrderedJsonStore, createLocalStorageBackend} from "./ordered-store.js";
import {
  createWorldSave,
  resolveSafePlayerState,
  restoreWorldSave,
} from "./world-save.js";
import {
  PACKAGED_HARA_ACTIVITY,
  createPackagedHaraWorldHost,
} from "./packaged-hara-host.js";
import {setViewportEvidenceProvider} from "./viewport-evidence.js";

const PLAYABLE_WORLD_ACTIVITY = "alumbra-viewport-playcanvas/playable-world";
const TWO_SESSIONS_ACTIVITY = "alumbra-viewport-playcanvas/two-sessions";
const LIT_WORLD_ACTIVITY = "alumbra-viewport-playcanvas/lit-world";
const CATALOG_ACTIVITY = "alumbra-hodos/renderer-catalog";
const PEACOCK_BALLROOM_ACTIVITY = "alumbra-hara/peacock-ballroom";

const viewportGrid = document.querySelector("[data-viewport-grid]");
const canvas = document.querySelector("#alumbra-canvas");
const secondaryCanvas = document.querySelector("#alumbra-canvas-secondary");
const haraCanvas = document.querySelector("#alumbra-canvas-hara");
const packagedWorldError = document.querySelector("[data-packaged-world-error]");
const status = document.querySelector("[data-status]");
const hotbar = document.querySelector("[data-hotbar]");
const stats = Object.fromEntries(
  [...document.querySelectorAll("[data-stat]")].map((node) => [node.dataset.stat, node]),
);

if (
  !viewportGrid
  || !canvas
  || !secondaryCanvas
  || !haraCanvas
  || !packagedWorldError
  || !status
  || !hotbar
) {
  throw new Error("Alumbra lab is missing a viewport or host control");
}

function setStatus(message, {error = false} = {}) {
  status.textContent = message;
  status.dataset.error = error ? "true" : "false";
}

function memoryBackend() {
  const records = new Map();
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
}

let storageMode = "persistent";
let backend;
try {
  backend = createLocalStorageBackend();
  const probe = `${LAB_SAVE_KEY}/probe`;
  backend.setItem(probe, "ok");
  backend.removeItem(probe);
} catch {
  backend = memoryBackend();
  storageMode = "page memory";
}
const store = createOrderedJsonStore({backend, key: LAB_SAVE_KEY});
const registry = createLabRegistry();

let restored = null;
let restoreFailure = null;
try {
  const saved = await store.load();
  if (saved) {
    restored = await restoreWorldSave(saved, {
      worldId: LAB_WORLD_ID,
      generator: LAB_GENERATOR,
      registry,
    });
  }
} catch (error) {
  console.error("Alumbra save restoration failed", error);
  restoreFailure = error;
  await store.clear().catch(() => {});
}

const world = createWorldRuntime({
  registry,
  chunks: restored?.chunks ?? generateLabChunks(registry),
  missingChunkPolicy: "solid",
  worldId: LAB_WORLD_ID,
});
const safePlayer = resolveSafePlayerState({
  candidate: restored?.player ?? LAB_SAFE_SPAWN,
  fallback: LAB_SAFE_SPAWN,
  world,
  body: LAB_PLAYER_BODY,
});
const player = createPlayerRuntime({
  state: safePlayer.state,
  fixedStep: {tick: 1 / 60, maxFrame: 0.2, maxSteps: 10},
  config: {body: LAB_PLAYER_BODY},
  getBlock: world.getBlock,
  isSolid: world.isSolidBlock,
  missingSolid: true,
});

let hotbarButtons = [];
let activeHotbarInput = null;
let activePaletteKey = "";

const paletteKey = (palette) => palette.map((block) => block.id).join("\n");
const colorCss = (value) => `rgb(${value.slice(0, 3)
  .map((entry) => Math.round(Math.max(0, Math.min(1, Number(entry) || 0)) * 255))
  .join(" ")})`;

function buildHotbar(palette) {
  hotbar.replaceChildren();
  hotbarButtons = palette.map((block, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.slot = String(index);
    button.title = `${index + 1}: ${block.label}`;
    button.setAttribute("aria-label", `Select ${block.label}`);
    const swatch = document.createElement("span");
    swatch.className = "lab-hotbar-swatch";
    swatch.style.setProperty("--block-color", colorCss(block.color));
    const key = document.createElement("span");
    key.className = "lab-hotbar-key";
    key.textContent = String(index + 1);
    const label = document.createElement("span");
    label.className = "lab-hotbar-label";
    label.textContent = block.label;
    button.append(swatch, key, label);
    item.append(button);
    hotbar.append(item);
    return button;
  });
  hotbar.hidden = palette.length === 0;
}

function selectHotbar(slot) {
  hotbarButtons.forEach((button, index) => {
    button.dataset.selected = index === slot ? "true" : "false";
    button.setAttribute("aria-pressed", index === slot ? "true" : "false");
  });
}

function activatePalette(palette, input, slot = input?.selectedSlot ?? 0) {
  const nextKey = paletteKey(palette);
  if (nextKey !== activePaletteKey) {
    activePaletteKey = nextKey;
    buildHotbar(palette);
  }
  activeHotbarInput = input ?? activeHotbarInput;
  hotbar.hidden = palette.length === 0;
  selectHotbar(slot);
}

let saveSequence = restored?.saveSequence ?? 0;
let lastHud = 0;
let autosaveElapsed = 0;
let disposed = false;
let activeActivity = CATALOG_ACTIVITY;
let activePackagedState = null;
let primaryFrame = null;
let secondaryFrame = null;
let primaryViewport = null;
let secondaryViewport = null;
let packagedHara = null;
const pendingSaves = new Set();
const viewports = createViewportSessionGroup();

function queueSave(reason) {
  const controller = primaryViewport?.controller;
  if (!controller) return Promise.resolve(null);
  const requestedSequence = ++saveSequence;
  const history = controller.history();
  const controllerState = controller.state;
  const playerState = player.state;
  const promise = (async () => {
    const save = await createWorldSave({
      world,
      generator: LAB_GENERATOR,
      registry,
      player: playerState,
      journal: history.journal,
      undoStack: history.undoStack,
      saveSequence: requestedSequence,
      transactionSequence: controllerState.transactionSequence,
      worldRevision: controllerState.worldRevision,
      savedAt: new Date().toISOString(),
    });
    const result = await store.save(save, {sequence: requestedSequence});
    if (result.current) {
      stats.save.textContent = `${storageMode} · r${controllerState.worldRevision}`;
      setStatus(`Saved ${reason} at revision ${controllerState.worldRevision}`);
    }
    return result;
  })().catch((error) => {
    console.error("Alumbra save failed", error);
    setStatus(`Save failed: ${error.message}`, {error: true});
    return null;
  }).finally(() => pendingSaves.delete(promise));
  pendingSaves.add(promise);
  return promise;
}

function reportAction({action, outcome, error}, {persistent, label}) {
  if (error) {
    console.error(`Alumbra ${action.type} failed`, error);
    setStatus(`${action.type} rejected: ${error.message}`, {error: true});
    return;
  }
  if (outcome?.status === "applied") {
    setStatus(`${action.type} accepted in ${label}`);
    if (persistent) queueSave(action.type);
  } else if (outcome?.status === "noop") {
    setStatus("Nothing remains to undo");
  } else if (outcome?.status === "rejected") {
    setStatus(`Cannot ${action.type}: ${outcome.reason.replaceAll("-", " ")}`, {error: true});
  }
}

function reportViewportError({sessionId, phase, error}) {
  console.error(`Alumbra viewport ${sessionId} ${phase} failed`, error);
  setStatus(`${sessionId} ${phase} failed: ${error.message}`, {error: true});
}

function updatePrimaryHud(frame) {
  primaryFrame = frame;
  autosaveElapsed += frame.delta;
  if (autosaveElapsed >= 10) {
    autosaveElapsed = 0;
    queueSave("autosave");
  }
  const now = performance.now();
  if (now - lastHud <= 100) return;
  const controllerState = primaryViewport.controller.state;
  stats.chunks.textContent = String(frame.renderer.chunks ?? 0);
  stats.visible.textContent = String(frame.view.visible ?? 0);
  stats.quads.textContent = Number(frame.renderer.quads ?? 0).toLocaleString();
  stats.target.textContent = frame.hit ? `${frame.hit.voxel.join(",")} · ${frame.hit.face ?? "inside"}` : "none";
  stats.world.textContent = `r${controllerState.worldRevision} · ${controllerState.undoDepth} undo`;
  stats.player.textContent = frame.player.position.map((entry) => entry.toFixed(1)).join(" · ");
  lastHud = now;
}

function updatePackagedHud(frame) {
  const now = performance.now();
  if (now - lastHud <= 100) return;
  const viewport = packagedHara?.snapshot().viewport;
  stats.chunks.textContent = String(frame.renderer.chunks ?? 0);
  stats.visible.textContent = String(frame.view.visible ?? 0);
  stats.quads.textContent = Number(frame.renderer.quads ?? 0).toLocaleString();
  stats.target.textContent = frame.hit ? `${frame.hit.voxel.join(",")} · ${frame.hit.face ?? "inside"}` : "none";
  stats.world.textContent = `${activePackagedState ?? "world"} · r${frame.world.revision}`;
  stats.player.textContent = frame.player.position.map((entry) => entry.toFixed(1)).join(" · ");
  stats.save.textContent = viewport ? "exact lock · immutable state" : "exact lock";
  lastHud = now;
}

primaryViewport = viewports.create("primary", {
  pc,
  canvas,
  world,
  player,
  createController: createPlayableWorldController,
  controllerOptions: {
    journal: restored?.journal ?? [],
    undoStack: restored?.undoStack ?? [],
    transactionSequence: restored?.transactionSequence ?? 0,
    worldRevision: restored?.worldRevision ?? 0,
  },
  blockIds: LAB_BLOCKS.map((block) => block.id),
  playerBody: LAB_PLAYER_BODY,
  inputOptions: {
    initialSlot: 0,
    onSelectionChange: selectHotbar,
  },
  onFrame: updatePrimaryHud,
  onActionResult: (event) => reportAction(event, {persistent: true, label: "the persistent world"}),
  onError: reportViewportError,
});
activatePalette(LAB_BLOCKS, primaryViewport.input, primaryViewport.input.selectedSlot);

const hotbarClick = (event) => {
  const button = event.target.closest?.("button[data-slot]");
  if (button) activeHotbarInput?.select(Number(button.dataset.slot));
};
hotbar.addEventListener("click", hotbarClick);

function ensureSecondaryViewport() {
  if (secondaryViewport) return secondaryViewport;
  const secondaryWorld = createWorldRuntime({
    registry,
    chunks: generateLabChunks(registry),
    missingChunkPolicy: "solid",
    worldId: `${LAB_WORLD_ID}-secondary`,
  });
  const secondaryPlayer = createPlayerRuntime({
    state: {
      ...LAB_SAFE_SPAWN,
      position: [9.5, 12, 22.5],
      velocity: [0, 0, 0],
      yaw: -12,
      pitch: -18,
    },
    fixedStep: {tick: 1 / 60, maxFrame: 0.2, maxSteps: 10},
    config: {body: LAB_PLAYER_BODY},
    getBlock: secondaryWorld.getBlock,
    isSolid: secondaryWorld.isSolidBlock,
    missingSolid: true,
  });
  secondaryViewport = viewports.create("secondary", {
    pc,
    canvas: secondaryCanvas,
    world: secondaryWorld,
    player: secondaryPlayer,
    createController: createPlayableWorldController,
    blockIds: LAB_BLOCKS.map((block) => block.id),
    playerBody: LAB_PLAYER_BODY,
    inputOptions: {initialSlot: 1},
    initialSuspended: true,
    onFrame: (frame) => {
      secondaryFrame = frame;
      secondaryCanvas.dataset.worldRevision = String(frame.world.revision);
    },
    onActionResult: (event) => reportAction(event, {persistent: false, label: "the secondary world"}),
    onError: reportViewportError,
  });
  return secondaryViewport;
}

packagedHara = await createPackagedHaraWorldHost({
  pc,
  canvas: haraCanvas,
  errorPanel: packagedWorldError,
  viewports,
  playerBody: LAB_PLAYER_BODY,
  onFrame: updatePackagedHud,
  onActionResult: (event) => reportAction(event, {persistent: false, label: "the packaged Hara world"}),
  onError: reportViewportError,
  onPalette: ({palette, input, slot}) => {
    if (input) activatePalette(palette, input, slot);
    else selectHotbar(slot);
  },
  onState: ({stateId, status: stateStatus, result}) => {
    if (!stateId) return;
    if (stateStatus === "rejected") {
      setStatus(`${stateId}: ${result.evidence.error.message}`);
    } else {
      setStatus(`${stateId} materialized from its exact Hara package and generator lock.`);
    }
  },
});

function resizeViewports() {
  primaryViewport.resize();
  secondaryViewport?.resize();
  packagedHara.resize();
}

function showActivity(activityId, {
  announce = true,
  stateId = null,
} = {}) {
  if (![
    PLAYABLE_WORLD_ACTIVITY,
    TWO_SESSIONS_ACTIVITY,
    LIT_WORLD_ACTIVITY,
    CATALOG_ACTIVITY,
    PACKAGED_HARA_ACTIVITY,
    PEACOCK_BALLROOM_ACTIVITY,
  ].includes(activityId)) {
    return false;
  }
  activeActivity = activityId;

  if (activityId === PEACOCK_BALLROOM_ACTIVITY) {
    packagedHara.close(`activity:${activityId}`);
    activePackagedState = null;
    primaryViewport.suspend(`activity:${activityId}`);
    secondaryViewport?.suspend(`activity:${activityId}`);
    canvas.hidden = true;
    secondaryCanvas.hidden = true;
    haraCanvas.hidden = true;
    packagedWorldError.hidden = true;
    hotbar.hidden = true;
    viewportGrid.dataset.mode = "peacock-ballroom";
    document.body.dataset.viewportMode = "peacock-ballroom";
    return true;
  }

  if (activityId === LIT_WORLD_ACTIVITY) {
    packagedHara.close(`activity:${activityId}`);
    activePackagedState = null;
    primaryViewport.suspend(`activity:${activityId}`);
    secondaryViewport?.suspend(`activity:${activityId}`);
    canvas.hidden = true;
    secondaryCanvas.hidden = true;
    haraCanvas.hidden = true;
    packagedWorldError.hidden = true;
    hotbar.hidden = true;
    viewportGrid.dataset.mode = "lit-world";
    document.body.dataset.viewportMode = "lit-world";
    return true;
  }

  if (activityId === PACKAGED_HARA_ACTIVITY) {
    primaryViewport.suspend(`activity:${activityId}`);
    secondaryViewport?.suspend(`activity:${activityId}`);
    canvas.hidden = true;
    secondaryCanvas.hidden = true;
    activePackagedState = stateId ?? packagedHara.stateIds.defaultSeed;
    const result = packagedHara.open(activePackagedState);
    if (result.status === "rejected") {
      viewportGrid.dataset.mode = "error";
      document.body.dataset.viewportMode = "error";
      hotbar.hidden = true;
    } else {
      viewportGrid.dataset.mode = "hara";
      document.body.dataset.viewportMode = "hara";
      hotbar.hidden = false;
      if (announce) setStatus(`${activePackagedState} opened through the packaged Hara world host.`);
    }
    requestAnimationFrame(resizeViewports);
    return true;
  }

  packagedHara.close(`activity:${activityId}`);
  activePackagedState = null;
  haraCanvas.hidden = true;
  canvas.hidden = false;
  packagedWorldError.hidden = true;
  activatePalette(LAB_BLOCKS, primaryViewport.input, primaryViewport.input.selectedSlot);
  primaryViewport.resume(`activity:${activityId}`);
  if (activityId === TWO_SESSIONS_ACTIVITY) {
    const secondary = ensureSecondaryViewport();
    secondaryCanvas.hidden = false;
    viewportGrid.dataset.mode = "two";
    document.body.dataset.viewportMode = "two";
    secondary.resume(`activity:${activityId}`);
    if (announce) setStatus("Two independent viewport sessions are active; click either world to control it.");
  } else {
    secondaryViewport?.suspend(`activity:${activityId}`);
    secondaryCanvas.hidden = true;
    viewportGrid.dataset.mode = "single";
    document.body.dataset.viewportMode = "single";
    if (announce && activityId === PLAYABLE_WORLD_ACTIVITY) {
      setStatus("Reusable packaged viewport opened with the persistent canonical world.");
    }
  }
  requestAnimationFrame(resizeViewports);
  return true;
}

const openDemo = (event) => showActivity(event.detail?.activityId, {
  stateId: event.detail?.stateId ?? null,
});
window.addEventListener("alumbra:open-demo", openDemo);

const visibility = () => {
  if (document.visibilityState === "hidden") {
    for (const id of viewports.ids()) viewports.suspend(id, "document-hidden");
    queueSave("visibility change");
    return;
  }
  showActivity(activeActivity, {
    announce: false,
    stateId: activePackagedState,
  });
};
document.addEventListener("visibilitychange", visibility);

const clearEvidence = setViewportEvidenceProvider(() => Object.freeze({
  activeActivity,
  activePackagedState,
  mode: viewportGrid.dataset.mode ?? "single",
  sessions: viewports.snapshot(),
  primaryFrame: primaryFrame?.sequence ?? 0,
  secondaryFrame: secondaryFrame?.sequence ?? 0,
  packagedWorld: packagedHara.snapshot(),
}));

stats.save.textContent = restored ? `${storageMode} · restored` : `${storageMode} · new`;
setStatus(restored
  ? `Restored revision ${restored.worldRevision}${safePlayer.restored ? "" : `; player moved up ${safePlayer.rise} blocks for safety`}`
  : restoreFailure
    ? `Rejected an invalid save and started a new world: ${restoreFailure.message}`
    : `New deterministic world · click to play · ${storageMode} saves`,
{error: Boolean(restoreFailure)});
showActivity(CATALOG_ACTIVITY, {announce: false});

function destroy() {
  if (disposed) return;
  disposed = true;
  queueSave("page exit");
  window.removeEventListener("alumbra:open-demo", openDemo);
  document.removeEventListener("visibilitychange", visibility);
  hotbar.removeEventListener("click", hotbarClick);
  clearEvidence();
  void packagedHara.destroy();
  viewports.destroy();
  Promise.allSettled([...pendingSaves]).finally(() => store.destroy());
}
window.addEventListener("pagehide", destroy, {once: true});