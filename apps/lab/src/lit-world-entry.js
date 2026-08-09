import * as pc from "playcanvas";
import {
  LIT_WORLD_ACTIVITY,
  createLitWorldStoryHost,
} from "./lit-world-host.js";
import { setViewportEvidenceContributor } from "./viewport-evidence.js";

const viewportGrid = document.querySelector("[data-viewport-grid]");
const canvas = document.querySelector("#alumbra-canvas-lit-world");
const primaryCanvas = document.querySelector("#alumbra-canvas");
const secondaryCanvas = document.querySelector("#alumbra-canvas-secondary");
const haraCanvas = document.querySelector("#alumbra-canvas-hara");
const residencyCanvas = document.querySelector("#alumbra-canvas-residency");
const materialCanvas = document.querySelector("#alumbra-canvas-materials");
const packagedWorldError = document.querySelector("[data-packaged-world-error]");
const hotbar = document.querySelector("[data-hotbar]");
const status = document.querySelector("[data-status]");
const panel = document.querySelector("[data-lit-world-panel]");
const litStats = Object.fromEntries(
  [...document.querySelectorAll("[data-lit-world-stat]")]
    .map((node) => [node.dataset.litWorldStat, node]),
);

if (!viewportGrid || !canvas || !status || !panel) {
  throw new Error("Alumbra lab is missing the lit-world story surface");
}

const host = createLitWorldStoryHost({ pc, canvas });
let activeActivity = null;
let disposed = false;

function hideOtherSurfaces() {
  if (primaryCanvas) primaryCanvas.hidden = true;
  if (secondaryCanvas) secondaryCanvas.hidden = true;
  if (haraCanvas) haraCanvas.hidden = true;
  if (residencyCanvas) residencyCanvas.hidden = true;
  if (materialCanvas) materialCanvas.hidden = true;
  if (packagedWorldError) packagedWorldError.hidden = true;
  if (hotbar) hotbar.hidden = true;
  canvas.hidden = false;
  panel.hidden = false;
  viewportGrid.dataset.mode = "lit-world";
  document.body.dataset.viewportMode = "lit-world";
}

function publishHud(snapshot) {
  const scenario = snapshot.scenario;
  const lighting = scenario?.lighting;
  const materialLighting = scenario?.materials?.lighting;
  if (litStats.status) litStats.status.textContent = String(snapshot.status);
  if (litStats.chunks) {
    litStats.chunks.textContent = `${lighting?.installedChunks ?? 0}/${lighting?.loadedChunks ?? 0}`;
  }
  if (litStats.sunlight) litStats.sunlight.textContent = String(lighting?.maximumSunlight ?? 0);
  if (litStats.emitted) {
    litStats.emitted.textContent = `${lighting?.maximumEmitted ?? 0} · boundary ${scenario?.boundaryEmission ?? 0}`;
  }
  if (litStats.vertices) litStats.vertices.textContent = Number(materialLighting?.vertices ?? 0).toLocaleString();
  if (litStats.resources) {
    litStats.resources.textContent = `${lighting?.renderer?.meshResources ?? 0}M · ${lighting?.renderer?.materialResources ?? 0}T`;
  }
  if (litStats.lifecycle) {
    litStats.lifecycle.textContent = `${snapshot.lifecycle?.suspensions ?? 0} suspend · ${snapshot.lifecycle?.resumes ?? 0} resume`;
  }
  if (litStats.disposal) {
    litStats.disposal.textContent = snapshot.disposal?.baseline
      ? `${snapshot.disposal.count} · baseline`
      : String(snapshot.disposal?.count ?? 0);
  }
}

async function openLitWorld() {
  activeActivity = LIT_WORLD_ACTIVITY;
  hideOtherSurfaces();
  status.textContent = "Building the negative-to-zero cave, propagating light, and projecting vertex colours…";
  const snapshot = await host.open(LIT_WORLD_ACTIVITY);
  if (activeActivity !== LIT_WORLD_ACTIVITY) return snapshot;
  hideOtherSurfaces();
  publishHud(snapshot);
  status.textContent = "The boundary lamp now lights both chunks through Engine fields, deterministic meshes, and PlayCanvas vertex colours.";
  return snapshot;
}

async function closeLitWorld(reason) {
  if (!activeActivity) return host.snapshot();
  activeActivity = null;
  canvas.hidden = true;
  panel.hidden = true;
  return host.close(reason);
}

const openDemo = (event) => {
  const activityId = event.detail?.activityId;
  if (activityId === LIT_WORLD_ACTIVITY) {
    void openLitWorld().catch((error) => {
      console.error("Alumbra lit-world story failed", error);
    });
    return;
  }
  void closeLitWorld(`activity:${activityId ?? "unknown"}`).catch((error) => {
    console.error("Alumbra lit-world disposal failed", error);
  });
};
window.addEventListener("alumbra:open-demo", openDemo);

const visibility = () => {
  if (activeActivity !== LIT_WORLD_ACTIVITY) return;
  if (document.visibilityState === "hidden") {
    host.suspend("document-hidden");
    publishHud(host.snapshot());
    return;
  }
  void host.resume("document-visible").then((snapshot) => {
    if (activeActivity !== LIT_WORLD_ACTIVITY) return;
    hideOtherSurfaces();
    publishHud(snapshot);
  }).catch((error) => {
    console.error("Alumbra lit-world resume failed", error);
  });
};
document.addEventListener("visibilitychange", visibility);

const clearEvidence = setViewportEvidenceContributor("litWorld", () => host.snapshot());

function resize() {
  if (activeActivity === LIT_WORLD_ACTIVITY) host.resize();
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
