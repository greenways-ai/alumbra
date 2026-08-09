import * as pc from "playcanvas";
import {
  CHUNK_RESIDENCY_ACTIVITY,
} from "./residency-host.js";
import {
  MATERIAL_MATRIX_ACTIVITY,
} from "./material-host.js";
import {
  RENDERER_WORKSPACE_ACTIVITY,
  WORKSPACE_RENDERER_ACTIVITIES,
  WORKSPACE_STATE_IDS,
  createRendererWorkspaceStoryHost,
} from "./workspace-host.js";
import { setViewportEvidenceContributor } from "./viewport-evidence.js";

const shell = document.querySelector("[data-renderer-workspace]");
const canvas = document.querySelector("#alumbra-canvas-workspace");
const viewportGrid = document.querySelector("[data-viewport-grid]");
const status = document.querySelector("[data-status]");
const workspaceStatus = document.querySelector("[data-workspace-status]");
const workspaceLayout = document.querySelector("[data-workspace-layout]");
const workspaceEngine = document.querySelector("[data-workspace-engine]");
const workspaceWorld = document.querySelector("[data-workspace-world]");
const workspaceLifecycle = document.querySelector("[data-workspace-lifecycle]");
const workspaceProblems = document.querySelector("[data-workspace-problems]");
const workspaceExecution = document.querySelector("[data-workspace-execution]");
const workspaceRepl = document.querySelector("[data-workspace-repl]");
const activityButtons = [...document.querySelectorAll("[data-workspace-activity]")];
const surfaceButtons = [...document.querySelectorAll("[data-workspace-surface]")];

if (!shell || !canvas || !viewportGrid || !status) {
  throw new Error("Alumbra lab is missing the renderer Workspace surface");
}

const host = createRendererWorkspaceStoryHost({ pc, canvas });
let active = false;
let disposed = false;

function hideLegacySurfaces() {
  viewportGrid.hidden = true;
  document.querySelector("[data-residency-panel]")?.setAttribute("hidden", "");
  document.querySelector("[data-material-panel]")?.setAttribute("hidden", "");
  document.querySelector("[data-packaged-world-error]")?.setAttribute("hidden", "");
  shell.hidden = false;
  document.body.dataset.viewportMode = "workspace";
}

function render(snapshot) {
  const workspace = snapshot.workspace;
  if (!workspace) return;
  shell.dataset.layout = workspace.layout;
  shell.dataset.surface = workspace.activeSurfaceId;
  shell.dataset.activity = workspace.activeActivityId ?? "none";
  canvas.hidden = workspace.activeSurfaceId !== "world";
  for (const button of activityButtons) {
    const selected = button.dataset.workspaceActivity === workspace.activeActivityId;
    button.dataset.selected = selected ? "true" : "false";
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
  for (const button of surfaceButtons) {
    const selected = button.dataset.workspaceSurface === workspace.activeSurfaceId;
    button.dataset.selected = selected ? "true" : "false";
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.hidden = workspace.layout === "compact" && !workspace.visibleSurfaceIds.includes(button.dataset.workspaceSurface);
  }
  if (workspaceStatus) workspaceStatus.textContent = `${workspace.status} · ${workspace.viewportStatus}`;
  if (workspaceLayout) workspaceLayout.textContent = `${workspace.layout} · ${Math.round(workspace.viewportWidth)}px`;
  if (workspaceEngine) workspaceEngine.textContent = workspace.engineId ?? "—";
  if (workspaceWorld) workspaceWorld.textContent = workspace.worldId ?? "—";
  if (workspaceLifecycle) {
    workspaceLifecycle.textContent = `${workspace.createdHosts} create · ${workspace.modelUpdates} update · ${workspace.destroyedHosts} destroy · ${workspace.suspendedHosts}/${workspace.resumedHosts} suspend/resume`;
  }
  if (workspaceProblems) workspaceProblems.textContent = snapshot.proofs?.boundedEvidence ? "0 bounded problems" : "1 evidence problem";
  if (workspaceExecution) workspaceExecution.textContent = `${workspace.activitySwitches} switch · ${workspace.surfaceChanges} surface changes`;
  if (workspaceRepl) workspaceRepl.textContent = workspace.layout === "wide" ? "session idle · input authority withheld" : "hidden in compact layout";
}

async function openWorkspace(stateId) {
  active = true;
  hideLegacySurfaces();
  status.textContent = "Opening the integrated Hodos renderer Workspace…";
  const snapshot = await host.open(stateId);
  if (!active) return snapshot;
  hideLegacySurfaces();
  render(snapshot);
  status.textContent = `${snapshot.activeState} proved model reuse, suspension, resumption and activity disposal.`;
  return snapshot;
}

async function closeWorkspace(reason) {
  if (!active) return host.snapshot();
  active = false;
  const snapshot = await host.close(reason);
  shell.hidden = true;
  viewportGrid.hidden = false;
  return snapshot;
}

const openDemo = (event) => {
  const activityId = event.detail?.activityId;
  if (activityId === RENDERER_WORKSPACE_ACTIVITY) {
    void openWorkspace(event.detail?.stateId ?? WORKSPACE_STATE_IDS.wide)
      .catch((error) => console.error("Alumbra renderer Workspace failed", error));
    return;
  }
  void closeWorkspace(`activity:${activityId ?? "unknown"}`)
    .catch((error) => console.error("Alumbra renderer Workspace disposal failed", error));
};
window.addEventListener("alumbra:open-demo", openDemo);

const activityClick = (event) => {
  const button = event.target.closest?.("button[data-workspace-activity]");
  const activityId = button?.dataset.workspaceActivity;
  if (!activityId || !WORKSPACE_RENDERER_ACTIVITIES.includes(activityId)) return;
  void host.selectActivity(activityId).then(render)
    .catch((error) => console.error("Renderer Workspace activity switch failed", error));
};
shell.addEventListener("click", activityClick);

const surfaceClick = (event) => {
  const button = event.target.closest?.("button[data-workspace-surface]");
  const surfaceId = button?.dataset.workspaceSurface;
  if (!surfaceId) return;
  void host.selectSurface(surfaceId).then(render)
    .catch((error) => console.error("Renderer Workspace surface selection failed", error));
};
shell.addEventListener("click", surfaceClick);

const resize = () => {
  if (!active) return;
  const width = shell.clientWidth || window.innerWidth;
  void host.setViewportWidth(width).then((snapshot) => {
    render(snapshot);
    host.resize();
  }).catch((error) => console.error("Renderer Workspace resize failed", error));
};
window.addEventListener("resize", resize);

const clearEvidence = setViewportEvidenceContributor("workspace", () => host.snapshot());

function destroy() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("alumbra:open-demo", openDemo);
  window.removeEventListener("resize", resize);
  shell.removeEventListener("click", activityClick);
  shell.removeEventListener("click", surfaceClick);
  clearEvidence();
  void host.destroy();
}
window.addEventListener("pagehide", destroy, { once: true });

void MATERIAL_MATRIX_ACTIVITY;
void CHUNK_RESIDENCY_ACTIVITY;
