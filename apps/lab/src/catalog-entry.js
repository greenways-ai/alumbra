import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
} from "@greenways/alumbra-hodos/catalog";
import { createCatalogHost } from "./catalog-host.js";
import {readViewportEvidence} from "./viewport-evidence.js";

const PLAYABLE_WORLD_ACTIVITY = "alumbra-viewport-playcanvas/playable-world";
const TWO_SESSIONS_ACTIVITY = "alumbra-viewport-playcanvas/two-sessions";
const CATALOG_ACTIVITY = "alumbra-hodos/renderer-catalog";

const container = document.querySelector("[data-renderer-catalog]");
const labStatus = document.querySelector("[data-status]");
const primaryCanvas = document.querySelector("#alumbra-canvas");
const secondaryCanvas = document.querySelector("#alumbra-canvas-secondary");

if (!container) throw new Error("Alumbra lab is missing the Renderer Catalog mount");

const eventLog = [];
const describe = (activityId) => ALUMBRA_RENDERER_CATALOG.activities
  .find((activity) => activity.id === activityId);
const passed = (id, label, condition) => ({
  id,
  label,
  status: condition ? "passed" : "failed",
});

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
      detail: { activityId },
    }));
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

    if (demo.host === "playable-lab") {
      window.dispatchEvent(new CustomEvent("alumbra:open-demo", {
        detail: {activityId},
      }));
      await Promise.resolve();
      const evidence = readViewportEvidence();
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
        // The Catalog story checks the mount only; viewport lifecycle belongs to its package stories.
      }
    }

    return {
      status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
      message: `${checks.filter((check) => check.status === "passed").length}/${checks.length} activity checks passed`,
      checks,
    };
  },
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForViewportHost() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const evidence = readViewportEvidence();
    if (evidence.sessions.length > 0) return evidence;
    await sleep(50);
  }
  throw new Error("Alumbra viewport host did not become ready");
}

async function openBrowserStory() {
  await waitForViewportHost();
  const requested = new URL(window.location.href).searchParams.get("activity")
    ?? catalogHost.session.snapshot().selectedActivityId;
  catalogHost.session.selectActivity(requested);
  await catalogHost.session.openActivity(requested);
  const run = await catalogHost.session.checkActivity(requested);
  document.documentElement.dataset.browserActivity = requested;
  document.documentElement.dataset.browserCheck = run.status;
  document.documentElement.dataset.browserCheckCount = String(run.checks.length);
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
