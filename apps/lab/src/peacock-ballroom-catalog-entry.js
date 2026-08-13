import {
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_DEFAULT_STATE,
  PEACOCK_BALLROOM_STATE_IDS,
} from "@greenways/alumbra-hodos/catalog";
import {setViewportEvidenceContributor} from "./viewport-evidence.js";

const STATE_SET = new Set(PEACOCK_BALLROOM_STATE_IDS);
const READY_POLL_INTERVAL_MS = 25;
const READY_POLL_ATTEMPTS = 1_600;
const FAILURE_DIAGNOSTIC_LIMIT = 1_400;
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
let childProgress = null;
let childDiagnostic = null;
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

function compactChildDiagnostic() {
  try {
    const childWindow = frame.contentWindow;
    const childDocument = frame.contentDocument;
    const htmlData = childDocument?.documentElement?.dataset ?? {};
    const bodyData = childDocument?.body?.dataset ?? {};
    const progress = childWindow?.__PEACOCK_BALLROOM_PROGRESS__;
    const preview = childWindow?.__PEACOCK_BALLROOM_PREVIEW__;
    const architecture = childWindow?.__PEACOCK_BALLROOM_ARCHITECTURE__;
    const pageErrors = Array.isArray(childWindow?.__PEACOCK_BALLROOM_PAGE_ERRORS__)
      ? childWindow.__PEACOCK_BALLROOM_PAGE_ERRORS__.slice(-3).map((entry) => String(entry).slice(0, 360))
      : [];
    const rect = frame.getBoundingClientRect();
    return Object.freeze({
      accessible: Boolean(childDocument),
      frame: Object.freeze({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        hidden: frame.hidden,
        url: frame.src,
      }),
      html: Object.freeze({
        input: htmlData.peacockBallroomInput ?? "",
        pageError: htmlData.peacockBallroomPageError ?? "false",
        pageErrorMessage: String(htmlData.peacockBallroomPageErrorMessage ?? "").slice(0, 360),
      }),
      body: Object.freeze({
        ready: bodyData.peacockBallroomReady ?? "false",
        error: bodyData.peacockBallroomError ?? "false",
        state: bodyData.peacockBallroomState ?? "",
        drawable: bodyData.peacockBallroomDrawable ?? "pending",
        drawableSize: bodyData.peacockBallroomDrawableSize ?? "",
        chunks: bodyData.peacockBallroomChunks ?? "0",
        architecture: bodyData.peacockBallroomArchitecture ?? "pending",
        architectureEntities: bodyData.peacockBallroomArchitectureEntities ?? "0",
        lighting: bodyData.peacockBallroomLighting ?? "pending",
        landmarks: bodyData.peacockBallroomLandmarks ?? "pending",
        disposal: bodyData.peacockBallroomDisposal ?? "pending",
        controls: bodyData.peacockBallroomMobileControls ?? "pending",
        layout: bodyData.peacockBallroomMobileLayout ?? "pending",
        progress: bodyData.peacockBallroomProgress ?? "0",
        progressStage: bodyData.peacockBallroomProgressStage ?? "canvas",
      }),
      progress: progress && typeof progress === "object"
        ? Object.freeze({
          format: progress.format ?? "",
          progress: Number(progress.progress) || 0,
          activeStage: progress.activeStage ?? "",
          label: String(progress.label ?? "").slice(0, 160),
          ready: progress.ready === true,
          failed: progress.failed === true,
        })
        : null,
      preview: preview && typeof preview === "object"
        ? Object.freeze({
          status: preview.status ?? "",
          activeState: preview.activeState ?? "",
          chunks: preview.scenario?.world?.chunkCount ?? 0,
        })
        : null,
      architecture: architecture && typeof architecture === "object"
        ? Object.freeze({
          status: architecture.status ?? "",
          profile: architecture.profile ?? "",
          entities: architecture.entities ?? 0,
        })
        : null,
      pageErrors: Object.freeze(pageErrors),
    });
  } catch (error) {
    return Object.freeze({
      accessible: false,
      error: String(error?.message ?? error).slice(0, 360),
    });
  }
}

function relayChildProgress(value) {
  childDiagnostic = value;
  childProgress = value?.progress ?? null;
  const progressValue = Math.max(
    0,
    Math.min(100, Number(childProgress?.progress ?? value?.body?.progress) || 0),
  );
  const progressStage = String(
    childProgress?.activeStage ?? value?.body?.progressStage ?? "canvas",
  );
  const data = document.documentElement.dataset;
  data.browserPeacockProgress = String(progressValue);
  data.browserPeacockProgressStage = progressStage;
  data.browserPeacockDrawable = value?.body?.drawable ?? "pending";
  data.browserPeacockArchitecture = value?.body?.architecture ?? "pending";
  data.browserPeacockProgressRail = progressValue === 100 && progressStage === "ready"
    ? "passed"
    : stateStatus === "failed"
      ? "failed"
      : "pending";
  if (stateStatus === "opening") {
    const label = childProgress?.label
      || (value?.body?.drawable === "pending"
        ? "Waiting for the embedded renderer surface"
        : "Assembling the Peacock Ballroom");
    status.textContent = `${label} · ${progressValue}%`;
  }
}

