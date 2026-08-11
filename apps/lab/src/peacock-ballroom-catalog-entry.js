import {
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_DEFAULT_STATE,
  PEACOCK_BALLROOM_STATE_IDS,
} from "@greenways/alumbra-hodos/catalog";
import {setViewportEvidenceContributor} from "./viewport-evidence.js";

const STATE_SET = new Set(PEACOCK_BALLROOM_STATE_IDS);
const frame = document.querySelector("#alumbra-peacock-ballroom-frame");
const viewportGrid = document.querySelector("[data-viewport-grid]");
const status = document.querySelector("[data-status]");
const workspace = document.querySelector("[data-renderer-workspace]");
const packagedWorldError = document.querySelector("[data-packaged-world-error]");
const evidencePanels = [
  document.querySelector("[data-residency-panel]"),
  document.querySelector("[data-material-panel]"),
  document.querySelector("[data-lit-world-panel]"),
].filter(Boolean);
const canvases = [...document.querySelectorAll("[data-viewport-grid] canvas")];

if (!frame || !viewportGrid || !status) {
  throw new Error("Alumbra Lab is missing the Peacock Ballroom Catalog surface");
}

let activeActivity = null;
let activeState = null;
let child = null;
let stateStatus = "idle";
let loadSequence = 0;
let disposed = false;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function requestedState(value) {
  const candidate = String(value ?? "").trim();
  return STATE_SET.has(candidate) ? candidate : PEACOCK_BALLROOM_DEFAULT_STATE;
}

function childSnapshot() {
  try {
    const value = frame.contentWindow?.__PEACOCK_BALLROOM_PREVIEW__;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function catalogSnapshot() {
  return Object.freeze({
    format: "alumbra.peacock-ballroom-catalog/1",
    hostReady: true,
    activeActivity,
    activeState,
    status: stateStatus,
    scenario: child?.scenario ?? null,
    lifecycle: child?.lifecycle ?? null,
    disposal: child?.disposal ?? Object.freeze({count: 0, baseline: false}),
  });
}

function setProof(value = child) {
  const data = document.documentElement.dataset;
  const proofs = value?.scenario?.proofs;
  const ready = value?.status === "ready"
    && value?.activeState === activeState
    && value?.scenario?.world?.chunkCount === 48
    && proofs?.exactEnvelope === true
    && proofs?.crossOrigin === true
    && proofs?.namedState === true
    && proofs?.safeSpawn === true
    && proofs?.landmarkSet === true
    && proofs?.sunlight === true
    && proofs?.emittedLight === true
    && proofs?.litProjection === true
    && proofs?.materialPasses === true
    && proofs?.sameCanonicalSessionAfterResume === true
    && value?.disposal?.baseline === true;
  data.browserPeacockBallroom = ready ? "passed" : "failed";
  data.browserPeacockLighting = proofs?.sunlight === true
    && proofs?.emittedLight === true
    && proofs?.litProjection === true ? "passed" : "failed";
  data.browserPeacockBoundary = proofs?.exactEnvelope === true
    && proofs?.crossOrigin === true
    && proofs?.safeSpawn === true
    && proofs?.landmarkSet === true ? "passed" : "failed";
  data.browserState = activeState ?? "none";
  data.browserDisposal = value?.disposal?.baseline === true ? "passed" : "failed";
}

function hideOtherWorldSurfaces() {
  for (const canvas of canvases) canvas.hidden = true;
  if (workspace) workspace.hidden = true;
  if (packagedWorldError) packagedWorldError.hidden = true;
  for (const panel of evidencePanels) panel.hidden = true;
  frame.hidden = false;
  viewportGrid.dataset.mode = "peacock-ballroom";
  document.body.dataset.viewportMode = "peacock-ballroom";
}

async function publishWhenReady(sequence, stateId) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if (disposed || sequence !== loadSequence || activeActivity !== PEACOCK_BALLROOM_ACTIVITY_ID) return;
    const value = childSnapshot();
    let body = null;
    try {
      body = frame.contentDocument?.body ?? null;
    } catch {
      body = null;
    }
    if (body?.dataset.peacockBallroomError === "true") {
      stateStatus = "failed";
      child = value;
      setProof(value);
      throw new Error(`Peacock Ballroom frame rejected ${stateId}`);
    }
    if (body?.dataset.peacockBallroomReady === "true"
        && value?.status === "ready"
        && value?.activeState === stateId) {
      child = value;
      stateStatus = "ready";
      setProof(value);
      status.textContent = `${stateId} opened through the installed alumbra/world provider.`;
      return;
    }
    await sleep(25);
  }
  stateStatus = "failed";
  setProof();
  throw new Error(`Peacock Ballroom did not become ready for ${stateId}`);
}

function openPeacockBallroom(stateValue) {
  const stateId = requestedState(stateValue);
  activeActivity = PEACOCK_BALLROOM_ACTIVITY_ID;
  activeState = stateId;
  stateStatus = "opening";
  child = null;
  hideOtherWorldSurfaces();
  status.textContent = `Opening ${stateId} through the installed Peacock Ballroom provider…`;
  const sequence = ++loadSequence;
  const next = new URL("./peacock-ballroom.html", location.href);
  next.searchParams.set("state", stateId);
  next.searchParams.set("embed", "catalog");
  if (frame.dataset.ballroomState !== stateId || !frame.src) {
    frame.dataset.ballroomState = stateId;
    frame.src = next.href;
  }
  setProof();
  void publishWhenReady(sequence, stateId).catch((error) => {
    console.error("Alumbra Peacock Ballroom Catalog host failed", error);
  });
}

function closePeacockBallroom() {
  if (activeActivity !== PEACOCK_BALLROOM_ACTIVITY_ID) return;
  loadSequence += 1;
  activeActivity = null;
  activeState = null;
  child = null;
  stateStatus = "idle";
  frame.hidden = true;
  frame.dataset.ballroomState = "";
  frame.src = "about:blank";
  delete document.documentElement.dataset.browserPeacockBallroom;
  delete document.documentElement.dataset.browserPeacockLighting;
  delete document.documentElement.dataset.browserPeacockBoundary;
}

const openDemo = (event) => {
  const activityId = event.detail?.activityId;
  if (activityId === PEACOCK_BALLROOM_ACTIVITY_ID) {
    const queryState = new URL(location.href).searchParams.get("state");
    openPeacockBallroom(event.detail?.stateId ?? queryState);
    return;
  }
  closePeacockBallroom();
};
window.addEventListener("alumbra:open-demo", openDemo);

const clearEvidence = setViewportEvidenceContributor("peacockBallroom", catalogSnapshot);

function destroy() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("alumbra:open-demo", openDemo);
  clearEvidence();
  closePeacockBallroom();
}
window.addEventListener("pagehide", destroy, {once: true});
