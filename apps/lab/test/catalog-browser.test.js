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

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

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
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
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

test("generated Catalog projection contains identities but no project paths", () => {
  assert.equal(ALUMBRA_RENDERER_CATALOG.id, "catalog/alumbra-renderer");
  assert.equal(ALUMBRA_RENDERER_CATALOG.toolsets.length, 5);
  assert.equal(ALUMBRA_RENDERER_CATALOG.activities.length, 7);
  assert.ok(ALUMBRA_RENDERER_CATALOG.activities.every((activity) => activity.path === null));
  assert.equal(
    ALUMBRA_RENDERER_CATALOG.selectedActivityId,
    "alumbra-hodos/renderer-catalog",
  );
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-hodos/renderer-catalog"].host,
    "playable-lab",
  );
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-core/reversible-block-transaction"].project,
    "packages/core/showcase/reversible-block-transaction",
  );
  assert.equal(
    ALUMBRA_RENDERER_INSTALLED_DEMOS["alumbra-engine/build-intent-undo"].project,
    "packages/engine/showcase/build-intent-undo",
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
