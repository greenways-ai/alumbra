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
  assert.equal(model.activities.length, 19);
  assert.ok(model.activities.every((activity) => activity.path === null));
  assert.deepEqual(
    model.activities
      .filter((activity) => activity.toolsetId === "alumbra-core")
      .map((activity) => activity.id),
    [
      "alumbra-core/palette-backed-chunk",
      "alumbra-core/reversible-block-transaction",
    ],
  );
  assert.deepEqual(
    model.activities
      .filter((activity) => activity.toolsetId === "alumbra-engine")
      .map((activity) => activity.id),
    [
      "alumbra-engine/walk-collide-jump",
      "alumbra-engine/build-intent-undo",
      "alumbra-engine/voxel-light-fields",
      "alumbra-engine/lighting-runtime-fences",
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
      "alumbra-renderer-playcanvas/material-matrix",
      "alumbra-renderer-playcanvas/environment-profile",
      "alumbra-renderer-playcanvas/light-aware-meshing",
      "alumbra-renderer-playcanvas/light-field-handoff",
    ],
  );
  assert.deepEqual(
    model.activities
      .filter((activity) => activity.toolsetId === "alumbra-viewport-playcanvas")
      .map((activity) => activity.id),
    [
      "alumbra-viewport-playcanvas/playable-world",
      "alumbra-viewport-playcanvas/two-sessions",
      "alumbra-viewport-playcanvas/lit-world",
    ],
  );
  assert.deepEqual(
    model.activities
      .filter((activity) => activity.toolsetId === "alumbra-hodos")
      .map((activity) => activity.id),
    [
      "alumbra-hodos/renderer-catalog",
      "alumbra-hodos/renderer-workspace",
    ],
  );
  const workspace = model.activities
    .find((activity) => activity.id === "alumbra-hodos/renderer-workspace");
  const voxelLighting = model.activities
    .find((activity) => activity.id === "alumbra-engine/voxel-light-fields");
  const lightHandoff = model.activities
    .find((activity) => activity.id === "alumbra-renderer-playcanvas/light-field-handoff");
  assert.equal(workspace.metadata.surface, "world");
  assert.equal(voxelLighting.metadata.surface, "preview");
  assert.equal(voxelLighting.checkCount, 9);
  assert.equal(lightHandoff.metadata.surface, "viewport");
  assert.equal(lightHandoff.checkCount, 10);
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
  for (const activityId of [
    "alumbra-core/reversible-block-transaction",
    "alumbra-engine/build-intent-undo",
    "alumbra-engine/voxel-light-fields",
    "alumbra-engine/lighting-runtime-fences",
    "alumbra-renderer-playcanvas/chunk-residency",
    "alumbra-renderer-playcanvas/material-matrix",
    "alumbra-renderer-playcanvas/environment-profile",
    "alumbra-renderer-playcanvas/light-aware-meshing",
    "alumbra-renderer-playcanvas/light-field-handoff",
    "alumbra-viewport-playcanvas/two-sessions",
    "alumbra-viewport-playcanvas/lit-world",
    "alumbra-hodos/renderer-workspace",
  ]) {
    assert.ok(Object.isFrozen(ALUMBRA_RENDERER_INSTALLED_DEMOS[activityId]));
  }
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-core/reversible-block-transaction"].project,
    "packages/core/showcase/reversible-block-transaction",
  );
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-engine/build-intent-undo"].project,
    "packages/engine/showcase/build-intent-undo",
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-engine/lighting-runtime-fences"],
    {
      package: "@greenways/alumbra-engine",
      demo: "lighting-runtime-fences",
      project: "packages/engine/showcase/lighting-runtime-fences",
      surface: "preview",
      host: "showcase-project",
    },
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/light-aware-meshing"],
    {
      package: "@greenways/alumbra-renderer-playcanvas",
      demo: "light-aware-meshing",
      project: "packages/renderer-playcanvas/showcase/light-aware-meshing",
      surface: "viewport",
      host: "showcase-project",
    },
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-viewport-playcanvas/lit-world"],
    {
      package: "@greenways/alumbra-viewport-playcanvas",
      demo: "lit-world",
      project: "packages/viewport-playcanvas/showcase/lit-world",
      surface: "viewport",
      host: "playable-lab",
    },
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-hodos/renderer-workspace"],
    {
      package: "@greenways/alumbra-hodos",
      demo: "renderer-workspace",
      project: "packages/hodos/showcase/renderer-workspace",
      surface: "world",
      host: "playable-lab",
    },
  );
  assert.throws(() => {
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-hodos/renderer-workspace"].project = "elsewhere";
  }, TypeError);
  assert.throws(() => {
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/material-matrix"].project = "elsewhere";
  }, TypeError);
  assert.throws(() => {
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/light-aware-meshing"].project = "elsewhere";
  }, TypeError);
});
