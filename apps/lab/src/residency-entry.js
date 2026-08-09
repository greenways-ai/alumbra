import * as pc from "playcanvas";
import { createLabRegistry } from "./block-pack.js";
import {
  CHUNK_RESIDENCY_ACTIVITY,
  STALE_MESH_ACTIVITY,
  createResidencyStoryHost,
} from "./residency-host.js";
import { setViewportEvidenceContributor } from "./viewport-evidence.js";

const RESIDENCY_ACTIVITIES = new Set([
  CHUNK_RESIDENCY_ACTIVITY,
  STALE_MESH_ACTIVITY,
]);

const viewportGrid = document.querySelector("[data-viewport-grid]");
const residencyCanvas = document.querySelector("#alumbra-canvas-residency");
const primaryCanvas = document.querySelector("#alumbra-canvas");
const secondaryCanvas = document.querySelector("#alumbra-canvas-secondary");
const haraCanvas = document.querySelector("#alumbra-canvas-hara");
const packagedWorldError = document.querySelector("[data-packaged-world-error]");
const hotbar = document.querySelector("[data-hotbar]");
const status = document.querySelector("[data-status]");
const panel = document.querySelector("[data-residency-panel]");
const title = document.querySelector("[data-residency-title]");
const controls = document.querySelector("[data-residency-controls]");
const residencyStats = Object.fromEntries(
  [...document.querySelectorAll("[data-residency-stat]")]
    .map((node) => [node.dataset.residencyStat, node]),
);

if (!viewportGrid || !residencyCanvas || !status || !panel || !title) {
  throw new Error("Alumbra lab is missing the residency story surface");
}

const registry = createLabRegistry();
const host = createResidencyStoryHost({
  pc,
  canvas: residencyCanvas,
  registry,
});
let activeActivity = null;
let disposed = false;

function hideOtherSurfaces() {
  if (primaryCanvas) primaryCanvas.hidden = true;
  if (secondaryCanvas) secondaryCanvas.hidden = true;
  if (haraCanvas) haraCanvas.hidden = true;
  if (packagedWorldError) packagedWorldError.hidden = true;
  if (hotbar) hotbar.hidden = true;
  residencyCanvas.hidden = false;
  panel.hidden = false;
  viewportGrid.dataset.mode = "residency";
  document.body.dataset.viewportMode = "residency";
}

function publishHud(snapshot) {
  const scenario = snapshot.scenario;
  const current = scenario?.current;
  const renderer = scenario?.renderer;
  title.textContent = scenario?.kind === "cross-boundary"
    ? "Cross-boundary residency"
    : "Stale mesh rejection";
  if (residencyStats.resident) residencyStats.resident.textContent = String(current?.residentChunks ?? 0);
  if (residencyStats.desired) residencyStats.desired.textContent = String(current?.desiredChunks ?? 0);
  if (residencyStats.installs) residencyStats.installs.textContent = String(current?.meshInstalls ?? 0);
  if (residencyStats.stale) residencyStats.stale.textContent = String(current?.discardedStaleJobs ?? 0);
  if (residencyStats.evicted) residencyStats.evicted.textContent = String(current?.evictedResources ?? 0);
  if (residencyStats.gpu) {
    residencyStats.gpu.textContent = `${renderer?.meshResources ?? 0}M · ${renderer?.materialResources ?? 0}T`;
  }
  if (controls) {
    controls.textContent = scenario?.kind === "cross-boundary"
      ? `WASD / arrows move one chunk · viewpoint ${scenario.viewpoint?.chunk?.join(",") ?? "—"} · ${scenario.viewpoint?.moves ?? 0} moves`
      : "The older worker result is fenced from the installed revision.";
  }
}

async function openResidency(activityId) {
  activeActivity = activityId;
  hideOtherSurfaces();
  status.textContent = activityId === CHUNK_RESIDENCY_ACTIVITY
    ? "Generating and meshing a bounded window across a chunk boundary…"
    : "Completing two mesh revisions out of order…";
  const snapshot = await host.open(activityId);
  if (activeActivity !== activityId) return snapshot;
  hideOtherSurfaces();
  publishHud(snapshot);
  status.textContent = activityId === CHUNK_RESIDENCY_ACTIVITY
    ? "The viewpoint crossed a chunk boundary. Use WASD or the arrow keys to continue through the resident world."
    : "Revision 2 installed; the later revision-1 completion was rejected as stale.";
  if (activityId === CHUNK_RESIDENCY_ACTIVITY) residencyCanvas.focus?.({preventScroll: true});
  return snapshot;
}

async function closeResidency(reason) {
  if (!activeActivity) return host.snapshot();
  activeActivity = null;
  residencyCanvas.hidden = true;
  panel.hidden = true;
  return host.close(reason);
}

const openDemo = (event) => {
  const activityId = event.detail?.activityId;
  if (RESIDENCY_ACTIVITIES.has(activityId)) {
    void openResidency(activityId).catch((error) => {
      console.error("Alumbra residency story failed", error);
    });
    return;
  }
  void closeResidency(`activity:${activityId ?? "unknown"}`).catch((error) => {
    console.error("Alumbra residency disposal failed", error);
  });
};
window.addEventListener("alumbra:open-demo", openDemo);

const VIEW_MOVEMENT = new Map([
  ["KeyA", [-1, 0]],
  ["ArrowLeft", [-1, 0]],
  ["KeyD", [1, 0]],
  ["ArrowRight", [1, 0]],
  ["KeyW", [0, -1]],
  ["ArrowUp", [0, -1]],
  ["KeyS", [0, 1]],
  ["ArrowDown", [0, 1]],
]);

const moveViewpoint = (event) => {
  const delta = VIEW_MOVEMENT.get(event.code);
  if (!delta || event.repeat || activeActivity !== CHUNK_RESIDENCY_ACTIVITY) return;
  event.preventDefault();
  status.textContent = "Crossing into the next chunk residency window…";
  void host.moveView(delta).then((snapshot) => {
    if (activeActivity !== CHUNK_RESIDENCY_ACTIVITY) return;
    hideOtherSurfaces();
    publishHud(snapshot);
    status.textContent = `Viewpoint ${snapshot.scenario?.viewpoint?.chunk?.join(",") ?? "—"} is resident; old resources were evicted.`;
  }).catch((error) => {
    console.error("Alumbra residency viewpoint movement failed", error);
  });
};
window.addEventListener("keydown", moveViewpoint);

const visibility = () => {
  if (!activeActivity) return;
  if (document.visibilityState === "hidden") {
    host.suspend("document-hidden");
    return;
  }
  host.resume("document-visible");
  hideOtherSurfaces();
};
document.addEventListener("visibilitychange", visibility);

const clearEvidence = setViewportEvidenceContributor("residency", () => host.snapshot());

function resize() {
  if (activeActivity) host.resize();
}
window.addEventListener("resize", resize);

function destroy() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("alumbra:open-demo", openDemo);
  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", moveViewpoint);
  document.removeEventListener("visibilitychange", visibility);
  clearEvidence();
  panel.hidden = true;
  void host.destroy();
}
window.addEventListener("pagehide", destroy, { once: true });
