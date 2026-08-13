import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../peacock-ballroom.html", import.meta.url), "utf8");
const pose = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-pose.js", import.meta.url),
  "utf8",
);

test("drives render-plate parallax from the visible world navigation signals", () => {
  assert.match(page, /src="\.\/src\/peacock-ballroom-render-plate-pose\.js\?v=pb-plate-1"/);
  assert.ok(
    page.indexOf("peacock-ballroom-render-plate-entry.js")
      < page.indexOf("peacock-ballroom-render-plate-pose.js"),
  );
  assert.ok(
    page.indexOf("peacock-ballroom-render-plate-pose.js")
      < page.indexOf("peacock-ballroom-entry.js"),
  );
  assert.match(page, /data-peacock-ballroom-render-plate-pose="pending"/);
});

test("resets against named Hara views and tracks the published player position", () => {
  assert.match(pose, /PEACOCK_BALLROOM_VIEWS/);
  assert.match(pose, /body\.dataset\.peacockBallroomState/);
  assert.match(pose, /new MutationObserver/);
  assert.match(pose, /data-peacock-ballroom-state/);
  assert.match(pose, /data-ballroom-stat="player"/);
  assert.match(pose, /parsePosition\(playerStat\.textContent\)/);
  assert.match(pose, /receiver\(\{player: currentPose\}\)/);
  assert.match(pose, /peacockBallroomRenderPlatePosition/);
  assert.match(pose, /peacockBallroomRenderPlateYaw/);
  assert.match(pose, /peacockBallroomRenderPlatePitch/);
});

test("coalesces desktop and touch look intent without owning navigation", () => {
  assert.match(pose, /document\.pointerLockElement !== canvas/);
  assert.match(pose, /event\.movementX/);
  assert.match(pose, /event\.movementY/);
  assert.match(pose, /event\.pointerType !== "touch"/);
  assert.match(pose, /rect\.left \+ rect\.width \/ 2/);
  assert.match(pose, /requestAnimationFrame\(publish\)/);
  assert.doesNotMatch(pose, /preventDefault|stopPropagation|setPointerCapture|dispatchEvent/);
  assert.doesNotMatch(pose, /createPlayerRuntime|applyTransaction|setBlock|world\./);
});

test("releases all pose observers and listeners on page disposal", () => {
  assert.match(pose, /stateObserver\.disconnect\(\)/);
  assert.match(pose, /playerObserver\.disconnect\(\)/);
  assert.match(pose, /removeEventListener\("pointermove", pointerMove\)/);
  assert.match(pose, /delete globalThis\.__PEACOCK_BALLROOM_RENDER_PLATE_POSE__/);
});
