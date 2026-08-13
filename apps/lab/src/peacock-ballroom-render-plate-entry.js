import {createPeacockBallroomRenderPlateHost} from "./peacock-ballroom-render-plate.js";

const body = document.body;
const shell = document.querySelector(".ballroom-shell");
const canvas = document.querySelector("#peacock-ballroom-canvas");

if (!body || !shell || !canvas) {
  throw new Error("Peacock Ballroom render plate entry is missing its shell or canvas");
}

const parameters = new URLSearchParams(location.search);
const appearance = parameters.get("appearance") === "night" ? "night" : "day";
const profile = document.documentElement.dataset.peacockBallroomInput === "touch"
  ? "mobile"
  : "desktop";
let activeState = body.dataset.peacockBallroomState || "ballroom/day";
let requestSequence = 0;
let disposed = false;

function applyEvidence(evidence) {
  const ready = evidence.status === "ready" && evidence.loaded === true;
  body.dataset.peacockBallroomRenderPlate = ready
    ? "passed"
    : evidence.status === "failed"
      ? "failed"
      : evidence.status;
  body.dataset.peacockBallroomRenderPlateLoaded = evidence.loaded ? "true" : "false";
  body.dataset.peacockBallroomRenderPlateState = evidence.stateId ?? activeState;
  body.dataset.peacockBallroomRenderPlateAsset = evidence.assetId ?? "none";
  body.dataset.peacockBallroomRenderPlateBlob = evidence.sourceBlob ?? "none";
  body.dataset.peacockBallroomRenderPlateAppearance = evidence.appearance;
  body.dataset.peacockBallroomRenderPlateProfile = evidence.profile;
  body.dataset.peacockBallroomRenderPlateOpacity = String(evidence.opacity);
  body.dataset.peacockBallroomRenderPlateGeometryOpacity = String(evidence.geometryOpacity);
  body.dataset.peacockBallroomRenderPlateFidelity = String(evidence.fidelity);
  canvas.style.opacity = ready ? String(evidence.geometryOpacity) : "1";
  globalThis.__PEACOCK_BALLROOM_RENDER_PLATE__ = evidence;
  return evidence;
}

const host = createPeacockBallroomRenderPlateHost({
  root: shell,
  profile,
  appearance,
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
    const evidence = await host.open(activeState, {profile, appearance});
    if (disposed || sequence !== requestSequence) return null;
    return applyEvidence(evidence);
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
  host.resume("document-visible");
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
  canvas.style.opacity = "1";
  globalThis.__PEACOCK_BALLROOM_RENDER_PLATE__ = host.destroy();
}
window.addEventListener("pagehide", destroy, {once: true});
