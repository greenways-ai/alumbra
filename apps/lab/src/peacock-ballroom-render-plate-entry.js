import {createPeacockBallroomRenderPlateHost} from "./peacock-ballroom-render-plate.js";

const body = document.body;
const shell = document.querySelector(".ballroom-shell");
const canvas = document.querySelector("#peacock-ballroom-canvas");

if (!body || !shell || !canvas) {
  throw new Error("Peacock Ballroom render plate entry is missing its shell or canvas");
}

const parameters = new URLSearchParams(location.search);
const profile = document.documentElement.dataset.peacockBallroomInput === "touch"
  ? "mobile"
  : "desktop";
let activeAppearance = parameters.get("appearance") === "night" ? "night" : "day";
let activePresentation = parameters.get("presentation") === "structural"
  ? "structural"
  : "rendered";
let activeState = body.dataset.peacockBallroomState || "ballroom/day";
let requestSequence = 0;
let disposed = false;

function updateUrl() {
  const url = new URL(location.href);
  if (activeAppearance === "night") url.searchParams.set("appearance", "night");
  else url.searchParams.delete("appearance");
  if (activePresentation === "structural") url.searchParams.set("presentation", "structural");
  else url.searchParams.delete("presentation");
  history.replaceState({
    ...(history.state && typeof history.state === "object" ? history.state : {}),
    appearance: activeAppearance,
    presentation: activePresentation,
  }, "", url);
}

function applyEvidence(evidence) {
  const ready = evidence.status === "ready" && evidence.loaded === true;
  const rendered = activePresentation === "rendered";
  body.dataset.peacockBallroomRenderPlate = ready
    ? "passed"
    : evidence.status === "failed"
      ? "failed"
      : evidence.status;
  body.dataset.peacockBallroomRenderPlateLoaded = evidence.loaded ? "true" : "false";
  body.dataset.peacockBallroomRenderPlateState = evidence.stateId ?? activeState;
  body.dataset.peacockBallroomRenderPlateAsset = evidence.assetId ?? "none";
  body.dataset.peacockBallroomRenderPlateBlob = evidence.sourceBlob ?? "none";
  body.dataset.peacockBallroomRenderPlateAppearance = activeAppearance;
  body.dataset.peacockBallroomRenderPlateProfile = evidence.profile;
  body.dataset.peacockBallroomRenderPlatePresentation = activePresentation;
  body.dataset.peacockBallroomRenderPlateOpacity = rendered ? String(evidence.opacity) : "0";
  body.dataset.peacockBallroomRenderPlateGeometryOpacity = rendered
    ? String(evidence.geometryOpacity)
    : "1";
  body.dataset.peacockBallroomRenderPlateFidelity = String(evidence.fidelity);
  canvas.style.opacity = rendered && ready ? String(evidence.geometryOpacity) : "1";
  globalThis.__PEACOCK_BALLROOM_RENDER_PLATE__ = Object.freeze({
    ...evidence,
    appearance: activeAppearance,
    presentation: activePresentation,
  });
  return globalThis.__PEACOCK_BALLROOM_RENDER_PLATE__;
}

const host = createPeacockBallroomRenderPlateHost({
  root: shell,
  profile,
  appearance: activeAppearance,
  onEvidence: applyEvidence,
});

async function openState(stateId) {
  if (disposed) return null;
  const sequence = ++requestSequence;
  activeState = String(stateId || "ballroom/day");
  body.dataset.peacockBallroomRenderPlate = "loading";
  body.dataset.peacockBallroomRenderPlateLoaded = "false";
  canvas.style.opacity = "1";
  try {
    const evidence = await host.open(activeState, {
      profile,
      appearance: activeAppearance,
    });
    if (disposed || sequence !== requestSequence) return null;
    if (activePresentation === "structural") host.suspend("structural-presentation");
    return applyEvidence(host.snapshot());
  } catch (error) {
    if (error?.name === "AbortError" || disposed || sequence !== requestSequence) return null;
    const failed = host.snapshot();
    body.dataset.peacockBallroomRenderPlate = "failed";
    body.dataset.peacockBallroomRenderPlateLoaded = "false";
    canvas.style.opacity = "1";
    globalThis.__PEACOCK_BALLROOM_RENDER_PLATE__ = failed;
    console.warn("Peacock Ballroom render plate fell back to structural geometry", error);
    return failed;
  }
}

async function setAppearance(value) {
  const next = String(value);
  if (next !== "day" && next !== "night") {
    throw new Error(`Unsupported Peacock Ballroom render appearance: ${next}`);
  }
  if (next === activeAppearance && host.snapshot().status === "ready") {
    return applyEvidence(host.snapshot());
  }
  activeAppearance = next;
  body.dataset.peacockBallroomRenderPlateAppearance = activeAppearance;
  updateUrl();
  return openState(activeState);
}

function setPresentation(value) {
  const next = String(value);
  if (next !== "rendered" && next !== "structural") {
    throw new Error(`Unsupported Peacock Ballroom presentation: ${next}`);
  }
  activePresentation = next;
  body.dataset.peacockBallroomRenderPlatePresentation = activePresentation;
  updateUrl();
  if (activePresentation === "structural") {
    host.suspend("structural-presentation");
    canvas.style.opacity = "1";
  } else {
    host.resume("rendered-presentation");
  }
  return applyEvidence(host.snapshot());
}

globalThis.__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__ = setAppearance;
globalThis.__PEACOCK_BALLROOM_SET_PRESENTATION__ = setPresentation;
body.dataset.peacockBallroomRenderPlateAppearance = activeAppearance;
body.dataset.peacockBallroomRenderPlatePresentation = activePresentation;

const stateObserver = new MutationObserver(() => {
  const nextState = body.dataset.peacockBallroomState || "ballroom/day";
  if (nextState === activeState && host.snapshot().status !== "idle") return;
  void openState(nextState);
});
stateObserver.observe(body, {
  attributes: true,
  attributeFilter: ["data-peacock-ballroom-state"],
});

const renderFrame = (frame) => {
  if (disposed || !frame?.player) return host.snapshot();
  return applyEvidence(host.setPose(frame.player));
};
globalThis.__PEACOCK_BALLROOM_RENDER_PLATE_FRAME__ = renderFrame;

const visibility = () => {
  if (document.visibilityState === "hidden") {
    host.suspend("document-hidden");
    canvas.style.opacity = "1";
    return;
  }
  if (activePresentation === "rendered") host.resume("document-visible");
  applyEvidence(host.snapshot());
};
document.addEventListener("visibilitychange", visibility);

void openState(activeState);

function destroy() {
  if (disposed) return;
  disposed = true;
  requestSequence += 1;
  stateObserver.disconnect();
  document.removeEventListener("visibilitychange", visibility);
  if (globalThis.__PEACOCK_BALLROOM_RENDER_PLATE_FRAME__ === renderFrame) {
    delete globalThis.__PEACOCK_BALLROOM_RENDER_PLATE_FRAME__;
  }
  if (globalThis.__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__ === setAppearance) {
    delete globalThis.__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__;
  }
  if (globalThis.__PEACOCK_BALLROOM_SET_PRESENTATION__ === setPresentation) {
    delete globalThis.__PEACOCK_BALLROOM_SET_PRESENTATION__;
  }
  canvas.style.opacity = "1";
  globalThis.__PEACOCK_BALLROOM_RENDER_PLATE__ = host.destroy();
}
window.addEventListener("pagehide", destroy, {once: true});
