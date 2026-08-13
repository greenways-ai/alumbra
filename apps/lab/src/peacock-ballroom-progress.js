const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const passed = (value) => value === "passed" || value === "ready" || value === "not-applicable";
const failed = (value) => value === "failed";

export const PEACOCK_BALLROOM_PROGRESS_FORMAT = "alumbra.peacock-ballroom-progress/1";

export const PEACOCK_BALLROOM_PROGRESS_STAGES = Object.freeze([
  Object.freeze({id: "canvas", label: "Renderer surface"}),
  Object.freeze({id: "canonical", label: "Canonical chunks"}),
  Object.freeze({id: "architecture", label: "Ornamental projection"}),
  Object.freeze({id: "evidence", label: "Lighting & evidence"}),
  Object.freeze({id: "controls", label: "Player controls"}),
]);

const STAGE_MESSAGES = Object.freeze({
  canvas: "Sizing the renderer surface",
  canonical: "Materialising 48 canonical chunks",
  architecture: "Projecting smooth ornamental architecture",
  evidence: "Verifying light, landmarks and disposal",
  controls: "Activating movement and editing controls",
});

function evidenceProgress(dataset) {
  const statuses = [
    dataset.peacockBallroomLighting,
    dataset.peacockBallroomLandmarks,
    dataset.peacockBallroomDisposal,
  ];
  if (statuses.every(passed)) return 1;
  if (statuses.some(failed)) return 0;
  const completed = statuses.filter(passed).length;
  return clamp01((completed + (completed < statuses.length ? 0.22 : 0)) / statuses.length);
}

function controlsProgress(dataset) {
  if (dataset.peacockBallroomReady === "true") return 1;
  let progress = 0;
  if (dataset.peacockBallroomMobileControls === "ready") progress += 0.42;
  if (passed(dataset.peacockBallroomMobileLayout)) progress += 0.28;
  if (dataset.peacockBallroomTarget === "ready" || dataset.peacockBallroomTarget === "none") {
    progress += 0.08;
  }
  return clamp01(progress);
}

function stageValues(dataset) {
  const chunks = Math.max(0, Number(dataset.peacockBallroomChunks) || 0);
  const drawable = dataset.peacockBallroomDrawable;
  const architecture = dataset.peacockBallroomArchitecture;
  const ready = dataset.peacockBallroomReady === "true";

  return Object.freeze({
    canvas: ready || drawable === "ready" ? 1 : drawable === "failed" ? 0 : 0.16,
    canonical: ready || chunks >= 48
      ? 1
      : chunks > 0
        ? clamp01(chunks / 48)
        : drawable === "ready"
          ? 0.18
          : 0,
    architecture: ready || architecture === "passed"
      ? 1
      : architecture === "failed"
        ? 0
        : drawable === "ready"
          ? 0.16
          : 0,
    evidence: ready ? 1 : evidenceProgress(dataset),
    controls: controlsProgress(dataset),
  });
}

function stageFailure(dataset, stageId) {
  if (stageId === "canvas") return failed(dataset.peacockBallroomDrawable);
  if (stageId === "architecture") return failed(dataset.peacockBallroomArchitecture);
  if (stageId === "evidence") {
    return [
      dataset.peacockBallroomLighting,
      dataset.peacockBallroomLandmarks,
      dataset.peacockBallroomDisposal,
    ].some(failed);
  }
  if (stageId === "controls") return failed(dataset.peacockBallroomMobileLayout);
  return false;
}

