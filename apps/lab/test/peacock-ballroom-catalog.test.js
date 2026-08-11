import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_DEFAULT_STATE,
  PEACOCK_BALLROOM_PACKAGE,
  PEACOCK_BALLROOM_PROVIDER_ID,
  PEACOCK_BALLROOM_STATE_IDS,
} from "../../../packages/hodos/src/catalog.js";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/peacock-ballroom-catalog-entry.js", import.meta.url), "utf8");
const rootProject = readFileSync(new URL("../../../project.edn", import.meta.url), "utf8");

test("extends the generated Catalog with one pathless provider-backed world activity", () => {
  assert.equal(ALUMBRA_RENDERER_CATALOG.activities.length, 20);
  const activity = ALUMBRA_RENDERER_CATALOG.activities
    .find((candidate) => candidate.id === PEACOCK_BALLROOM_ACTIVITY_ID);
  assert.ok(activity);
  assert.equal(activity.toolsetId, "alumbra-hara");
  assert.equal(activity.path, null);
  assert.equal(activity.metadata.providerId, PEACOCK_BALLROOM_PROVIDER_ID);
  assert.equal(activity.metadata.providerPackage, PEACOCK_BALLROOM_PACKAGE);
  assert.deepEqual(activity.metadata.states, PEACOCK_BALLROOM_STATE_IDS);
  assert.equal(activity.metadata.surface, "viewport");
});

test("installs the activity by semantic provider identity without renderer authority", () => {
  assert.deepEqual(ALUMBRA_RENDERER_INSTALLED_DEMOS[PEACOCK_BALLROOM_ACTIVITY_ID], {
    package: "@greenways/alumbra-hara",
    demo: "peacock-ballroom",
    project: "packages/hara/showcase/peacock-ballroom",
    surface: "viewport",
    host: "peacock-ballroom",
    provider: {
      id: PEACOCK_BALLROOM_PROVIDER_ID,
      activity: PEACOCK_BALLROOM_ACTIVITY_ID,
      package: PEACOCK_BALLROOM_PACKAGE,
      defaultState: PEACOCK_BALLROOM_DEFAULT_STATE,
      states: PEACOCK_BALLROOM_STATE_IDS,
    },
  });
  const serialized = JSON.stringify(ALUMBRA_RENDERER_INSTALLED_DEMOS[PEACOCK_BALLROOM_ACTIVITY_ID]);
  assert.doesNotMatch(serialized, /mesh|shader|chunk|callback|PlayCanvas/);
});

test("mounts the same standalone provider host inside the live Lab Catalog", () => {
  assert.match(page, /id="alumbra-peacock-ballroom-frame"/);
  assert.match(page, /src="\.\/src\/peacock-ballroom-catalog-entry\.js"/);
  assert.match(page, /@greenways\/alumbra-hodos\/catalog.*packages\/hodos\/src\/catalog\.js/s);
  assert.match(entry, /PEACOCK_BALLROOM_ACTIVITY_ID/);
  assert.match(entry, /peacock-ballroom\.html/);
  assert.match(entry, /setViewportEvidenceContributor\("peacockBallroom"/);
});

test("publishes the exact Hodos world-provider descriptor at repository root", () => {
  assert.match(rootProject, /:project\/world/);
  assert.match(rootProject, /:provider\/id "alumbra\/world"/);
  assert.match(rootProject, /:provider\/activity "alumbra-hara\/peacock-ballroom"/);
  assert.match(rootProject, /hara:greenways\/alumbra-peacock-ballroom@0\.1\.0/);
  for (const stateId of PEACOCK_BALLROOM_STATE_IDS) {
    assert.ok(rootProject.includes(`"${stateId}"`));
  }
});
