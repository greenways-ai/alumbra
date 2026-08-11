import * as pc from "playcanvas";
import {
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_WORLD,
} from "@greenways/alumbra-hara";
import {PLAYABLE_VIRTUAL_INPUT_EVENT} from "@greenways/alumbra-viewport-playcanvas/input";
import {createPeacockBallroomPreviewHost} from "./peacock-ballroom-host.js";

const body = document.body;
const canvas = document.querySelector("#peacock-ballroom-canvas");
const loading = document.querySelector("[data-ballroom-loading]");
const status = document.querySelector("[data-ballroom-status]");
const stateButtons = [...document.querySelectorAll("[data-ballroom-state]")];
const mobileControls = document.querySelector("[data-ballroom-mobile-controls]");
const mobileActionButtons = [...document.querySelectorAll("[data-ballroom-action]")];
const stats = Object.fromEntries(
  [...document.querySelectorAll("[data-ballroom-stat]")].map((node) => [node.dataset.ballroomStat, node]),
);

if (
  !body || !canvas || !loading || !status || !mobileControls
  || !stats.chunks || !stats.light || !stats.player
) {
  throw new Error("Peacock Ballroom preview is missing a required host element");
}

const touchCapable = Number(navigator.maxTouchPoints || 0) > 0
  || globalThis.matchMedia?.("(pointer: coarse)")?.matches === true
  || globalThis.matchMedia?.("(hover: none)")?.matches === true;
body.dataset.peacockBallroomInput = touchCapable ? "touch" : "desktop";

const stateSet = new Set(PEACOCK_BALLROOM_STATE_IDS);
const parameters = new URLSearchParams(location.search);
const requested = parameters.get("state") ?? PEACOCK_BALLROOM_WORLD.defaultState;
let activeState = stateSet.has(requested) ? requested : PEACOCK_BALLROOM_WORLD.defaultState;
let lastHud = 0;
let disposed = false;

function setStatus(message, {error = false} = {}) {
  status.textContent = message;
  status.dataset.error = error ? "true" : "false";
  body.dataset.peacockBallroomError = error ? "true" : "false";
}

function selectStateButton(stateId) {
  for (const button of stateButtons) {
    const selected = button.dataset.ballroomState === stateId;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.disabled = false;
  }
}

function applyEvidence(snapshot) {
  const scenario = snapshot?.scenario;
  const proofs = scenario?.proofs;
  body.dataset.peacockBallroomReady = snapshot?.status === "ready" ? "true" : "false";
  body.dataset.peacockBallroomState = snapshot?.activeState ?? activeState;
  body.dataset.peacockBallroomChunks = String(scenario?.world?.chunkCount ?? 0);
  body.dataset.peacockBallroomLighting = proofs?.sunlight === true
    && proofs?.emittedLight === true
    && proofs?.litProjection === true
    && proofs?.materialPasses === true
    ? "passed"
    : "failed";
  body.dataset.peacockBallroomLandmarks = proofs?.landmarkSet === true
    && proofs?.exactEnvelope === true
    && proofs?.crossOrigin === true
    && proofs?.safeSpawn === true
    ? "passed"
    : "failed";
  body.dataset.peacockBallroomDisposal = snapshot?.disposal?.baseline === true ? "passed" : "failed";
  stats.chunks.textContent = String(scenario?.world?.chunkCount ?? 0);
  stats.light.textContent = scenario
    ? `sun ${scenario.lighting.maximumSunlight} · lamp ${scenario.lighting.maximumEmitted}`
    : "pending";
  window.__PEACOCK_BALLROOM_PREVIEW__ = snapshot;
}

