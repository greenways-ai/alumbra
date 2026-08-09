import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
} from "@greenways/alumbra-hodos/catalog";
import { createCatalogHost } from "./catalog-host.js";
import {readViewportEvidence} from "./viewport-evidence.js";

const PLAYABLE_WORLD_ACTIVITY = "alumbra-viewport-playcanvas/playable-world";
const TWO_SESSIONS_ACTIVITY = "alumbra-viewport-playcanvas/two-sessions";
const PACKAGED_HARA_ACTIVITY = "alumbra-hara/packaged-height-field";
const CHUNK_RESIDENCY_ACTIVITY = "alumbra-renderer-playcanvas/chunk-residency";
const STALE_MESH_ACTIVITY = "alumbra-renderer-playcanvas/stale-mesh-rejection";
const CATALOG_ACTIVITY = "alumbra-hodos/renderer-catalog";
const RESIDENCY_STORY_FORMAT = "alumbra.residency-story/1";
const RESIDENCY_EVIDENCE_FORMAT = "alumbra.residency-evidence/1";
const DEFAULT_SEED_STATE = "world/default-seed";
const NEGATIVE_COORDINATE_STATE = "world/negative-coordinate";
const PACKAGE_MISMATCH_STATE = "world/package-mismatch";
const FIXTURE_PACKAGE = "hara:greenways/alumbra-hara";
const FIXTURE_GENERATOR = "alumbra/fixture-height-field";

const RESIDENCY_ACTIVITIES = new Set([
  CHUNK_RESIDENCY_ACTIVITY,
  STALE_MESH_ACTIVITY,
]);

const container = document.querySelector("[data-renderer-catalog]");
const labStatus = document.querySelector("[data-status]");
const primaryCanvas = document.querySelector("#alumbra-canvas");
const secondaryCanvas = document.querySelector("#alumbra-canvas-secondary");
const haraCanvas = document.querySelector("#alumbra-canvas-hara");
const residencyCanvas = document.querySelector("#alumbra-canvas-residency");
const residencyPanel = document.querySelector("[data-residency-panel]");
const packagedWorldError = document.querySelector("[data-packaged-world-error]");

if (!container) throw new Error("Alumbra lab is missing the Renderer Catalog mount");

const requestedState = () => new URL(window.location.href).searchParams.get("state")
  ?? DEFAULT_SEED_STATE;
const eventLog = [];
const describe = (activityId) => ALUMBRA_RENDERER_CATALOG.activities
  .find((activity) => activity.id === activityId);
