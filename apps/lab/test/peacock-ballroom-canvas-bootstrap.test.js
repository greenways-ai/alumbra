import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const bootstrap = readFileSync(
  new URL("../src/peacock-ballroom-canvas-bootstrap.js", import.meta.url),
  "utf8",
);
const renderEntry = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-entry.js", import.meta.url),
  "utf8",
);

test("installs canvas sizing before the render plate and canonical world start", () => {
  assert.match(
    renderEntry,
    /^import "\.\/peacock-ballroom-canvas-bootstrap\.js";/,
  );
  assert.ok(
    renderEntry.indexOf("peacock-ballroom-canvas-bootstrap.js")
      < renderEntry.indexOf("createPeacockBallroomRenderPlateHost"),
  );
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

test("keeps an acquired fallback responsive instead of alternating with zero-sized layout", () => {
  assert.match(bootstrap, /if \(fallbackApplied\)/);
  assert.match(bootstrap, /const stableWidth = width > 1 \? width : canvasSize\.width/);
  assert.match(bootstrap, /const stableHeight = height > 1 \? height : canvasSize\.height/);
  assert.match(bootstrap, /canvas\.style\.width = `\$\{stableWidth\}px`/);
  assert.match(bootstrap, /canvas\.style\.height = `\$\{stableHeight\}px`/);
  assert.ok(
    bootstrap.indexOf("if (fallbackApplied)")
      < bootstrap.indexOf("if (canvasSize.width > 1"),
  );
  assert.doesNotMatch(bootstrap, /embeddedHost/);
  assert.doesNotMatch(bootstrap, /fallbackApplied = false/);
  assert.match(bootstrap, /new ResizeObserver\(schedule\)/);
  assert.match(bootstrap, /resizeObserver\?\.observe\(shell\)/);
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