export function peacockBallroomProgressModel(dataset = {}) {
  const values = stageValues(dataset);
  const ready = dataset.peacockBallroomReady === "true";
  const faulted = dataset.peacockBallroomError === "true"
    || dataset.peacockBallroomPageError === "true";
  const firstIncomplete = PEACOCK_BALLROOM_PROGRESS_STAGES.find((stage) => values[stage.id] < 1);
  const activeStage = ready ? null : firstIncomplete?.id ?? "controls";
  const stages = PEACOCK_BALLROOM_PROGRESS_STAGES.map((definition) => {
    const progress = clamp01(values[definition.id]);
    let status = progress >= 1 ? "done" : definition.id === activeStage ? "active" : progress > 0 ? "warming" : "queued";
    if ((faulted || stageFailure(dataset, definition.id)) && definition.id === activeStage) status = "failed";
    return Object.freeze({
      ...definition,
      progress,
      status,
    });
  });
  const weighted = stages.reduce((sum, stage) => sum + stage.progress, 0) / stages.length;
  const progress = ready ? 100 : Math.min(96, Math.max(1, Math.round(weighted * 100)));
  const label = ready
    ? "World ready"
    : faulted
      ? "World assembly interrupted"
      : STAGE_MESSAGES[activeStage] ?? "Preparing the Peacock Ballroom";

  return Object.freeze({
    format: PEACOCK_BALLROOM_PROGRESS_FORMAT,
    ready,
    failed: faulted,
    progress,
    activeStage: ready ? "ready" : activeStage,
    label,
    stages: Object.freeze(stages),
  });
}

export function mountPeacockBallroomProgress(documentRef = globalThis.document) {
  const body = documentRef?.body;
  const panel = documentRef?.querySelector?.("[data-ballroom-loading]");
  const overall = documentRef?.querySelector?.("[data-ballroom-progress-overall]");
  const overallFill = documentRef?.querySelector?.("[data-ballroom-progress-overall-fill]");
  const label = documentRef?.querySelector?.("[data-ballroom-progress-label]");
  const percent = documentRef?.querySelector?.("[data-ballroom-progress-percent]");
  if (!body || !panel || !overall || !overallFill || !label || !percent) return null;

  const stageNodes = new Map(
    [...documentRef.querySelectorAll("[data-ballroom-progress-stage]")].map((node) => [
      node.dataset.ballroomProgressStage,
      node,
    ]),
  );

  const render = () => {
    const model = peacockBallroomProgressModel(body.dataset);
    panel.dataset.progressState = model.ready ? "ready" : model.failed ? "failed" : "loading";
    panel.setAttribute("aria-busy", model.ready || model.failed ? "false" : "true");
    overall.setAttribute("aria-valuenow", String(model.progress));
    overall.style.setProperty("--ballroom-progress", `${model.progress}%`);
    overallFill.style.width = `${model.progress}%`;
    label.textContent = model.label;
    percent.textContent = `${model.progress}%`;

    for (const stage of model.stages) {
      const node = stageNodes.get(stage.id);
      if (!node) continue;
      node.dataset.progressState = stage.status;
      node.style.setProperty("--stage-progress", `${Math.round(stage.progress * 100)}%`);
      const fill = node.querySelector("[data-ballroom-progress-stage-fill]");
      const state = node.querySelector("[data-ballroom-progress-stage-state]");
      if (fill) fill.style.width = `${Math.round(stage.progress * 100)}%`;
      if (state) state.textContent = stage.status;
    }

    body.dataset.peacockBallroomProgress = String(model.progress);
    body.dataset.peacockBallroomProgressStage = model.activeStage;
    globalThis.__PEACOCK_BALLROOM_PROGRESS__ = model;
    return model;
  };

  const observer = new MutationObserver(render);
  observer.observe(body, {
    attributes: true,
    attributeFilter: [
      "data-peacock-ballroom-ready",
      "data-peacock-ballroom-error",
      "data-peacock-ballroom-drawable",
      "data-peacock-ballroom-chunks",
      "data-peacock-ballroom-architecture",
      "data-peacock-ballroom-lighting",
      "data-peacock-ballroom-landmarks",
      "data-peacock-ballroom-disposal",
      "data-peacock-ballroom-mobile-controls",
      "data-peacock-ballroom-mobile-layout",
      "data-peacock-ballroom-target",
    ],
  });
  render();
  return Object.freeze({
    render,
    destroy() { observer.disconnect(); },
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountPeacockBallroomProgress(document), {once: true});
  } else {
    mountPeacockBallroomProgress(document);
  }
}
