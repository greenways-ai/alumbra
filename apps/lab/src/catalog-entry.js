import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
} from "@greenways/alumbra-hodos/catalog";
import {
  buildCatalogChecks,
  LIT_WORLD_STATE_IDS,
  MATERIAL_STATE_IDS,
  WORKSPACE_STATE_IDS,
} from "./catalog-checks.js";
import { createCatalogHost } from "./catalog-host.js";
import { readViewportEvidence } from "./viewport-evidence.js";

const ACTIVITY_IDS = {
  playableWorld: "alumbra-viewport-playcanvas/playable-world",
  twoSessions: "alumbra-viewport-playcanvas/two-sessions",
  litWorld: "alumbra-viewport-playcanvas/lit-world",
  packagedHara: "alumbra-hara/packaged-height-field",
  chunkResidency: "alumbra-renderer-playcanvas/chunk-residency",
  staleMesh: "alumbra-renderer-playcanvas/stale-mesh-rejection",
  materialMatrix: "alumbra-renderer-playcanvas/material-matrix",
  environmentProfile: "alumbra-renderer-playcanvas/environment-profile",
  rendererWorkspace: "alumbra-hodos/renderer-workspace",
  catalog: "alumbra-hodos/renderer-catalog",
};
const IDS = Object.freeze({
  ...ACTIVITY_IDS,
  residencyActivities: new Set([ACTIVITY_IDS.chunkResidency, ACTIVITY_IDS.staleMesh]),
  materialActivities: new Set([ACTIVITY_IDS.materialMatrix, ACTIVITY_IDS.environmentProfile]),
});

const DEFAULT_HARA_STATE = "world/default-seed";
const container = document.querySelector("[data-renderer-catalog]");
const labStatus = document.querySelector("[data-status]");
const elements = Object.freeze({
  primaryCanvas: document.querySelector("#alumbra-canvas"),
  secondaryCanvas: document.querySelector("#alumbra-canvas-secondary"),
  haraCanvas: document.querySelector("#alumbra-canvas-hara"),
  residencyCanvas: document.querySelector("#alumbra-canvas-residency"),
  residencyPanel: document.querySelector("[data-residency-panel]"),
  materialCanvas: document.querySelector("#alumbra-canvas-materials"),
  materialPanel: document.querySelector("[data-material-panel]"),
  litWorldCanvas: document.querySelector("#alumbra-canvas-lit-world"),
  litWorldPanel: document.querySelector("[data-lit-world-panel]"),
  workspaceShell: document.querySelector("[data-renderer-workspace]"),
  workspaceCanvas: document.querySelector("#alumbra-canvas-workspace"),
  packagedWorldError: document.querySelector("[data-packaged-world-error]"),
});
if (!container) throw new Error("Alumbra lab is missing the Renderer Catalog mount");

const query = () => new URL(window.location.href).searchParams;
const requestedHaraState = () => query().get("state") ?? DEFAULT_HARA_STATE;
const requestedMaterialState = () => query().get("state") ?? MATERIAL_STATE_IDS.daylight;
const requestedWorkspaceState = () => query().get("state") ?? WORKSPACE_STATE_IDS.wide;
const requestedLitWorldState = () => query().get("state") ?? LIT_WORLD_STATE_IDS.live;
const eventLog = [];
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const describe = (activityId) => ALUMBRA_RENDERER_CATALOG.activities
  .find((activity) => activity.id === activityId);
const openDetail = (activityId) => ({
  activityId,
  ...(activityId === IDS.packagedHara ? { stateId: requestedHaraState() } : {}),
  ...(activityId === IDS.litWorld ? { stateId: requestedLitWorldState() } : {}),
  ...(activityId === IDS.environmentProfile ? { stateId: requestedMaterialState() } : {}),
  ...(activityId === IDS.rendererWorkspace ? { stateId: requestedWorkspaceState() } : {}),
});

async function waitForContribution(id, predicate, label) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const contribution = readViewportEvidence()[id];
    if (contribution && predicate(contribution)) return contribution;
    if (contribution?.status === "failed") {
      throw new Error(`${label} failed before it became ready`);
    }
    await sleep(25);
  }
  throw new Error(`${label} did not become ready`);
}
const waitForResidency = (activityId) => waitForContribution(
  "residency",
  (value) => value.activeActivity === activityId && value.status === "ready" && value.scenario,
  `Alumbra residency activity ${activityId}`,
);
const waitForMaterials = (activityId, stateId = null) => waitForContribution(
  "materials",
  (value) => value.activeActivity === activityId
    && value.status === "ready"
    && value.scenario
    && (stateId == null || value.activeState === stateId),
  `Alumbra material activity ${activityId}${stateId ? ` / ${stateId}` : ""}`,
);
const waitForLitWorld = (stateId) => waitForContribution(
  "litWorld",
  (value) => value.activeActivity === IDS.litWorld
    && value.activeState === stateId
    && value.status === "ready"
    && value.scenario?.kind === "lit-world"
    && value.scenario?.stateId === stateId,
  `Alumbra live lit-world viewport / ${stateId}`,
);
const waitForWorkspace = (stateId) => waitForContribution(
  "workspace",
  (value) => value.activeActivity === IDS.rendererWorkspace
    && value.status === "ready"
    && value.activeState === stateId
    && value.workspace
    && value.scenario,
  `Alumbra renderer Workspace ${stateId}`,
);
const waitForResidencyMove = (moves) => waitForContribution(
  "residency",
  (value) => value.activeActivity === IDS.chunkResidency
    && value.status === "ready"
    && value.scenario?.viewpoint?.moves >= moves,
  `Alumbra residency viewpoint move ${moves}`,
);

