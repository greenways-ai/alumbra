const body = document.body;
const loading = document.querySelector("[data-ballroom-loading]");
const label = document.querySelector("[data-ballroom-progress-label]");
const percent = document.querySelector("[data-ballroom-progress-percent]");
const overall = document.querySelector("[data-ballroom-progress-overall]");
const overallFill = document.querySelector("[data-ballroom-progress-overall-fill]");
const stage = document.querySelector('[data-ballroom-progress-stage="render"]');
const stageFill = stage?.querySelector("[data-ballroom-progress-stage-fill]");
const stageState = stage?.querySelector("[data-ballroom-progress-stage-state]");

if (!body || !loading || !label || !percent || !overall || !overallFill || !stage || !stageFill || !stageState) {
  throw new Error("Peacock Ballroom render progress is missing its progress rail");
}

let disposed = false;

function renderState() {
  const presentation = body.dataset.peacockBallroomRenderPlatePresentation === "structural"
    ? "structural"
    : "rendered";
  const plate = body.dataset.peacockBallroomRenderPlate || "pending";
  const loaded = body.dataset.peacockBallroomRenderPlateLoaded === "true";
  if (presentation === "structural") {
    return {status: "done", progress: 100, label: "bypassed", complete: true, failed: false};
  }
  if (plate === "passed" && loaded) {
    return {status: "done", progress: 100, label: "done", complete: true, failed: false};
  }
  if (plate === "failed") {
    return {status: "failed", progress: 100, label: "fallback", complete: true, failed: true};
  }
  if (plate === "loading") {
    return {status: "active", progress: 58, label: "loading", complete: false, failed: false};
  }
  return {status: "queued", progress: 0, label: "queued", complete: false, failed: false};
}

function apply() {
  if (disposed) return null;
  const render = renderState();
  const worldReady = body.dataset.peacockBallroomReady === "true";
  const worldProgress = Math.max(0, Math.min(100, Number(body.dataset.peacockBallroomProgress) || 0));
  const finalProgress = worldReady
    ? render.complete ? 100 : 96
    : Math.min(worldProgress, render.complete ? 96 : 92);

  stage.dataset.progressState = render.status;
  stage.style.setProperty("--stage-progress", `${render.progress}%`);
  stageFill.style.width = `${render.progress}%`;
  stageState.textContent = render.label;
  body.dataset.peacockBallroomRenderProgress = render.failed
    ? "failed"
    : render.complete
      ? "passed"
      : render.status;

  overall.setAttribute("aria-valuenow", String(finalProgress));
  overall.style.setProperty("--ballroom-progress", `${finalProgress}%`);
  overallFill.style.width = `${finalProgress}%`;
  percent.textContent = `${finalProgress}%`;
  body.dataset.peacockBallroomProgress = String(finalProgress);

  if (worldReady && !render.complete) {
    loading.hidden = false;
    loading.dataset.progressState = "loading";
    loading.setAttribute("aria-busy", "true");
    label.textContent = "Loading the original Peacock Ballroom rendering";
  } else if (worldReady) {
    loading.dataset.progressState = render.failed ? "failed" : "ready";
    loading.setAttribute("aria-busy", "false");
    label.textContent = render.failed ? "Using the structural world" : "World ready";
    loading.hidden = true;
  }

  const evidence = Object.freeze({
    format: "alumbra.peacock-ballroom-render-progress/1",
    status: body.dataset.peacockBallroomRenderProgress,
    stage: render.status,
    stageProgress: render.progress,
    overallProgress: finalProgress,
    presentation: body.dataset.peacockBallroomRenderPlatePresentation || "rendered",
    asset: body.dataset.peacockBallroomRenderPlateAsset || "none",
    loaded: body.dataset.peacockBallroomRenderPlateLoaded === "true",
    worldReady,
  });
  globalThis.__PEACOCK_BALLROOM_RENDER_PROGRESS__ = evidence;
  return evidence;
}

const observer = new MutationObserver(apply);
observer.observe(body, {
  attributes: true,
  attributeFilter: [
    "data-peacock-ballroom-ready",
    "data-peacock-ballroom-render-plate",
    "data-peacock-ballroom-render-plate-loaded",
    "data-peacock-ballroom-render-plate-presentation",
    "data-peacock-ballroom-render-plate-asset",
  ],
});

apply();

function destroy() {
  if (disposed) return;
  disposed = true;
  observer.disconnect();
  delete globalThis.__PEACOCK_BALLROOM_RENDER_PROGRESS__;
}
window.addEventListener("pagehide", destroy, {once: true});
