import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const bootstrap = readFileSync(
  new URL("../src/peacock-ballroom-canvas-bootstrap.js", import.meta.url),
  "utf8",
);
const documentSource = readFileSync(
  new URL("../peacock-ballroom.html", import.meta.url),
  "utf8",
);
const renderEntry = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-entry.js", import.meta.url),
  "utf8",
);
const worldEntry = readFileSync(
  new URL("../src/peacock-ballroom-entry.js", import.meta.url),
  "utf8",
);

test("installs canvas sizing synchronously before every module entry point", () => {
  const bootstrapScript = documentSource.indexOf(
    '<script src="./src/peacock-ballroom-canvas-bootstrap.js?v=pb-canvas-1"></script>',
  );
  const firstModule = documentSource.indexOf('<script type="module"');
  const worldEntryScript = documentSource.indexOf("peacock-ballroom-entry.js");
  assert.ok(bootstrapScript >= 0);
  assert.ok(firstModule > bootstrapScript);
  assert.ok(worldEntryScript > bootstrapScript);
  assert.doesNotMatch(renderEntry, /peacock-ballroom-canvas-bootstrap\.js/);
});

test("uses the document viewport when percentage layout has not acquired a box yet", () => {
  for (const token of [
    "visualViewport",
    "root.clientWidth",
    "body.clientHeight",
    "globalThis.innerWidth",
    "globalThis.innerHeight",
    "viewport-fallback",
    'canvas.style.width = `${width}px`',
    'canvas.style.height = `${height}px`',
  ]) {
    assert.ok(bootstrap.includes(token), token);
  }
  assert.match(bootstrap, /width > 1 && height > 1/);
  assert.doesNotMatch(bootstrap, /setTimeout|setInterval|Date\.now|Math\.random/);
});

test("pins the first observed host size and follows later host shrinkage", () => {
  assert.match(bootstrap, /const hostWidth = Math\.max\(shellSize\.width, viewport\.width\)/);
  assert.match(bootstrap, /const hostHeight = Math\.max\(shellSize\.height, viewport\.height\)/);
  assert.match(bootstrap, /const width = hostWidth > 1 \? hostWidth : canvasSize\.width/);
  assert.match(bootstrap, /const height = hostHeight > 1 \? hostHeight : canvasSize\.height/);
  assert.match(bootstrap, /canvas\.style\.width = `\$\{width\}px`/);
  assert.match(bootstrap, /canvas\.style\.height = `\$\{height\}px`/);
  assert.match(bootstrap, /fallbackApplied = true/);
  assert.match(bootstrap, /\? "layout-pinned"\s+: "viewport-fallback"/);
  assert.doesNotMatch(bootstrap, /if \(fallbackApplied\)/);
  assert.equal((bootstrap.match(/fallbackApplied = false/g) || []).length, 1);
  assert.match(bootstrap, /new ResizeObserver\(schedule\)/);
  assert.match(bootstrap, /resizeObserver\?\.observe\(shell\)/);
  assert.match(bootstrap, /resizeObserver\?\.observe\(canvas\)/);
});

test("the world entry consumes bounded bootstrap evidence when layout still reports zero", () => {
  assert.match(worldEntry, /function drawableSize\(element\)/);
  assert.match(worldEntry, /__PEACOCK_BALLROOM_CANVAS_BOOTSTRAP__/);
  assert.match(worldEntry, /alumbra\.peacock-ballroom-canvas-bootstrap\/1/);
  assert.match(worldEntry, /source: bootstrapValid \? "bootstrap" : "viewport"/);
  assert.match(worldEntry, /peacockBallroomDrawableSource/);
  assert.ok(
    worldEntry.indexOf("const observed = drawableSize(element)")
      < worldEntry.indexOf("stableFrames >= 2"),
  );
});

test("publishes bounded diagnostics and releases all observers", () => {
  assert.match(bootstrap, /alumbra\.peacock-ballroom-canvas-bootstrap\/1/);
  assert.match(bootstrap, /peacockBallroomCanvasBootstrapSize/);
  assert.match(bootstrap, /__PEACOCK_BALLROOM_CANVAS_BOOTSTRAP__/);
  assert.match(bootstrap, /resizeObserver\?\.disconnect\(\)/);
  assert.match(bootstrap, /removeEventListener\?\.\("resize", schedule\)/);
  assert.match(bootstrap, /canvas\.style\.removeProperty\("width"\)/);
  assert.match(bootstrap, /canvas\.style\.removeProperty\("height"\)/);
  assert.match(bootstrap, /delete globalThis\.__PEACOCK_BALLROOM_CANVAS_BOOTSTRAP__/);
});
