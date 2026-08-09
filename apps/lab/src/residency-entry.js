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
    ? "The camera crossed a chunk boundary; new meshes installed and resources behind it were evicted."
    : "Revision 2 installed; the later revision-1 completion was rejected as stale.";
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
  document.removeEventListener("visibilitychange", visibility);
  clearEvidence();
  panel.hidden = true;
  void host.destroy();
}
window.addEventListener("pagehide", destroy, { once: true });
