import * as pc from "playcanvas";
import {
  PEACOCK_BALLROOM_STATE_IDS,
  PEACOCK_BALLROOM_WORLD,
} from "@greenways/alumbra-hara";
import {createLitPlayCanvasViewportSession} from "@greenways/alumbra-viewport-playcanvas";
import {PLAYABLE_VIRTUAL_INPUT_EVENT} from "@greenways/alumbra-viewport-playcanvas/input";
import {createPeacockBallroomArchitecturalProjection} from "./peacock-ballroom-architecture.js";
import {createPeacockBallroomPreviewHost} from "./peacock-ballroom-host.js";

const root = document.documentElement;
const body = document.body;
const canvas = document.querySelector("#peacock-ballroom-canvas");
const loading = document.querySelector("[data-ballroom-loading]");
const status = document.querySelector("[data-ballroom-status]");
const topbar = document.querySelector(".ballroom-topbar");
const titleDescription = document.querySelector(".ballroom-title p:last-child");
const stateButtons = [...document.querySelectorAll("[data-ballroom-state]")];
const mobileControls = document.querySelector("[data-ballroom-mobile-controls]");
const mobileActionButtons = [...document.querySelectorAll("[data-ballroom-action]")];
const targetActionButtons = mobileActionButtons.filter((button) => (
  button.dataset.ballroomAction === "break" || button.dataset.ballroomAction === "place"
));
const stats = Object.fromEntries(
  [...document.querySelectorAll("[data-ballroom-stat]")].map((node) => [node.dataset.ballroomStat, node]),
);

if (
  !root || !body || !canvas || !loading || !status || !topbar || !titleDescription || !mobileControls
  || !stats.chunks || !stats.light || !stats.player
) {
  throw new Error("Peacock Ballroom preview is missing a required host element");
}

const detectedTouch = Number(navigator.maxTouchPoints || 0) > 0
  || globalThis.matchMedia?.("(pointer: coarse)")?.matches === true
  || globalThis.matchMedia?.("(hover: none)")?.matches === true;
const touchCapable = root.dataset.peacockBallroomInput === "touch" || detectedTouch;
const architectureProfile = touchCapable ? "mobile" : "desktop";
root.dataset.peacockBallroomInput = touchCapable ? "touch" : "desktop";
body.dataset.peacockBallroomInput = touchCapable ? "touch" : "desktop";
body.dataset.peacockBallroomArchitecture = "pending";
body.dataset.peacockBallroomArchitectureProfile = architectureProfile;
body.dataset.peacockBallroomArchitectureEntities = "0";

const stateSet = new Set(PEACOCK_BALLROOM_STATE_IDS);
const parameters = new URLSearchParams(location.search);
const requested = parameters.get("state") ?? PEACOCK_BALLROOM_WORLD.defaultState;
let activeState = stateSet.has(requested) ? requested : PEACOCK_BALLROOM_WORLD.defaultState;
let lastHud = 0;
let disposed = false;
let runtimeFault = false;

function clearRuntimeFault() {
  runtimeFault = false;
  status.dataset.error = "false";
  if (root.dataset.peacockBallroomPageError !== "true") {
    body.dataset.peacockBallroomError = "false";
  }
}

function setStatus(message, {tone = "neutral", fault = false} = {}) {
  status.textContent = message;
  status.dataset.tone = tone;
  status.dataset.error = fault ? "true" : "false";
  if (fault) {
    runtimeFault = true;
    body.dataset.peacockBallroomError = "true";
  } else if (!runtimeFault && root.dataset.peacockBallroomPageError !== "true") {
    body.dataset.peacockBallroomError = "false";
  }
}

function setTargetAvailability(hit) {
  const available = hit != null;
  body.dataset.peacockBallroomTarget = available ? "ready" : "none";
  for (const button of targetActionButtons) {
    button.disabled = !available;
    button.setAttribute("aria-disabled", available ? "false" : "true");
    button.title = available
      ? `${button.textContent.trim()} the targeted block`
      : "Aim the crosshair at a nearby block first";
  }
}

function actionFeedback(action, outcome) {
  const type = String(action?.type ?? "action");
  const reason = String(outcome?.reason ?? "");
  if (reason === "no-reachable-target" && type === "break") {
    return "Aim the crosshair at a nearby block, then tap Break.";
  }
  if (reason === "no-reachable-target" && type === "place") {
    return "Aim the crosshair at a nearby surface, then tap Place.";
  }
  if (reason === "empty-undo-stack" || outcome?.status === "noop") {
    return "Nothing has been changed yet, so there is nothing to undo.";
  }
  const readableReason = reason ? reason.replaceAll("-", " ") : "not available here";
  return `${type[0]?.toUpperCase() ?? "A"}${type.slice(1)} is ${readableReason}.`;
}

function verifyMobileLayout() {
  if (!touchCapable) {
    body.dataset.peacockBallroomMobileLayout = "not-applicable";
    return true;
  }
  const controlsVisible = getComputedStyle(mobileControls).display !== "none";
  const descriptionHidden = getComputedStyle(titleDescription).display === "none";
  const topbarHeight = topbar.getBoundingClientRect().height;
  const compactTopbar = topbarHeight > 0 && topbarHeight < Math.max(190, innerHeight * 0.34);
  const passed = controlsVisible && descriptionHidden && compactTopbar;
  body.dataset.peacockBallroomMobileLayout = passed ? "passed" : "failed";
  if (!passed) {
    setStatus("Touch controls could not be displayed. Reload the page to retry the mobile layout.", {
      tone: "error",
      fault: true,
    });
  }
  return passed;
}

