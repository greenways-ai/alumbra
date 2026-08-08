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
  assert.equal(area["area/type"], "hodos.dev/catalog");
  assert.equal(
    area["area/component"]["component/model"].catalogId,
    "catalog/alumbra-renderer",
  );
  assert.equal(
    area["area/component"]["component/model"].selectedActivityId,
    "alumbra-hodos/renderer-catalog",
  );
  assert.ok(
    area["area/component"]["component/model"].activities.every((activity) => activity.path === null),
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
  assert.ok(Object.isFrozen(ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-hodos/renderer-catalog"]));
  assert.throws(() => {
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-hodos/renderer-catalog"].project = "elsewhere";
  }, TypeError);
});
