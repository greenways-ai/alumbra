import assert from "node:assert/strict";
import test from "node:test";
import {
  ALUMBRA_RENDERER_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS,
} from "../../../packages/hodos/generated/renderer-catalog.js";
import { createCatalogHost, createCatalogSession } from "../src/catalog-host.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  click() {
    for (const listener of this.listeners.get("click") ?? []) listener({ currentTarget: this });
  }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

const find = (node, predicate) => {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("generated Catalog projection contains the complete pathless renderer train", () => {
  assert.equal(ALUMBRA_RENDERER_CATALOG.id, "catalog/alumbra-renderer");
  assert.equal(ALUMBRA_RENDERER_CATALOG.toolsets.length, 6);
  assert.equal(ALUMBRA_RENDERER_CATALOG.activities.length, 18);
  assert.ok(ALUMBRA_RENDERER_CATALOG.activities.every((activity) => activity.path === null));
  assert.equal(ALUMBRA_RENDERER_CATALOG.selectedActivityId, "alumbra-hodos/renderer-catalog");
  assert.deepEqual(
    ALUMBRA_RENDERER_CATALOG.activities
      .filter((activity) => activity.toolsetId === "alumbra-core")
      .map((activity) => activity.id),
    [
      "alumbra-core/palette-backed-chunk",
      "alumbra-core/reversible-block-transaction",
    ],
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_CATALOG.activities
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
    ALUMBRA_RENDERER_CATALOG.activities
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
    ALUMBRA_RENDERER_CATALOG.activities
      .filter((activity) => activity.toolsetId === "alumbra-viewport-playcanvas")
      .map((activity) => activity.id),
    [
      "alumbra-viewport-playcanvas/playable-world",
      "alumbra-viewport-playcanvas/two-sessions",
    ],
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_CATALOG.activities
      .filter((activity) => activity.toolsetId === "alumbra-hodos")
      .map((activity) => activity.id),
    [
      "alumbra-hodos/renderer-catalog",
      "alumbra-hodos/renderer-workspace",
    ],
  );
  const packagedHara = ALUMBRA_RENDERER_CATALOG.activities
    .find((activity) => activity.id === "alumbra-hara/packaged-height-field");
  const workspace = ALUMBRA_RENDERER_CATALOG.activities
    .find((activity) => activity.id === "alumbra-hodos/renderer-workspace");
  const voxelLighting = ALUMBRA_RENDERER_CATALOG.activities
    .find((activity) => activity.id === "alumbra-engine/voxel-light-fields");
  const lightHandoff = ALUMBRA_RENDERER_CATALOG.activities
    .find((activity) => activity.id === "alumbra-renderer-playcanvas/light-field-handoff");
  assert.equal(packagedHara.metadata.surface, "viewport");
  assert.equal(packagedHara.checkCount, 9);
  assert.equal(workspace.metadata.surface, "world");
  assert.equal(workspace.checkCount, 10);
  assert.equal(voxelLighting.metadata.surface, "preview");
  assert.equal(voxelLighting.checkCount, 9);
  assert.equal(lightHandoff.metadata.surface, "viewport");
  assert.equal(lightHandoff.checkCount, 10);
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-core/reversible-block-transaction"].project,
    "packages/core/showcase/reversible-block-transaction",
  );
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-engine/build-intent-undo"].project,
    "packages/engine/showcase/build-intent-undo",
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-engine/voxel-light-fields"],
    {
      package: "@greenways/alumbra-engine",
      demo: "voxel-light-fields",
      project: "packages/engine/showcase/voxel-light-fields",
      surface: "preview",
      host: "showcase-project",
    },
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/light-field-handoff"],
    {
      package: "@greenways/alumbra-renderer-playcanvas",
      demo: "light-field-handoff",
      project: "packages/renderer-playcanvas/showcase/light-field-handoff",
      surface: "viewport",
      host: "showcase-project",
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
  assert.equal(ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-hara/packaged-height-field"].host, "playable-lab");
  assert.equal(ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-viewport-playcanvas/playable-world"].host, "playable-lab");
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/chunk-residency"],
    {
      package: "@greenways/alumbra-renderer-playcanvas",
      demo: "chunk-residency",
      project: "packages/renderer-playcanvas/showcase/chunk-residency",
      surface: "viewport",
      host: "showcase-project",
    },
  );
  assert.deepEqual(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-renderer-playcanvas/material-matrix"],
    {
      package: "@greenways/alumbra-renderer-playcanvas",
      demo: "material-matrix",
      project: "packages/renderer-playcanvas/showcase/material-matrix",
      surface: "viewport",
      host: "showcase-project",
    },
  );
});

test("browser Catalog selects and opens the installed playable lab by semantic id", async () => {
  const document = new FakeDocument();
  const container = new FakeElement("aside", document);
  const events = [];
  const opened = [];
  const host = createCatalogHost({
    container,
    document,
    catalog: ALUMBRA_RENDERER_CATALOG,
    installedDemos: ALUMBRA_RENDERER_INSTALLED_DEMOS,
    dispatch: (event) => events.push(event),
    openDemo: async (request) => opened.push(request),
  });

  const openButton = find(container, (node) => node.dataset?.catalogAction === "open");
  assert.ok(openButton, "Open activity button should be rendered");
  openButton.click();
  await settle();

  assert.equal(opened.length, 1);
  assert.equal(opened[0].activityId, "alumbra-hodos/renderer-catalog");
  assert.equal(opened[0].demo.host, "playable-lab");
  const openEvent = events.find((event) => event.type === "catalog/open-activity");
  assert.deepEqual(openEvent.detail, {
    activityId: "alumbra-hodos/renderer-catalog",
    toolsetId: "alumbra-hodos",
  });
  assert.equal(Object.hasOwn(openEvent.detail, "project"), false);

  host.dispose();
  assert.equal(container.children.length, 0);
});

test("Catalog opens viewport, packaged-Hara and Workspace activities through installed identities", async () => {
  const opened = [];
  const session = createCatalogSession({
    catalog: ALUMBRA_RENDERER_CATALOG,
    installedDemos: ALUMBRA_RENDERER_INSTALLED_DEMOS,
    openDemo: async (request) => opened.push(request),
  });
  for (const activityId of [
    "alumbra-viewport-playcanvas/two-sessions",
    "alumbra-hara/packaged-height-field",
    "alumbra-hodos/renderer-workspace",
  ]) {
    session.selectActivity(activityId);
    await session.openActivity();
  }
  assert.deepEqual(
    opened.map((request) => request.demo.project),
    [
      "packages/viewport-playcanvas/showcase/two-sessions",
      "packages/hara/showcase/packaged-height-field",
      "packages/hodos/showcase/renderer-workspace",
    ],
  );
  assert.ok(opened.every((request) => request.demo.host === "playable-lab"));
  session.dispose();
});

test("Catalog resolves renderer residency, material and lighting activities through installed projects", async () => {
  const opened = [];
  const session = createCatalogSession({
    catalog: ALUMBRA_RENDERER_CATALOG,
    installedDemos: ALUMBRA_RENDERER_INSTALLED_DEMOS,
    openDemo: async (request) => opened.push(request),
  });
  const activityIds = [
    "alumbra-renderer-playcanvas/chunk-residency",
    "alumbra-renderer-playcanvas/stale-mesh-rejection",
    "alumbra-renderer-playcanvas/material-matrix",
    "alumbra-renderer-playcanvas/environment-profile",
    "alumbra-renderer-playcanvas/light-aware-meshing",
    "alumbra-renderer-playcanvas/light-field-handoff",
  ];
  for (const activityId of activityIds) {
    session.selectActivity(activityId);
    await session.openActivity();
  }
  assert.deepEqual(
    opened.map((request) => request.demo.project),
    [
      "packages/renderer-playcanvas/showcase/chunk-residency",
      "packages/renderer-playcanvas/showcase/stale-mesh-rejection",
      "packages/renderer-playcanvas/showcase/material-matrix",
      "packages/renderer-playcanvas/showcase/environment-profile",
      "packages/renderer-playcanvas/showcase/light-aware-meshing",
      "packages/renderer-playcanvas/showcase/light-field-handoff",
    ],
  );
  assert.ok(opened.every((request) => request.demo.host === "showcase-project"));
  session.dispose();
});

test("Catalog session rejects caller-supplied paths and unknown identities", async () => {
  const session = createCatalogSession({
    catalog: ALUMBRA_RENDERER_CATALOG,
    installedDemos: ALUMBRA_RENDERER_INSTALLED_DEMOS,
  });
  await assert.rejects(
    session.openActivity({
      activityId: "alumbra-hodos/renderer-catalog",
      project: "../../outside",
    }),
    /activity id must be a non-empty string/,
  );
  await assert.rejects(session.openActivity("catalog/not-installed"), /Unknown Catalog activity/);
  session.dispose();
});
