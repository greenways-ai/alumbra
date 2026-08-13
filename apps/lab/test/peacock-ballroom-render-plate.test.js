import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  PEACOCK_BALLROOM_RENDER_PLATE_EVIDENCE_FORMAT,
  createPeacockBallroomRenderPlateHost,
  peacockBallroomRenderPlateBlend,
  resolvePeacockBallroomRenderPlateAsset,
} from "../src/peacock-ballroom-render-plate.js";
import {createPeacockBallroomRenderPlateDescriptor} from "../../../packages/hara/src/index.js";

const source = readFileSync(
  new URL("../src/peacock-ballroom-render-plate.js", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/peacock-ballroom-render-plate.css", import.meta.url),
  "utf8",
);

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) ?? ""; }
}

class FakeElement extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.className = "";
    this.src = "";
    this.complete = false;
    this.naturalWidth = 0;
    this.removed = false;
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "src") this.src = "";
  }
  remove() { this.removed = true; }
  decode() { return Promise.resolve(); }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function fixture() {
  const document = new FakeDocument();
  const root = new FakeElement("section", document);
  return {document, root};
}

test("resolves only the installed visual-language Peacock render masters", () => {
  assert.equal(
    resolvePeacockBallroomRenderPlateAsset("visual-language/greenways/peacock-ballroom-day"),
    "https://oss.greenways.ai/visual-language/artwork/greenways/peacock-ballroom-day.webp",
  );
  assert.equal(
    resolvePeacockBallroomRenderPlateAsset("visual-language/greenways/peacock-ballroom-night"),
    "https://oss.greenways.ai/visual-language/artwork/greenways/peacock-ballroom-night.webp",
  );
  assert.throws(
    () => resolvePeacockBallroomRenderPlateAsset("visual-language/greenways/other"),
    /not installed/,
  );
});

test("crossfades the matte plate into structural geometry as the player leaves its calibrated view", () => {
  const descriptor = createPeacockBallroomRenderPlateDescriptor("ballroom/day", "desktop", "day");
  const hero = peacockBallroomRenderPlateBlend(descriptor, descriptor.anchor);
  assert.equal(hero.fidelity, 1);
  assert.equal(hero.opacity, 0.96);
  assert.equal(hero.geometryOpacity, 0.18);
  assert.deepEqual(hero.translate, [0, 0]);
  assert.equal(hero.scale, 1.03);

  const moved = peacockBallroomRenderPlateBlend(descriptor, {
    position: [10.5, 5.05, 13.5],
    yaw: 70,
    pitch: 18,
  });
  assert.equal(moved.fidelity, 0);
  assert.equal(moved.opacity, descriptor.parallax.minimumOpacity);
  assert.equal(moved.geometryOpacity, 0.82);
  assert.ok(Math.abs(moved.translate[0]) <= 8);
  assert.ok(Math.abs(moved.translate[1]) <= 6);
});

test("loads, projects, suspends and disposes one DOM-backed render plate", async () => {
  const {document, root} = fixture();
  const evidence = [];
  const host = createPeacockBallroomRenderPlateHost({
    root,
    document,
    resolveAsset: () => "https://example.test/peacock-ballroom-day.webp",
    onEvidence: (value) => evidence.push(value),
  });
  assert.equal(root.children.length, 1);
  assert.equal(host.element.children.length, 2);

  const opening = host.open("ballroom/day");
  assert.equal(host.snapshot().status, "loading");
  assert.equal(host.image.src, "https://example.test/peacock-ballroom-day.webp");
  host.image.complete = true;
  host.image.naturalWidth = 1536;
  host.image.dispatchEvent(new Event("load"));
  const ready = await opening;
  assert.equal(ready.format, PEACOCK_BALLROOM_RENDER_PLATE_EVIDENCE_FORMAT);
  assert.equal(ready.status, "ready");
  assert.equal(ready.loaded, true);
  assert.equal(ready.assetId, "visual-language/greenways/peacock-ballroom-day");
  assert.equal(ready.sourceBlob, "ceeb1917f99142f39f06e6de7424333e9d2df360");
  assert.equal(ready.opacity, 0.96);
  assert.equal(ready.geometryOpacity, 0.18);
  assert.equal(host.element.dataset.renderPlateState, "ready");
  assert.equal(
    host.element.style.getPropertyValue("--ballroom-render-plate-opacity"),
    "0.96",
  );

  const moved = host.setPose({position: [1.5, 2.05, 22.5], yaw: 12, pitch: -3});
  assert.equal(moved.status, "ready");
  assert.ok(moved.poses >= 1);
  assert.ok(moved.opacity < ready.opacity);
  assert.ok(moved.geometryOpacity > ready.geometryOpacity);

  assert.equal(host.suspend("document-hidden"), true);
  assert.equal(host.snapshot().suspended, true);
  assert.equal(host.element.style.getPropertyValue("--ballroom-render-plate-opacity"), "0");
  assert.equal(host.resume("document-visible"), true);
  assert.equal(host.snapshot().suspended, false);

  const disposed = host.destroy();
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.loaded, false);
  assert.equal(host.element.removed, true);
  assert.ok(evidence.length >= 5);
});

test("keeps the plate DOM-only and non-interactive", () => {
  assert.match(source, /createElement\("img"\)/);
  assert.match(source, /pointer-events: none|render plate host requires a DOM mount/);
  assert.doesNotMatch(source, /drawImage|createTexture|meshInstance|shader|WebGLRenderingContext/);
  assert.match(styles, /\.ballroom-render-plate-layer/);
  assert.match(styles, /pointer-events: none/);
  assert.match(styles, /object-fit: cover/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /forced-colors/);
});
