import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../peacock-ballroom.html", import.meta.url), "utf8");
const entry = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-entry.js", import.meta.url),
  "utf8",
);
const host = readFileSync(
  new URL("../src/peacock-ballroom-render-plate.js", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/peacock-ballroom-render-plate.css", import.meta.url),
  "utf8",
);

test("mounts the original render above the navigable canvas without replacing the world document", () => {
  assert.match(page, /href="\.\/src\/peacock-ballroom-render-plate\.css\?v=pb-plate-1"/);
  assert.match(page, /src="\.\/src\/peacock-ballroom-render-plate-entry\.js\?v=pb-plate-1"/);
  assert.ok(
    page.indexOf("peacock-ballroom-render-plate-entry.js")
      < page.indexOf("peacock-ballroom-entry.js"),
    "the render plate should install before the canonical world entry starts",
  );
  assert.match(page, /data-peacock-ballroom-render-plate="pending"/);
  assert.match(page, /data-peacock-ballroom-render-plate-loaded="false"/);
  assert.match(page, /data-peacock-ballroom-render-plate-geometry-opacity="1"/);
  assert.equal((page.match(/id="peacock-ballroom-canvas"/g) ?? []).length, 1);
  assert.doesNotMatch(page, /iframe[^>]+peacock-ballroom-day/);
});

test("observes semantic world-state changes and falls back to full geometry if the plate fails", () => {
  assert.match(entry, /createPeacockBallroomRenderPlateHost/);
  assert.match(entry, /new MutationObserver/);
  assert.match(entry, /attributeFilter: \["data-peacock-ballroom-state"\]/);
  assert.match(entry, /await host\.open\(activeState, \{profile, appearance\}\)/);
  assert.match(entry, /error\?\.name === "AbortError"/);
  assert.match(entry, /fell back to structural geometry/);
  assert.match(entry, /canvas\.style\.opacity = "1"/);
  assert.doesNotMatch(entry, /console\.error/);
});

test("publishes bounded render evidence and leaves canvas input authoritative", () => {
  for (const token of [
    "peacockBallroomRenderPlateLoaded",
    "peacockBallroomRenderPlateAsset",
    "peacockBallroomRenderPlateBlob",
    "peacockBallroomRenderPlateOpacity",
    "peacockBallroomRenderPlateGeometryOpacity",
    "peacockBallroomRenderPlateFidelity",
    "__PEACOCK_BALLROOM_RENDER_PLATE__",
  ]) {
    assert.ok(entry.includes(token), token);
  }
  assert.match(entry, /canvas\.style\.opacity = ready \? String\(evidence\.geometryOpacity\) : "1"/);
  assert.match(entry, /__PEACOCK_BALLROOM_RENDER_PLATE_FRAME__/);
  assert.match(host, /pointer-transparent|DOM mount|createElement\("img"\)/);
  assert.doesNotMatch(host, /drawImage|canvas\.getContext|createTexture|shaderSource/);
  assert.match(styles, /z-index: 2/);
  assert.match(styles, /pointer-events: none/);
  assert.match(styles, /data-render-plate-state="loading"[^}]+opacity: 0/s);
});

test("suspends and destroys the render layer independently from canonical world authority", () => {
  assert.match(entry, /host\.suspend\("document-hidden"\)/);
  assert.match(entry, /host\.resume\("document-visible"\)/);
  assert.match(entry, /stateObserver\.disconnect\(\)/);
  assert.match(entry, /globalThis\.__PEACOCK_BALLROOM_RENDER_PLATE__ = host\.destroy\(\)/);
  assert.match(entry, /canvas\.style\.opacity = "1"/);
});