function catalogSnapshot() {
  return Object.freeze({
    format: "alumbra.peacock-ballroom-catalog/1",
    hostReady: true,
    activeActivity,
    activeState,
    status: stateStatus,
    progress: childProgress,
    diagnostic: childDiagnostic,
    scenario: child?.scenario ?? null,
    lifecycle: child?.lifecycle ?? null,
    disposal: child?.disposal ?? Object.freeze({count: 0, baseline: false}),
  });
}

function setProof(value = child, diagnostic = childDiagnostic) {
  const data = document.documentElement.dataset;
  const proofs = value?.scenario?.proofs;
  const progressReady = diagnostic?.progress?.format === "alumbra.peacock-ballroom-progress/1"
    && diagnostic.progress.progress === 100
    && diagnostic.progress.activeStage === "ready"
    && diagnostic.progress.ready === true;
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
    && value?.disposal?.baseline === true
    && progressReady;
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
  data.browserPeacockProgressRail = progressReady
    ? "passed"
    : stateStatus === "failed"
      ? "failed"
      : "pending";
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

function childFailureMessage(stateId, diagnostic = childDiagnostic) {
  const body = diagnostic?.body ?? {};
  const html = diagnostic?.html ?? {};
  const progress = diagnostic?.progress ?? {};
  const detail = JSON.stringify({
    frame: diagnostic?.frame ?? null,
    ready: body.ready ?? "false",
    error: body.error ?? "false",
    state: body.state ?? "",
    drawable: body.drawable ?? "pending",
    drawableSize: body.drawableSize ?? "",
    chunks: body.chunks ?? "0",
    architecture: body.architecture ?? "pending",
    architectureEntities: body.architectureEntities ?? "0",
    lighting: body.lighting ?? "pending",
    landmarks: body.landmarks ?? "pending",
    disposal: body.disposal ?? "pending",
    controls: body.controls ?? "pending",
    layout: body.layout ?? "pending",
    progress: progress.progress ?? body.progress ?? 0,
    progressStage: progress.activeStage ?? body.progressStage ?? "",
    progressLabel: progress.label ?? "",
    pageError: html.pageError ?? "false",
    pageErrorMessage: html.pageErrorMessage ?? "",
    pageErrors: diagnostic?.pageErrors ?? [],
  }).slice(0, FAILURE_DIAGNOSTIC_LIMIT);
  return `Peacock Ballroom did not become ready for ${stateId}; child=${detail}`;
}

async function publishWhenReady(sequence, stateId) {
  for (let attempt = 0; attempt < READY_POLL_ATTEMPTS; attempt += 1) {
    if (disposed || sequence !== loadSequence || activeActivity !== PEACOCK_BALLROOM_ACTIVITY_ID) return;
    const value = childSnapshot();
    const diagnostic = compactChildDiagnostic();
    relayChildProgress(diagnostic);
    const body = diagnostic?.body;
    if (body?.error === "true" || diagnostic?.html?.pageError === "true") {
      stateStatus = "failed";
      child = value;
      relayChildProgress(diagnostic);
      setProof(value, diagnostic);
      throw new Error(childFailureMessage(stateId, diagnostic));
    }
    if (body?.ready === "true"
        && value?.status === "ready"
        && value?.activeState === stateId
        && diagnostic?.progress?.progress === 100
        && diagnostic?.progress?.activeStage === "ready") {
      child = value;
      stateStatus = "ready";
      relayChildProgress(diagnostic);
      setProof(value, diagnostic);
      status.textContent = `${stateId} opened through the installed alumbra/world provider.`;
      return;
    }
    await sleep(READY_POLL_INTERVAL_MS);
  }
  stateStatus = "failed";
  const diagnostic = compactChildDiagnostic();
  relayChildProgress(diagnostic);
  setProof(childSnapshot(), diagnostic);
  throw new Error(childFailureMessage(stateId, diagnostic));
}

function openPeacockBallroom(stateValue) {
  const stateId = requestedState(stateValue);
  activeActivity = PEACOCK_BALLROOM_ACTIVITY_ID;
  activeState = stateId;
  stateStatus = "opening";
  child = null;
  childProgress = null;
  childDiagnostic = null;
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
  relayChildProgress(compactChildDiagnostic());
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
  childProgress = null;
  childDiagnostic = null;
  stateStatus = "idle";
  frame.hidden = true;
  frame.dataset.ballroomState = "";
  frame.src = "about:blank";
  delete document.documentElement.dataset.browserPeacockBallroom;
  delete document.documentElement.dataset.browserPeacockLighting;
  delete document.documentElement.dataset.browserPeacockBoundary;
  delete document.documentElement.dataset.browserPeacockProgress;
  delete document.documentElement.dataset.browserPeacockProgressStage;
  delete document.documentElement.dataset.browserPeacockProgressRail;
  delete document.documentElement.dataset.browserPeacockDrawable;
  delete document.documentElement.dataset.browserPeacockArchitecture;
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
