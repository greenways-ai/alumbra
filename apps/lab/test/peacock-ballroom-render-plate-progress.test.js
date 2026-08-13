import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../peacock-ballroom.html", import.meta.url), "utf8");
const progress = readFileSync(
  new URL("../src/peacock-ballroom-render-plate-progress.js", import.meta.url),
  "utf8",
);

test("adds the original rendering as a sixth visible world-assembly stage", () => {
  assert.match(page, /data-ballroom-progress-stage="render"/);
  assert.match(page, />Original rendering</);
  assert.match(page, /data-peacock-ballroom-render-progress="pending"/);
  assert.match(page, /src="\.\/src\/peacock-ballroom-render-plate-progress\.js\?v=pb-plate-1"/);
  assert.equal((page.match(/data-ballroom-progress-stage=/g) ?? []).length, 6);
});

test("holds overall readiness at 96 percent until the rendered plate finishes", () => {
  assert.match(progress, /worldReady\s+\? render\.complete \? 100 : 96/);
  assert.match(progress, /Loading the original Peacock Ballroom rendering/);
  assert.match(progress, /loading\.hidden = false/);
  assert.match(progress, /overall\.setAttribute\("aria-valuenow", String\(finalProgress\)\)/);
  assert.match(progress, /body\.dataset\.peacockBallroomProgress = String\(finalProgress\)/);
});

test("treats structural presentation as an explicit bypass and a failed plate as a visible fallback", () => {
  assert.match(progress, /presentation === "structural"/);
  assert.match(progress, /label: "bypassed"/);
  assert.match(progress, /plate === "failed"/);
  assert.match(progress, /label: "fallback"/);
  assert.match(progress, /Using the structural world/);
});

test("publishes bounded progress evidence and releases its observer", () => {
  assert.match(progress, /alumbra\.peacock-ballroom-render-progress\/1/);
  assert.match(progress, /__PEACOCK_BALLROOM_RENDER_PROGRESS__/);
  assert.match(progress, /attributeFilter:/);
  assert.match(progress, /data-peacock-ballroom-render-plate-loaded/);
  assert.match(progress, /observer\.disconnect\(\)/);
  assert.doesNotMatch(progress, /setInterval|Date\.now|Math\.random/);
});
