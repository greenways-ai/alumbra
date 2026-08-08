import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
} from "@greenways/alumbra-hodos/catalog";
import { createCatalogHost } from "./catalog-host.js";

const container = document.querySelector("[data-renderer-catalog]");
const labStatus = document.querySelector("[data-status]");
const canvas = document.querySelector("#alumbra-canvas");

if (!container) throw new Error("Alumbra lab is missing the Renderer Catalog mount");

const eventLog = [];
const describe = (activityId) => ALUMBRA_RENDERER_CATALOG.activities
  .find((activity) => activity.id === activityId);

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
      canvas?.removeAttribute("aria-hidden");
      if (labStatus) labStatus.textContent = `${activity.title} opened from the installed Renderer Catalog.`;
      return;
    }
    if (labStatus) {
      labStatus.textContent = `${activity.title} selected. Its complete package project is installed for the Workspace host.`;
    }
  },
  async runChecks({ activityId, demo }) {
    const activity = describe(activityId);
    const checks = [
      {
        id: "catalog/identity",
        label: "Activity resolves through the installed semantic identity registry",
        status: demo && activity ? "passed" : "failed",
      },
      {
        id: "catalog/projection",
        label: "Projected Catalog activity exposes no project path",
        status: activity?.path == null ? "passed" : "failed",
      },
      {
        id: "catalog/event-boundary",
        label: "Catalog events contain identities but no installed project path",
        status: eventLog.every((event) => !Object.hasOwn(event.detail, "project")) ? "passed" : "failed",
      },
    ];
    if (demo.host === "playable-lab") {
      checks.push({
        id: "catalog/playable-lab",
        label: "The installed playable laboratory canvas is mounted",
        status: canvas ? "passed" : "failed",
      });
    }
    return {
      status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
      message: `${checks.filter((check) => check.status === "passed").length}/${checks.length} activity checks passed`,
      checks,
    };
  },
});

window.addEventListener("pagehide", () => catalogHost.dispose(), { once: true });