async function waitForActivity(activityId) {
  if (activityId === IDS.litWorld) return waitForLitWorld(requestedLitWorldState());
  if (activityId === IDS.rendererWorkspace) return waitForWorkspace(requestedWorkspaceState());
  if (IDS.residencyActivities.has(activityId)) return waitForResidency(activityId);
  if (IDS.materialActivities.has(activityId)) {
    return waitForMaterials(
      activityId,
      activityId === IDS.environmentProfile ? requestedMaterialState() : null,
    );
  }
  await Promise.resolve();
  return null;
}

const catalogHost = createCatalogHost({
  container,
  catalog: ALUMBRA_RENDERER_CATALOG,
  installedDemos: ALUMBRA_RENDERER_INSTALLED_DEMOS,
  dispatch(event) {
    eventLog.push(event);
    window.dispatchEvent(new CustomEvent("alumbra:catalog-event", {
      detail: { type: event.type, ...event.detail },
    }));
  },
  async openDemo({ activityId, demo }) {
    const activity = describe(activityId);
    document.body.dataset.catalogActivity = activityId;
    window.dispatchEvent(new CustomEvent("alumbra:open-demo", { detail: openDetail(activityId) }));
    await waitForActivity(activityId);
    if (!labStatus) return;
    if (activityId === IDS.litWorld) {
      labStatus.textContent = `${activity.title} opened through the live revision-fenced lighting host.`;
    } else if (activityId === IDS.rendererWorkspace) {
      labStatus.textContent = `${activity.title} opened through the integrated Hodos Workspace host.`;
    } else if (IDS.residencyActivities.has(activityId)) {
      labStatus.textContent = `${activity.title} opened through the live renderer residency host.`;
    } else if (IDS.materialActivities.has(activityId)) {
      labStatus.textContent = `${activity.title} opened through the live renderer material host.`;
    } else if (demo.host === "playable-lab") {
      labStatus.textContent = `${activity.title} opened through the installed Renderer Catalog identity.`;
    } else {
      labStatus.textContent = `${activity.title} selected. Its complete package project is installed for the Workspace host.`;
    }
  },
  async runChecks({ activityId, demo }) {
    window.dispatchEvent(new CustomEvent("alumbra:open-demo", { detail: openDetail(activityId) }));
    await waitForActivity(activityId);
    return buildCatalogChecks({
      activityId,
      activity: describe(activityId),
      demo,
      eventLog,
      evidence: readViewportEvidence(),
      elements,
      ids: IDS,
      requestedHaraState: requestedHaraState(),
      requestedMaterialState: requestedMaterialState(),
      requestedWorkspaceState: requestedWorkspaceState(),
      requestedLitWorldState: requestedLitWorldState(),
    });
  },
});

function selectedHostReady(activityId, evidence) {
  if (activityId === IDS.litWorld) return evidence.litWorld?.hostReady === true;
  if (activityId === IDS.packagedHara) return Boolean(evidence.packagedWorld?.states);
  if (IDS.residencyActivities.has(activityId)) return evidence.residency?.hostReady === true;
  if (IDS.materialActivities.has(activityId)) return evidence.materials?.hostReady === true;
  if (activityId === IDS.rendererWorkspace) return evidence.workspace?.hostReady === true;
  return evidence.sessions.length > 0;
}

async function waitForHosts(activityId) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const evidence = readViewportEvidence();
    if (selectedHostReady(activityId, evidence)) return evidence;
    await sleep(50);
  }
  throw new Error(`The selected Alumbra host did not become ready for ${activityId}`);
}