function selectStateButton(stateId) {
  for (const button of stateButtons) {
    const selected = button.dataset.ballroomState === stateId;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.disabled = false;
  }
}

function applyArchitectureEvidence(evidence) {
  window.__PEACOCK_BALLROOM_ARCHITECTURE__ = evidence;
  body.dataset.peacockBallroomArchitecture = evidence.status === "ready" ? "passed" : evidence.status;
  body.dataset.peacockBallroomArchitectureProfile = evidence.profile;
  body.dataset.peacockBallroomArchitectureEntities = String(evidence.entities);
}

function createArchitecturalSession(options) {
  const session = createLitPlayCanvasViewportSession(options);
  if (String(options?.sessionId ?? "").endsWith("/probe")) return session;

  const architecture = createPeacockBallroomArchitecturalProjection({
    pc,
    app: session.app,
    profile: architectureProfile,
  });
  if (options?.initialSuspended) architecture.suspend("initial");
  applyArchitectureEvidence(architecture.evidence());
  let destroyPromise = null;
  const api = Object.create(session);
  Object.defineProperties(api, {
    architecture: {value: architecture, enumerable: true},
    suspend: {
      enumerable: true,
      value(reason = "manual") {
        const base = session.suspend(reason);
        const ornamental = architecture.suspend(reason);
        applyArchitectureEvidence(architecture.evidence());
        return Boolean(base || ornamental);
      },
    },
    resume: {
      enumerable: true,
      value(reason = "manual") {
        const base = session.resume(reason);
        const ornamental = architecture.resume(reason);
        applyArchitectureEvidence(architecture.evidence());
        return Boolean(base || ornamental);
      },
    },
    snapshot: {
      enumerable: true,
      value() {
        return Object.freeze({
          ...session.snapshot(),
          architecture: architecture.evidence(),
        });
      },
    },
    destroy: {
      enumerable: true,
      value() {
        if (destroyPromise) return destroyPromise;
        const architectureEvidence = architecture.destroy();
        window.__PEACOCK_BALLROOM_ARCHITECTURE_DISPOSAL__ = architectureEvidence;
        destroyPromise = Promise.resolve(session.destroy());
        return destroyPromise;
      },
    },
  });
  return Object.freeze(api);
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

setTargetAvailability(null);

const host = createPeacockBallroomPreviewHost({
  pc,
  canvas,
  createSession: createArchitecturalSession,
  onFrame(frame) {
    setTargetAvailability(frame.hit);
    const now = performance.now();
    if (now - lastHud < 100) return;
    stats.player.textContent = frame.player.position.map((entry) => entry.toFixed(1)).join(" · ");
    stats.chunks.textContent = String(frame.renderer.chunks ?? 0);
    lastHud = now;
  },
  onActionResult({action, outcome, error}) {
    if (error) {
      setStatus(`${action.type} failed: ${error.message}`, {tone: "error", fault: true});
      return;
    }
    if (outcome?.status === "applied") {
      setStatus(`${action.type} applied.`, {tone: "success"});
    } else if (outcome?.status === "noop" || outcome?.status === "rejected") {
      setStatus(actionFeedback(action, outcome), {tone: "hint"});
    }
  },
  onError({phase, error}) {
    console.error(`Peacock Ballroom ${phase} failed`, error);
    setStatus(`${phase} failed: ${error.message}`, {tone: "error", fault: true});
  },
  onState({stateId, scenario}) {
    const guidance = touchCapable
      ? "drag left to move and right to look"
      : "click the world to explore";
    const architecture = window.__PEACOCK_BALLROOM_ARCHITECTURE__;
    const surfaces = architecture?.entities ?? 0;
    setStatus(`${scenario.view} · ${surfaces} smooth ornamental surfaces over the canonical editable world · ${guidance}.`);
    selectStateButton(stateId);
  },
});

function invokeMobileAction(action, button) {
  if (button.disabled) {
    setStatus(actionFeedback({type: action}, {status: "rejected", reason: "no-reachable-target"}), {
      tone: "hint",
    });
    return;
  }
  try {
    canvas.dispatchEvent(new CustomEvent(PLAYABLE_VIRTUAL_INPUT_EVENT, {
      detail: {type: action},
    }));
    button.dataset.active = "true";
  } catch (error) {
    console.error(error);
    setStatus(`Touch control failed: ${error.message}`, {tone: "error", fault: true});
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
requestAnimationFrame(verifyMobileLayout);

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
  clearRuntimeFault();
  setTargetAvailability(null);
  body.dataset.peacockBallroomReady = "false";
  body.dataset.peacockBallroomState = nextState;
  body.dataset.peacockBallroomArchitecture = "pending";
  loading.hidden = false;
  stateButtons.forEach((button) => { button.disabled = true; });
  setStatus(`Opening ${nextState} from the Hara-authored canonical and ornamental scene descriptors…`);
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
    requestAnimationFrame(() => {
      host.resize();
      verifyMobileLayout();
    });
    return snapshot;
  } catch (error) {
    console.error(error);
    body.dataset.peacockBallroomReady = "false";
    body.dataset.peacockBallroomArchitecture = "failed";
    loading.hidden = true;
    stateButtons.forEach((button) => { button.disabled = false; });
    setStatus(`Preview failed: ${error.message}`, {tone: "error", fault: true});
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
    setStatus(`Resume failed: ${error.message}`, {tone: "error", fault: true});
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
