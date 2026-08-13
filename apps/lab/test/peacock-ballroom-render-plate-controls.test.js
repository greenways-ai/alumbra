import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../peacock-ballroom.html", import.meta.url), "utf8");
const controls = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-controls.js", import.meta.url),
  "utf8",
);

test("exposes visible rendered/structure and day/night choices beside named views", () => {
  assert.match(page, /data-ballroom-presentation-toggle/);
  assert.match(page, /data-ballroom-appearance-toggle/);
  assert.match(page, /aria-label="Peacock Ballroom views and rendering"/);
  assert.match(page, /data-peacock-ballroom-render-controls="pending"/);
  assert.match(page, /src="\.\/src\/peacock-ballroom-render-plate-controls\.js\?v=pb-plate-1"/);
});

test("uses the bounded presentation seams rather than navigating away", () => {
  assert.match(controls, /__PEACOCK_BALLROOM_SET_PRESENTATION__/);
  assert.match(controls, /__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__/);
  assert.match(controls, /currentPresentation\(\) === "rendered" \? "structural" : "rendered"/);
  assert.match(controls, /currentAppearance\(\) === "night" \? "day" : "night"/);
  assert.doesNotMatch(controls, /location\.assign|location\.reload|window\.open/);
});

test("keeps controls accessible and disables appearance in structural mode", () => {
  assert.match(controls, /setAttribute\("aria-pressed"/);
  assert.match(controls, /presentationButton\.textContent = presentation === "rendered" \? "Rendered" : "Structure"/);
  assert.match(controls, /appearanceButton\.textContent = appearance === "night" \? "Night" : "Day"/);
  assert.match(controls, /appearanceButton\.disabled = busy \|\| currentPresentation\(\) !== "rendered"/);
  assert.match(controls, /peacockBallroomRenderControls = busy \? "busy" : "ready"/);
});

test("releases observers and event listeners on disposal", () => {
  assert.match(controls, /observer\.disconnect\(\)/);
  assert.match(controls, /removeEventListener\("click", presentationClick\)/);
  assert.match(controls, /removeEventListener\("click", appearanceClick\)/);
});