const host = createPeacockBallroomPreviewHost({
  pc,
  canvas,
  onFrame(frame) {
    const now = performance.now();
    if (now - lastHud < 100) return;
    stats.player.textContent = frame.player.position.map((entry) => entry.toFixed(1)).join(" · ");
    stats.chunks.textContent = String(frame.renderer.chunks ?? 0);
    lastHud = now;
  },
  onActionResult({action, outcome, error}) {
    if (error) {
      setStatus(`${action.type} rejected: ${error.message}`, {error: true});
      return;
    }
    if (outcome?.status === "applied") {
      setStatus(`${action.type} accepted through the canonical Core transaction and relighting path.`);
    } else if (outcome?.status === "noop") {
      setStatus("Nothing remains to undo.");
    } else if (outcome?.status === "rejected") {
      setStatus(`Cannot ${action.type}: ${String(outcome.reason).replaceAll("-", " ")}`, {error: true});
    }
  },
  onError({phase, error}) {
    console.error(`Peacock Ballroom ${phase} failed`, error);
    setStatus(`${phase} failed: ${error.message}`, {error: true});
  },
  onState({stateId, scenario}) {
    const guidance = touchCapable
      ? "drag left to move and right to look"
      : "click the world to explore";
    setStatus(`${scenario.view} · ${scenario.world.nonAirVoxels.toLocaleString()} authored voxels · ${guidance}.`);
    selectStateButton(stateId);
  },
});

function invokeMobileAction(action, button) {
  try {
    canvas.dispatchEvent(new CustomEvent(PLAYABLE_VIRTUAL_INPUT_EVENT, {
      detail: {type: action},
    }));
    button.dataset.active = "true";
  } catch (error) {
    console.error(error);
    setStatus(`Touch control failed: ${error.message}`, {error: true});
  }
}

for (const button of mobileActionButtons) {
  const action = String(button.dataset.ballroomAction ?? "");
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    invokeMobileAction(action, button);
  });
  const release = () => { button.dataset.active = "false"; };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("keydown", (event) => {
    if (event.repeat || (event.code !== "Space" && event.code !== "Enter")) return;
    event.preventDefault();
    invokeMobileAction(action, button);
  });
  button.addEventListener("keyup", release);
}
body.dataset.peacockBallroomMobileControls = "ready";

canvas.addEventListener("pointerdown", () => {
  try {
    canvas.focus({preventScroll: true});
  } catch {
    canvas.focus();
  }
});

async function openState(stateId, {replaceHistory = true} = {}) {
  const nextState = stateSet.has(stateId) ? stateId : PEACOCK_BALLROOM_WORLD.defaultState;
  activeState = nextState;
  body.dataset.peacockBallroomReady = "false";
  body.dataset.peacockBallroomState = nextState;
  loading.hidden = false;
  stateButtons.forEach((button) => { button.disabled = true; });
  setStatus(`Opening ${nextState} from the Hara-authored architectural generator…`);
  try {
    const snapshot = await host.open(nextState);
    applyEvidence(snapshot);
    selectStateButton(nextState);
    if (replaceHistory) {
      const url = new URL(location.href);
      url.searchParams.set("state", nextState);
      history.replaceState({state: nextState}, "", url);
    }
    loading.hidden = true;
    requestAnimationFrame(() => host.resize());
    return snapshot;
  } catch (error) {
    console.error(error);
    body.dataset.peacockBallroomReady = "false";
    body.dataset.peacockBallroomError = "true";
    loading.hidden = true;
    stateButtons.forEach((button) => { button.disabled = false; });
    setStatus(`Preview failed: ${error.message}`, {error: true});
    throw error;
  }
}

for (const button of stateButtons) {
  button.addEventListener("click", () => {
    void openState(button.dataset.ballroomState).catch(() => {});
  });
}

const visibility = () => {
  if (document.visibilityState === "hidden") {
    host.suspend("document-hidden");
    return;
  }
  void host.resume("document-visible").then(applyEvidence).catch((error) => {
    console.error(error);
    setStatus(`Resume failed: ${error.message}`, {error: true});
  });
};
document.addEventListener("visibilitychange", visibility);

await openState(activeState, {replaceHistory: requested !== activeState});

function destroy() {
  if (disposed) return;
  disposed = true;
  document.removeEventListener("visibilitychange", visibility);
  void host.destroy();
}
window.addEventListener("pagehide", destroy, {once: true});