async function openBrowserStory() {
  const requested = query().get("activity") ?? catalogHost.session.snapshot().selectedActivityId;
  await waitForHosts(requested);
  catalogHost.session.selectActivity(requested);
  await catalogHost.session.openActivity(requested);
  const run = await catalogHost.session.checkActivity(requested);
  let evidence = readViewportEvidence();
  const data = document.documentElement.dataset;
  data.browserActivity = requested;
  data.browserCheck = run.status;
  data.browserCheckCount = String(run.checks.length);

  if (requested === IDS.packagedHara) {
    data.browserState = evidence.packagedWorld?.activeState ?? "none";
    data.browserWorldStatus = evidence.packagedWorld?.status ?? "missing";
    data.browserDisposal = evidence.packagedWorld?.disposal?.baseline ? "passed" : "failed";
  }
  if (requested === IDS.litWorld) {
    const litWorld = evidence.litWorld;
    const scenario = litWorld?.scenario;
    const mutation = scenario?.mutation;
    const stateId = requestedLitWorldState();
    data.browserLitWorld = litWorld?.activeActivity === requested
      && litWorld.activeState === stateId
      && litWorld.status === "ready" ? "passed" : "failed";
    data.browserState = litWorld?.activeState ?? "none";
    data.browserLitBoundary = scenario?.proofs?.expectedState === true
      && scenario?.proofs?.boundedAffected === true ? "passed" : "failed";
    data.browserLitColors = scenario?.proofs?.alignedVertexColors === true
      ? "passed" : "failed";
    data.browserLitVisibility = scenario?.proofs?.sameCanonicalSessionAfterResume === true
      && litWorld.lifecycle?.suspensions >= 1
      && litWorld.lifecycle?.resumes >= 1 ? "passed" : "failed";
    data.browserLitMutation = stateId === LIT_WORLD_STATE_IDS.live
      ? mutation?.receipts?.length === 0 ? "passed" : "failed"
      : mutation?.receipts?.length >= 1
        && scenario?.proofs?.duplicateActionRejected === true ? "passed" : "failed";
    const staleState = stateId === LIT_WORLD_STATE_IDS.stale
      || stateId === LIT_WORLD_STATE_IDS.editStale;
    data.browserLitStale = !staleState
      ? "passed"
      : scenario?.proofs?.staleGenerationRejected === true
        && mutation?.stale?.rejected === true ? "passed" : "failed";
    data.browserLitOrdinary = !stateId.startsWith("world/edit-")
      ? "passed"
      : scenario?.proofs?.ordinaryControllerPath === true
        && scenario?.proofs?.rejectedEditUnchanged === true ? "passed" : "failed";
    data.browserDisposal = litWorld?.disposal?.baseline ? "passed" : "failed";
  }
  if (IDS.residencyActivities.has(requested)) {
    let residency = evidence.residency;
    data.browserResidency = residency?.activeActivity === requested && residency.status === "ready"
      ? "passed" : "failed";
    data.browserDisposal = residency?.disposal?.baseline ? "passed" : "failed";
    if (requested === IDS.chunkResidency) {
      const before = residency?.scenario?.viewpoint?.moves ?? 0;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
      residency = await waitForResidencyMove(before + 1);
      evidence = readViewportEvidence();
      data.browserResidencyMove = residency.scenario?.viewpoint?.moves === before + 1
        && residency.scenario?.viewpoint?.chunk?.[0] === 2
        && residency.scenario?.current?.residentChunks === residency.scenario?.current?.desiredChunks
        ? "passed" : "failed";
    }
  }
  if (IDS.materialActivities.has(requested)) {
    const materials = evidence.materials;
    data.browserMaterial = materials?.activeActivity === requested && materials.status === "ready"
      ? "passed" : "failed";
    data.browserState = materials?.activeState ?? "none";
    data.browserDisposal = materials?.disposal?.baseline ? "passed" : "failed";
    if (requested === IDS.environmentProfile && requestedMaterialState() === MATERIAL_STATE_IDS.unknown) {
      const unknown = materials.states?.[MATERIAL_STATE_IDS.unknown];
      data.browserMaterialError = unknown?.error?.code === "renderer/material-profile-not-installed"
        && unknown.allocationBaseline === true ? "passed" : "failed";
    }
  }
  if (requested === IDS.rendererWorkspace) {
    const workspace = evidence.workspace;
    data.browserWorkspace = workspace?.activeActivity === requested && workspace.status === "ready"
      ? "passed" : "failed";
    data.browserState = workspace?.activeState ?? "none";
    data.browserWorkspaceLayout = workspace?.workspace?.layout ?? "missing";
    data.browserDisposal = workspace?.disposal?.baseline ? "passed" : "failed";
  }
  if (run.status !== "passed") {
    throw new Error(`Catalog activity checks failed for ${requested}: ${run.message}`);
  }
  if (window.__ALUMBRA_PAGE_ERRORS__?.length) {
    throw new Error(`Browser story recorded ${window.__ALUMBRA_PAGE_ERRORS__.length} page errors`);
  }
  data.labReady = "true";
}

void openBrowserStory().catch((error) => console.error("Alumbra browser story failed", error));
window.addEventListener("pagehide", () => catalogHost.dispose(), { once: true });