const passed = (id, label, condition) => ({
  id,
  label,
  status: condition ? "passed" : "failed",
});
const openDetail = (activityId) => ({
  activityId,
  ...(activityId === PACKAGED_HARA_ACTIVITY ? {stateId: requestedState()} : {}),
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForResidencyActivity(activityId) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const residency = readViewportEvidence().residency;
    if (
      residency?.activeActivity === activityId
      && residency.status === "ready"
      && residency.scenario
    ) {
      return residency;
    }
    await sleep(25);
  }
  throw new Error(`Alumbra residency activity did not become ready: ${activityId}`);
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
    window.dispatchEvent(new CustomEvent("alumbra:open-demo", {
      detail: openDetail(activityId),
    }));
    if (RESIDENCY_ACTIVITIES.has(activityId)) {
      await waitForResidencyActivity(activityId);
      if (labStatus) {
        labStatus.textContent = `${activity.title} opened through the live renderer residency host.`;
      }
      return;
    }
    if (demo.host === "playable-lab") {
      if (labStatus) labStatus.textContent = `${activity.title} opened through the installed Renderer Catalog identity.`;
      return;
    }
    if (labStatus) {
      labStatus.textContent = `${activity.title} selected. Its complete package project is installed for the Workspace host.`;
    }
  },
  async runChecks({ activityId, demo }) {
    const activity = describe(activityId);
    const checks = [
      passed(
        "catalog/identity",
        "Activity resolves through the installed semantic identity registry",
        Boolean(demo && activity),
      ),
      passed(
        "catalog/projection",
        "Projected Catalog activity exposes no project path",
        activity?.path == null,
      ),
      passed(
        "catalog/event-boundary",
        "Catalog events contain identities but no installed project path",
        eventLog.every((event) => !Object.hasOwn(event.detail, "project")),
      ),
    ];

    window.dispatchEvent(new CustomEvent("alumbra:open-demo", {
      detail: openDetail(activityId),
    }));
    if (RESIDENCY_ACTIVITIES.has(activityId)) {
      await waitForResidencyActivity(activityId);
    } else {
      await Promise.resolve();
    }
    const evidence = readViewportEvidence();

    if (activityId === CHUNK_RESIDENCY_ACTIVITY) {
      const residency = evidence.residency;
      const scenario = residency?.scenario;
      const initial = scenario?.initial;
      const current = scenario?.current;
      checks.push(
        passed(
          "residency/live-surface",
          "The live prebuilt-mesh residency surface is mounted through its semantic identity",
          residency?.format === RESIDENCY_STORY_FORMAT
            && residency.activeActivity === activityId
            && residency.status === "ready"
            && scenario?.kind === "cross-boundary"
            && Boolean(residencyCanvas && !residencyCanvas.hidden)
            && Boolean(residencyPanel && !residencyPanel.hidden),
        ),
        passed(
          "residency/cross-boundary",
          "Crossing one chunk boundary replaces the bounded window and evicts resources behind it",
          initial?.format === RESIDENCY_EVIDENCE_FORMAT
            && current?.format === RESIDENCY_EVIDENCE_FORMAT
            && initial.residentChunks === initial.desiredChunks
            && current.residentChunks === current.desiredChunks
            && current.meshInstalls > initial.meshInstalls
            && current.evictedResources > initial.evictedResources
            && scenario.crossed === true,
        ),
        passed(
          "residency/prebuilt-disposal",
          "Worker meshes install without recomputation and a GPU disposal probe returns to baseline",
          scenario?.renderer?.chunks === current?.residentChunks
            && scenario.renderer.meshResources > 0
            && scenario.renderer.materialResources > 0
            && residency.disposal?.baseline === true
            && residency.disposal.count >= 1,
        ),
      );
    } else if (activityId === STALE_MESH_ACTIVITY) {
      const residency = evidence.residency;
      const scenario = residency?.scenario;
      const current = scenario?.current;
      checks.push(
        passed(
          "residency/current-revision",
          "The prebuilt renderer contains only the current canonical chunk revision",
          residency?.format === RESIDENCY_STORY_FORMAT
            && residency.activeActivity === activityId
            && residency.status === "ready"
            && scenario?.kind === "stale-mesh-rejection"
            && scenario.installedRevision === 2
            && scenario.renderer?.chunks === 1
            && Boolean(residencyCanvas && !residencyCanvas.hidden)
            && Boolean(residencyPanel && !residencyPanel.hidden),
        ),
        passed(
          "residency/stale-rejection",
          "A later completion for the older revision is discarded and disposal remains exact",
          current?.format === RESIDENCY_EVIDENCE_FORMAT
            && current.meshInstalls === 1
            && current.discardedStaleJobs === 1
            && scenario.rejected === true
            && residency.disposal?.baseline === true,
        ),
      );
    } else if (activityId === PACKAGED_HARA_ACTIVITY) {
      const packaged = evidence.packagedWorld;
      const defaultWorld = packaged?.states?.[DEFAULT_SEED_STATE];
      const negativeWorld = packaged?.states?.[NEGATIVE_COORDINATE_STATE];
      const mismatch = packaged?.states?.[PACKAGE_MISMATCH_STATE];
      const negativeSnapshot = negativeWorld?.snapshots?.[0];
      checks.push(
        passed(
          "hara/package-identity",
          "The exact Hara package identity is pinned and mismatches fail closed",
          defaultWorld?.package?.coordinate === FIXTURE_PACKAGE
            && defaultWorld.package.matched === true
            && mismatch?.status === "rejected"
            && mismatch.error?.code === "hara/package-version-mismatch",
        ),
        passed(
          "hara/generator-identity",
          "The packaged generator identity is preserved across named states",
          defaultWorld?.generator?.id === FIXTURE_GENERATOR
            && defaultWorld.generator.matched === true
            && negativeWorld?.generator?.id === FIXTURE_GENERATOR
            && negativeWorld.generator.matched === true,
        ),
        passed(
          "hara/snapshot-digest",
          "Core materialization matches the immutable default snapshot digest",
          defaultWorld?.snapshots?.length === 1
            && defaultWorld.snapshots[0].matched === true
            && defaultWorld.snapshots[0].digest === defaultWorld.snapshots[0].expectedDigest,
        ),
        passed(
          "hara/negative-coordinate-parity",
          "Negative-coordinate generation matches the pinned snapshot evidence",
          negativeWorld?.negativeCoordinateParity === true
            && negativeSnapshot?.matched === true
            && negativeSnapshot.coord.some((entry) => entry < 0),
        ),
        passed(
          "hara/disposal-baseline",
          "A packaged-world viewport returns renderer resources to baseline on disposal",
          packaged?.disposal?.baseline === true
            && packaged.disposal.count >= 1,
        ),
      );
    } else if (demo.host === "playable-lab") {
      checks.push(passed(
        "viewport/canvas",
        "The installed PlayCanvas viewport surface is mounted",
        Boolean(primaryCanvas),
      ));

      if (activityId === PLAYABLE_WORLD_ACTIVITY) {
        const primary = evidence.sessions.find((session) => session.sessionId === "primary");
        checks.push(passed(
          "viewport/canonical-session",
          "One active viewport retains its canonical world identity",
          evidence.activeActivity === activityId
            && evidence.mode === "single"
            && primary?.status === "active"
            && typeof primary.worldId === "string",
        ));
      }

      if (activityId === TWO_SESSIONS_ACTIVITY) {
        const sessions = evidence.sessions.filter((session) => session.status === "active");
        checks.push(
          passed(
            "viewport/session-count",
            "Two active viewport sessions are projected together",
            evidence.activeActivity === activityId
              && evidence.mode === "two"
              && sessions.length === 2
              && Boolean(secondaryCanvas && !secondaryCanvas.hidden),
          ),
          passed(
            "viewport/session-identity",
            "Viewport session identities remain distinct",
            new Set(sessions.map((session) => session.sessionId)).size === 2,
          ),
          passed(
            "viewport/world-identity",
            "Canonical world identities remain independent",
            new Set(sessions.map((session) => session.worldId)).size === 2,
          ),
        );
      }

      if (activityId === CATALOG_ACTIVITY) {
        // The Catalog story checks the mount only; viewport lifecycle belongs to package stories.
      }
    }

    if (activityId === PACKAGED_HARA_ACTIVITY) {
      const state = evidence.packagedWorld?.activeState;
      const active = evidence.packagedWorld?.active;
      checks.push(passed(
        "hara/active-state",
        "The requested named state is projected without leaking runtime handles",
        state === requestedState()
          && (
            active?.status === "ready"
              ? Boolean(haraCanvas && !haraCanvas.hidden)
              : active?.status === "rejected"
                && Boolean(packagedWorldError && !packagedWorldError.hidden)
          ),
      ));
    }

    return {
      status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
      message: `${checks.filter((check) => check.status === "passed").length}/${checks.length} activity checks passed`,
      checks,
    };
  },
});

