import assert from "node:assert/strict";
import test from "node:test";
import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
  createAlumbraRendererCatalogArea,
} from "../generated/renderer-catalog.js";

test("renderer catalog adapts through the canonical Hodos createCatalogArea function", () => {
  const area = createAlumbraRendererCatalogArea((options) => ({
    "area/type": "hodos.dev/catalog",
    "area/component": { "component/model": options },
  }));
  const model = area["area/component"]["component/model"];
  assert.equal(area["area/type"], "hodos.dev/catalog");
  assert.equal(model.catalogId, "catalog/alumbra-renderer");
  assert.equal(model.selectedActivityId, "alumbra-hodos/renderer-catalog");
  assert.equal(model.toolsets.length, 6);
  assert.equal(model.activities.length, 9);
  assert.ok(model.activities.every((activity) => activity.path === null));
  assert.deepEqual(
    model.activities
      .filter((activity) => activity.toolsetId === "alumbra-viewport-playcanvas")
      .map((activity) => activity.id),
    [
      "alumbra-viewport-playcanvas/playable-world",
      "alumbra-viewport-playcanvas/two-sessions",
    ],
  );
  assert.deepEqual(
    model.activities
      .filter((activity) => activity.toolsetId === "alumbra-renderer-playcanvas")
      .map((activity) => activity.id),
    [
      "alumbra-renderer-playcanvas/greedy-meshing",
      "alumbra-renderer-playcanvas/chunk-residency",
      "alumbra-renderer-playcanvas/stale-mesh-rejection",
    ],
  );
  assert.throws(
    () => createAlumbraRendererCatalogArea(() => ({}), {
      activities: [{ id: "injected", path: "../../outside" }],
    }),
    /Unsupported Alumbra Renderer Catalog override: activities/,
  );
});

test("generated Catalog and installed-demo registry are deeply immutable", () => {
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_CATALOG));
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_CATALOG.activities));
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_CATALOG.activities[0].metadata));
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_INSTALLED_DEMOS));
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-viewport-playcanvas/two-sessions"]));
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/chunk-residency"]));
  assert.throws(() => {
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-viewport-playcanvas/two-sessions"].project = "elsewhere";
  }, TypeError);
  assert.throws(() => {
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/chunk-residency"].project = "elsewhere";
  }, TypeError);
});
