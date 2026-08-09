import * as pc from "playcanvas";
import {
  ENVIRONMENT_PROFILE_ACTIVITY,
  MATERIAL_MATRIX_ACTIVITY,
  MATERIAL_STATE_IDS,
  createMaterialStoryHost,
} from "./material-host.js";
import { setViewportEvidenceContributor } from "./viewport-evidence.js";

const MATERIAL_ACTIVITIES = new Set([
  MATERIAL_MATRIX_ACTIVITY,
  ENVIRONMENT_PROFILE_ACTIVITY,
]);

const viewportGrid = document.querySelector("[data-viewport-grid]");
const materialCanvas = document.querySelector("#alumbra-canvas-materials");
const primaryCanvas = document.querySelector("#alumbra-canvas");
const secondaryCanvas = document.querySelector("#alumbra-canvas-secondary");
const haraCanvas = document.querySelector("#alumbra-canvas-hara");
const residencyCanvas = document.querySelector("#alumbra-canvas-residency");
const packagedWorldError = document.querySelector("[data-packaged-world-error]");
const hotbar = document.querySelector("[data-hotbar]");
const status = document.querySelector("[data-status]");
const residencyPanel = document.querySelector("[data-residency-panel]");
const panel = document.querySelector("[data-material-panel]");
const title = document.querySelector("[data-material-title]");
const summary = document.querySelector("[data-material-summary]");
const materialStats = Object.fromEntries(
  [...document.querySelectorAll("[data-material-stat]")]
    .map((node) => [node.dataset.materialStat, node]),
);

if (!viewportGrid || !materialCanvas || !status || !panel || !title || !summary) {
  throw new Error("Alumbra lab is missing the material story surface");
}

const host = createMaterialStoryHost({ pc, canvas: materialCanvas });
let activeActivity = null;
let activeState = null;
let disposed = false;

function hideOtherSurfaces() {
  if (primaryCanvas) primaryCanvas.hidden = true;
  if (secondaryCanvas) secondaryCanvas.hidden = true;
  if (haraCanvas) haraCanvas.hidden = true;
  if (residencyCanvas) residencyCanvas.hidden = true;
  if (residencyPanel) residencyPanel.hidden = true;
  if (packagedWorldError) packagedWorldError.hidden = true;
  if (hotbar) hotbar.hidden = true;
  materialCanvas.hidden = false;
  panel.hidden = false;
  viewportGrid.dataset.mode = "materials";
  document.body.dataset.viewportMode = "materials";
}

function publishHud(snapshot) {
  const scenario = snapshot.scenario;
  const renderer = scenario?.renderer;
  const materials = renderer?.materials;
  const environment = scenario?.environment;
  title.textContent = scenario?.kind === "material-matrix"
    ? "Installed material matrix"
    : "Environment profiles";
  summary.textContent = scenario?.kind === "material-matrix"
    ? "Opaque · cutout · transparent · emissive · selection overlay"
    : snapshot.activeState === MATERIAL_STATE_IDS.unknownProfile
      ? "The unknown profile was rejected before renderer authority changed."
      : `${environment?.profileLabel ?? snapshot.activeState ?? "environment"} · ${environment?.fogMode ?? "none"} fog`;
  if (materialStats.groups) materialStats.groups.textContent = String(materials?.materialGroupCount ?? 0);
  if (materialStats.profiles) materialStats.profiles.textContent = String(materials?.profileCount ?? 0);
  if (materialStats.shared) materialStats.shared.textContent = String(materials?.sharedResourceCount ?? 0);
  if (materialStats.transparent) materialStats.transparent.textContent = String(materials?.transparentPassCount ?? 0);
  if (materialStats.environment) materialStats.environment.textContent = environment?.profileId ?? "—";
  if (materialStats.disposal) {
    materialStats.disposal.textContent = snapshot.disposal?.baseline
      ? `${snapshot.disposal.count} · baseline`
      : String(snapshot.disposal?.count ?? 0);
  }
}

async function openMaterial(activityId, stateId = null) {
  activeActivity = activityId;
  activeState = stateId;
  hideOtherSurfaces();
  status.textContent = activityId === MATERIAL_MATRIX_ACTIVITY
    ? "Installing the five bounded renderer material profiles…"
    : "Applying the requested environment profile…";
  const snapshot = await host.open(activityId, { stateId });
  if (activeActivity !== activityId) return snapshot;
  activeState = snapshot.activeState;
  hideOtherSurfaces();
  publishHud(snapshot);
  status.textContent = activityId === MATERIAL_MATRIX_ACTIVITY
    ? "Five material passes are installed together with shared GPU resources."
    : snapshot.scenario?.active?.status === "rejected"
      ? `${snapshot.activeState} was rejected as bounded descriptive evidence.`
      : `${snapshot.activeState} is active without exposing shader or renderer handles.`;
  return snapshot;
}

async function closeMaterial(reason) {
  if (!activeActivity) return host.snapshot();
  activeActivity = null;
  activeState = null;
  materialCanvas.hidden = true;
  panel.hidden = true;
  return host.close(reason);
}

const openDemo = (event) => {
  const activityId = event.detail?.activityId;
  if (MATERIAL_ACTIVITIES.has(activityId)) {
    void openMaterial(activityId, event.detail?.stateId ?? null).catch((error) => {
      console.error("Alumbra material story failed", error);
    });
    return;
  }
  void closeMaterial(`activity:${activityId ?? "unknown"}`).catch((error) => {
    console.error("Alumbra material disposal failed", error);
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

const clearEvidence = setViewportEvidenceContributor("materials", () => host.snapshot());

const resize = () => {
  if (activeActivity) host.resize();
};
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