async function waitForViewportHost() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const evidence = readViewportEvidence();
    if (
      evidence.sessions.length > 0
      && evidence.packagedWorld?.states
      && evidence.residency?.hostReady === true
    ) {
      return evidence;
    }
    await sleep(50);
  }
  throw new Error("Alumbra viewport and residency hosts did not become ready");
}

async function openBrowserStory() {
  await waitForViewportHost();
  const requested = new URL(window.location.href).searchParams.get("activity")
    ?? catalogHost.session.snapshot().selectedActivityId;
  catalogHost.session.selectActivity(requested);
  await catalogHost.session.openActivity(requested);
  const run = await catalogHost.session.checkActivity(requested);
  const evidence = readViewportEvidence();
  document.documentElement.dataset.browserActivity = requested;
  document.documentElement.dataset.browserCheck = run.status;
  document.documentElement.dataset.browserCheckCount = String(run.checks.length);
  if (requested === PACKAGED_HARA_ACTIVITY) {
    document.documentElement.dataset.browserState = evidence.packagedWorld?.activeState ?? "none";
    document.documentElement.dataset.browserWorldStatus = evidence.packagedWorld?.status ?? "missing";
    document.documentElement.dataset.browserDisposal = evidence.packagedWorld?.disposal?.baseline ? "passed" : "failed";
  }
  if (RESIDENCY_ACTIVITIES.has(requested)) {
    const residency = evidence.residency;
    document.documentElement.dataset.browserResidency = residency?.activeActivity === requested
      && residency.status === "ready"
      ? "passed"
      : "failed";
    document.documentElement.dataset.browserDisposal = residency?.disposal?.baseline ? "passed" : "failed";
  }
  if (run.status !== "passed") {
    throw new Error(`Catalog activity checks failed for ${requested}: ${run.message}`);
  }
  if (window.__ALUMBRA_PAGE_ERRORS__?.length) {
    throw new Error(`Browser story recorded ${window.__ALUMBRA_PAGE_ERRORS__.length} page errors`);
  }
  document.documentElement.dataset.labReady = "true";
}

void openBrowserStory().catch((error) => {
  console.error("Alumbra browser story failed", error);
});

window.addEventListener("pagehide", () => catalogHost.dispose(), { once: true });
