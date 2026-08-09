import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../src/material-entry.js", import.meta.url), "utf8");
const host = fs.readFileSync(new URL("../src/material-host.js", import.meta.url), "utf8");
const catalog = [
  fs.readFileSync(new URL("../src/catalog-entry.js", import.meta.url), "utf8"),
  fs.readFileSync(new URL("../src/catalog-checks.js", import.meta.url), "utf8"),
].join("\n");
const browser = fs.readFileSync(new URL("../../../scripts/check-lab-browser.sh", import.meta.url), "utf8");
const materialProfiles = fs.readFileSync(
  new URL("../../../packages/renderer-playcanvas/src/material-profile.js", import.meta.url),
  "utf8",
);
const environments = fs.readFileSync(
  new URL("../../../packages/renderer-playcanvas/src/environment-profile.js", import.meta.url),
  "utf8",
);
const prebuilt = fs.readFileSync(
  new URL("../../../packages/renderer-playcanvas/src/prebuilt-renderer.js", import.meta.url),
  "utf8",
);

test("lab mounts the material matrix and environment stories through a separate bounded host", () => {
  assert.match(index, /alumbra-canvas-materials/);
  assert.match(index, /material-entry\.js/);
  assert.match(entry, /createMaterialStoryHost/);
  assert.match(entry, /setViewportEvidenceContributor\("materials"/);
  assert.match(host, /alumbra-renderer-playcanvas\/material-matrix/);
  assert.match(host, /alumbra-renderer-playcanvas\/environment-profile/);
  assert.match(host, /unknownMaterialProfileProbe/);
  assert.match(host, /allocationBaseline/);
  assert.doesNotMatch(host, /@greenways\/hodos|localStorage|createWorldSave/);
});

test("material and environment contracts stay closed and renderer-owned", () => {
  assert.match(materialProfiles, /MATERIAL_PROFILE_FORMAT/);
  assert.match(materialProfiles, /opaque.*cutout.*transparent.*emissive.*overlay/s);
  assert.match(materialProfiles, /renderer\/material-profile-not-installed/);
  assert.match(environments, /ENVIRONMENT_PROFILE_FORMAT/);
  assert.match(environments, /alumbra\/daylight/);
  assert.match(environments, /alumbra\/fog/);
  assert.match(environments, /alumbra\/emissive-night/);
  assert.match(prebuilt, /Resolve every material profile before allocating/);
  assert.match(prebuilt, /materialEvidence/);
  assert.doesNotMatch(materialProfiles, /@greenways\/hodos|Workspace|localStorage/);
  assert.doesNotMatch(environments, /@greenways\/hodos|Workspace|localStorage/);
});

test("Catalog and Chromium gates run all AR-04 named states without project paths", () => {
  assert.match(catalog, /materials\/daylight/);
  assert.match(catalog, /materials\/fog/);
  assert.match(catalog, /materials\/emissive/);
  assert.match(catalog, /materials\/unknown-profile-error/);
  assert.match(catalog, /data\.browserMaterial|browserMaterial/);
  assert.match(browser, /alumbra-renderer-playcanvas\/material-matrix/);
  assert.match(browser, /alumbra-renderer-playcanvas\/environment-profile/);
  assert.match(browser, /data-browser-material-error="passed"/);
});
