import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../src/residency-entry.js", import.meta.url), "utf8");
const host = fs.readFileSync(new URL("../src/residency-host.js", import.meta.url), "utf8");
const catalog = [
  fs.readFileSync(new URL("../src/catalog-entry.js", import.meta.url), "utf8"),
  fs.readFileSync(new URL("../src/catalog-checks.js", import.meta.url), "utf8"),
].join("\n");
const browser = fs.readFileSync(new URL("../../../scripts/check-lab-browser.sh", import.meta.url), "utf8");
const prebuilt = fs.readFileSync(
  new URL("../../../packages/renderer-playcanvas/src/prebuilt-renderer.js", import.meta.url),
  "utf8",
);

test("lab mounts both renderer residency stories through a separate live host", () => {
  assert.match(index, /alumbra-canvas-residency/);
  assert.match(index, /residency-entry\.js/);
  assert.match(entry, /createResidencyStoryHost/);
  assert.match(entry, /setViewportEvidenceContributor\("residency"/);
  assert.match(entry, /alumbra:open-demo/);
  assert.match(host, /alumbra-renderer-playcanvas\/chunk-residency/);
  assert.match(host, /alumbra-renderer-playcanvas\/stale-mesh-rejection/);
  assert.match(host, /createChunkResidencyScheduler/);
  assert.match(host, /createPlayCanvasPrebuiltMeshRenderer/);
  assert.match(host, /buildChunkMesh/);
  assert.match(host, /discardedStaleJobs/);
  assert.match(host, /rendererAtBaseline/);
  assert.match(host, /moveView/);
  assert.match(entry, /KeyA/);
  assert.match(entry, /ArrowRight/);
  assert.doesNotMatch(host, /@greenways\/hodos|localStorage|createWorldSave/);
});

test("Catalog and Chromium gates exercise live residency without exposing renderer authority", () => {
  assert.match(catalog, /residency\/cross-boundary/);
  assert.match(catalog, /residency\/stale-rejection/);
  assert.match(catalog, /data\.browserResidency|browserResidency/);
  assert.match(catalog, /KeyboardEvent/);
  assert.match(catalog, /browserResidencyMove/);
  assert.match(browser, /alumbra-renderer-playcanvas\/chunk-residency/);
  assert.match(browser, /alumbra-renderer-playcanvas\/stale-mesh-rejection/);
  assert.match(browser, /data-browser-disposal="passed"/);
  assert.match(prebuilt, /validatePrebuiltChunkMesh/);
  assert.match(prebuilt, /installChunkMesh/);
  assert.match(prebuilt, /meshPool/);
  assert.match(prebuilt, /materialPool/);
  assert.doesNotMatch(prebuilt, /Hodos|Workspace|localStorage/);
});
