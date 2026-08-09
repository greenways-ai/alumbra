import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../src/workspace-entry.js", import.meta.url), "utf8");
const host = fs.readFileSync(new URL("../src/workspace-host.js", import.meta.url), "utf8");
const catalog = [
  fs.readFileSync(new URL("../src/catalog-entry.js", import.meta.url), "utf8"),
  fs.readFileSync(new URL("../src/catalog-checks.js", import.meta.url), "utf8"),
].join("\n");
const browser = fs.readFileSync(new URL("../../../scripts/check-lab-browser.sh", import.meta.url), "utf8");
const workspace = fs.readFileSync(
  new URL("../../../packages/hodos/src/renderer-workspace.js", import.meta.url),
  "utf8",
);
const showcase = fs.readFileSync(
  new URL("../../../packages/hodos/showcase/renderer-workspace/workspace.edn", import.meta.url),
  "utf8",
);

test("lab mounts the integrated Hodos renderer Workspace through a dedicated live canvas", () => {
  assert.match(index, /data-renderer-workspace/);
  assert.match(index, /alumbra-canvas-workspace/);
  assert.match(index, /workspace-entry\.js/);
  assert.match(entry, /createRendererWorkspaceStoryHost/);
  assert.match(entry, /setViewportEvidenceContributor\("workspace"/);
  assert.match(host, /createRendererWorkspaceSession/);
  assert.match(host, /createMaterialStoryHost/);
  assert.match(host, /createResidencyStoryHost/);
  assert.match(host, /modelUpdatePreserved/);
  assert.match(host, /hiddenWorldSuspended/);
  assert.match(host, /resumedSameWorld/);
  assert.match(host, /activitySwitchDisposedPrevious/);
  assert.doesNotMatch(host, /localStorage|createWorldSave|restoreWorldSave/);
});

test("Hodos Workspace lifecycle keeps Catalog, viewport and Dev authorities separate", () => {
  assert.match(workspace, /catalog\/installed-identities/);
  assert.match(workspace, /viewport\/engine-host/);
  assert.match(workspace, /code\/document-metadata/);
  assert.match(workspace, /execution\/bounded-events/);
  assert.match(workspace, /problems\/bounded-diagnostics/);
  assert.match(workspace, /repl\/session-status/);
  assert.match(workspace, /cannot replace world, session or engine identity/);
  assert.match(workspace, /host\.suspend/);
  assert.match(workspace, /host\.resume/);
  assert.match(workspace, /destroyCurrent/);
  assert.doesNotMatch(workspace, /playcanvas|mesh buffer|shader source|project path/i);
});

test("Workspace Showcase defines the requested wide layout and compact surfaces", () => {
  assert.match(showcase, /area\/catalog/);
  assert.match(showcase, /area\/world/);
  assert.match(showcase, /area\/code/);
  assert.match(showcase, /area\/execution/);
  assert.match(showcase, /area\/problems/);
  assert.match(showcase, /area\/repl/);
  assert.match(showcase, /responsive\/breakpoint 880/);
  assert.match(showcase, /surface\/id "catalog"/);
  assert.match(showcase, /surface\/id "world"/);
  assert.match(showcase, /surface\/id "code"/);
  assert.match(showcase, /surface\/id "execution"/);
  assert.match(showcase, /surface\/id "problems"/);
});

test("Catalog and Chromium gates run both Workspace layouts with bounded lifecycle evidence", () => {
  assert.match(catalog, /alumbra-hodos\/renderer-workspace/);
  assert.match(catalog, /workspace\/wide/);
  assert.match(catalog, /workspace\/compact/);
  assert.match(catalog, /browserWorkspace/);
  assert.match(catalog, /browserWorkspaceLayout/);
  assert.match(catalog, /workspace\/model-reuse/);
  assert.match(catalog, /workspace\/hidden-suspends/);
  assert.match(catalog, /workspace\/return-resumes/);
  assert.match(catalog, /workspace\/activity-disposal/);
  assert.match(catalog, /workspace\/separate-authorities/);
  assert.match(catalog, /workspace\/bounded-evidence/);
  assert.match(browser, /alumbra-hodos\/renderer-workspace/);
  assert.match(browser, /data-browser-workspace="passed"/);
  assert.match(browser, /data-browser-workspace-layout/);
  assert.match(browser, /data-browser-disposal="passed"/);
});
