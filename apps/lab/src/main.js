import * as pc from "playcanvas";
import {
  createPlayerRuntime,
  createWorldRuntime,
} from "../../../packages/engine/src/index.js";
import {
  createPlayCanvasVoxelRenderer,
  raycastVoxels,
} from "../../../packages/renderer-playcanvas/src/index.js";
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
import {createPlayableInput} from "./playable-input.js";
import {createPlayableWorldController} from "./playable-world.js";
import {
  createWorldSave,
  resolveSafePlayerState,
  restoreWorldSave,
} from "./world-save.js";

const canvas = document.querySelector("#alumbra-canvas");
const status = document.querySelector("[data-status]");
const hotbar = document.querySelector("[data-hotbar]");
const stats = Object.fromEntries(
  [...document.querySelectorAll("[data-stat]")].map((node) => [node.dataset.stat, node]),
);

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

const app = new pc.Application(canvas, {
  graphicsDeviceOptions: {
    alpha: false,
    antialias: true,
    powerPreference: "high-performance",
  },
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.34, 0.38, 0.46);
app.start();

const worldRoot = new pc.Entity("Alumbra voxel world", app);
app.root.addChild(worldRoot);
const renderer = createPlayCanvasVoxelRenderer({pc, app, registry, root: worldRoot});
for (const chunk of world.chunks().values()) renderer.setChunk(chunk);

const camera = new pc.Entity("Alumbra player camera", app);
camera.addComponent("camera", {
  clearColor: new pc.Color(0.36, 0.53, 0.68),
  fov: 66,
  nearClip: 0.05,
  farClip: 300,
});
app.root.addChild(camera);

const sun = new pc.Entity("Alumbra lab sun", app);
sun.addComponent("light", {
  type: "directional",
  color: new pc.Color(1, 0.91, 0.73),
  intensity: 1.45,
  castShadows: true,
  shadowDistance: 90,
});
sun.setLocalEulerAngles(48, 28, 0);
app.root.addChild(sun);

const controller = createPlayableWorldController({
  world,
  renderer,
  journal: restored?.journal ?? [],
  undoStack: restored?.undoStack ?? [],
  transactionSequence: restored?.transactionSequence ?? 0,
  worldRevision: restored?.worldRevision ?? 0,
});

const hotbarButtons = LAB_BLOCKS.map((block, index) => {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.slot = String(index);
  button.title = `${index + 1}: ${block.label}`;
  button.setAttribute("aria-label", `Select ${block.label}`);
  const swatch = document.createElement("span");
  swatch.className = "lab-hotbar-swatch";
  swatch.style.setProperty("--block-color", `rgb(${block.color.slice(0, 3).map((entry) => Math.round(entry * 255)).join(" ")})`);
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

function selectHotbar(slot) {
  hotbarButtons.forEach((button, index) => {
    button.dataset.selected = index === slot ? "true" : "false";
    button.setAttribute("aria-pressed", index === slot ? "true" : "false");
  });
}

const input = createPlayableInput({
  canvas,
  eventTarget: window,
  documentTarget: document,
  initialSlot: 0,
  onSelectionChange: selectHotbar,
});
const hotbarClick = (event) => {
  const button = event.target.closest?.("button[data-slot]");
  if (button) input.select(Number(button.dataset.slot));
};
hotbar.addEventListener("click", hotbarClick);

const isPickable = (block) => {
  const definition = registry.get(block.id);
  return !definition.empty && definition.metadata?.render?.visible !== false;
};

let saveSequence = restored?.saveSequence ?? 0;
let visible = 0;
let currentHit = null;
let lastHud = 0;
let autosaveElapsed = 0;
let disposed = false;
const pendingSaves = new Set();

function queueSave(reason) {
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

function applyAction(action) {
  if (action.type === "undo") {
    const result = controller.undo();
    if (!result) {
      setStatus("Nothing remains to undo");
      return;
    }
    queueSave("undo");
    return;
  }
  if (!currentHit) {
    setStatus(`Cannot ${action.type}: no reachable block is selected`, {error: true});
    return;
  }
  const cameraPosition = camera.getPosition();
  const intent = {
    type: action.type,
    origin: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
    hit: currentHit,
    reach: 6,
  };
  if (action.type === "place") {
    intent.block = LAB_BLOCKS[input.selectedSlot].id;
    intent.playerPosition = player.state.position;
    intent.playerBody = LAB_PLAYER_BODY;
  }
  controller.applyAction(intent);
  queueSave(action.type);
}

function projectPlayer(state) {
  camera.setLocalPosition(
    state.position[0],
    state.position[1] + LAB_PLAYER_BODY.eyeHeight,
    state.position[2],
  );
  camera.setLocalEulerAngles(state.pitch, state.yaw, 0);
}
projectPlayer(player.state);

const update = (delta) => {
  const frameInput = input.sample();
  const frame = player.advance(delta, frameInput);
  projectPlayer(frame.state);

  const position = camera.getPosition();
  const view = renderer.setView({
    position: [position.x, position.y, position.z],
    horizontalDistance: 3,
    verticalDistance: 1,
  });
  visible = view.visible;

  const forward = camera.forward;
  currentHit = raycastVoxels({
    origin: [position.x, position.y, position.z],
    direction: [forward.x, forward.y, forward.z],
    maxDistance: 6,
    getBlock: renderer.getBlock,
    isSolid: isPickable,
  });
  renderer.setSelection(currentHit);

  for (const action of frameInput.actions) {
    try {
      applyAction(action);
    } catch (error) {
      console.error(`Alumbra ${action.type} failed`, error);
      setStatus(`${action.type} rejected: ${error.message}`, {error: true});
    }
  }

  autosaveElapsed += Math.max(0, Number(delta) || 0);
  if (autosaveElapsed >= 10) {
    autosaveElapsed = 0;
    queueSave("autosave");
  }

  const now = performance.now();
  if (now - lastHud > 100) {
    const projection = renderer.stats();
    const state = controller.state;
    stats.chunks.textContent = String(projection.chunks);
    stats.visible.textContent = String(visible);
    stats.quads.textContent = projection.quads.toLocaleString();
    stats.target.textContent = currentHit ? `${currentHit.voxel.join(",")} · ${currentHit.face ?? "inside"}` : "none";
    stats.world.textContent = `r${state.worldRevision} · ${state.undoDepth} undo`;
    stats.player.textContent = `${frame.state.position.map((entry) => entry.toFixed(1)).join(" · ")}`;
    lastHud = now;
  }
};
app.on("update", update);

const resize = () => app.resizeCanvas();
window.addEventListener("resize", resize);
const visibility = () => {
  if (document.visibilityState === "hidden") queueSave("visibility change");
};
document.addEventListener("visibilitychange", visibility);

stats.save.textContent = restored ? `${storageMode} · restored` : `${storageMode} · new`;
setStatus(restored
  ? `Restored revision ${restored.worldRevision}${safePlayer.restored ? "" : `; player moved up ${safePlayer.rise} blocks for safety`}`
  : restoreFailure
    ? `Rejected an invalid save and started a new world: ${restoreFailure.message}`
    : `New deterministic world · click to play · ${storageMode} saves`,
{error: Boolean(restoreFailure)});

function destroy() {
  if (disposed) return;
  disposed = true;
  queueSave("page exit");
  window.removeEventListener("resize", resize);
  document.removeEventListener("visibilitychange", visibility);
  hotbar.removeEventListener("click", hotbarClick);
  app.off("update", update);
  input.destroy();
  controller.destroy();
  renderer.destroy();
  app.destroy();
  Promise.allSettled([...pendingSaves]).finally(() => store.destroy());
}
window.addEventListener("pagehide", destroy, {once: true});
