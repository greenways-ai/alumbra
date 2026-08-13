import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  PEACOCK_BALLROOM_PROGRESS_FORMAT,
  peacockBallroomProgressModel,
} from "../src/peacock-ballroom-progress.js";

const page = readFileSync(new URL("../peacock-ballroom.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/peacock-ballroom-progress.css", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/peacock-ballroom-progress.js", import.meta.url), "utf8");

const initialDataset = Object.freeze({
  peacockBallroomReady: "false",
  peacockBallroomError: "false",
  peacockBallroomDrawable: "pending",
  peacockBallroomChunks: "0",
  peacockBallroomArchitecture: "pending",
  peacockBallroomLighting: "pending",
  peacockBallroomLandmarks: "pending",
  peacockBallroomDisposal: "pending",
  peacockBallroomMobileControls: "pending",
  peacockBallroomMobileLayout: "pending",
  peacockBallroomTarget: "none",
});

test("replaces the opaque launch screen with a compact staged progress rail", () => {
  assert.match(page, /peacock-ballroom-progress\.css\?v=pb-progress-1/);
  assert.match(page, /peacock-ballroom-progress\.js\?v=pb-progress-1/);
  assert.match(page, /data-ballroom-progress-overall/);
  assert.match(page, /role="progressbar"/);
  for (const stage of ["canvas", "canonical", "architecture", "evidence", "controls"]) {
    assert.ok(page.includes(`data-ballroom-progress-stage="${stage}"`), stage);
  }
  assert.match(styles, /\.ballroom-loading\s*\{[^}]+inset: auto auto 84px 18px/s);
  assert.match(styles, /\.ballroom-loading\s*\{[^}]+background: transparent/s);
  assert.doesNotMatch(styles, /\.ballroom-loading\s*\{[^}]+inset:\s*0\s*;/s);
  assert.match(styles, /\.ballroom-progress-stage\[data-progress-state="active"\]/);
  assert.match(styles, /@media \(max-width: 860px\)/);
});

test("derives coarse progress from real browser evidence instead of a timer", () => {
  const initial = peacockBallroomProgressModel(initialDataset);
  assert.equal(initial.format, PEACOCK_BALLROOM_PROGRESS_FORMAT);
  assert.equal(initial.activeStage, "canvas");
  assert.equal(initial.ready, false);
  assert.ok(initial.progress > 0 && initial.progress < 20);
  assert.equal(initial.stages.find(({id}) => id === "canvas").status, "active");

  const drawable = peacockBallroomProgressModel({
    ...initialDataset,
    peacockBallroomDrawable: "ready",
    peacockBallroomMobileControls: "ready",
    peacockBallroomMobileLayout: "not-applicable",
  });
  assert.equal(drawable.activeStage, "canonical");
  assert.ok(drawable.progress > initial.progress);
  assert.equal(drawable.stages.find(({id}) => id === "canvas").status, "done");

  const verified = peacockBallroomProgressModel({
    ...initialDataset,
    peacockBallroomDrawable: "ready",
    peacockBallroomChunks: "48",
    peacockBallroomArchitecture: "passed",
    peacockBallroomLighting: "passed",
    peacockBallroomLandmarks: "passed",
    peacockBallroomDisposal: "passed",
    peacockBallroomMobileControls: "ready",
    peacockBallroomMobileLayout: "not-applicable",
  });
  assert.equal(verified.activeStage, "controls");
  assert.equal(verified.progress, 96);
  assert.equal(verified.stages.filter(({status}) => status === "done").length, 4);

  const ready = peacockBallroomProgressModel({
    ...initialDataset,
    peacockBallroomReady: "true",
    peacockBallroomDrawable: "ready",
    peacockBallroomChunks: "48",
    peacockBallroomArchitecture: "passed",
    peacockBallroomLighting: "passed",
    peacockBallroomLandmarks: "passed",
    peacockBallroomDisposal: "passed",
    peacockBallroomMobileControls: "ready",
    peacockBallroomMobileLayout: "not-applicable",
  });
  assert.equal(ready.activeStage, "ready");
  assert.equal(ready.progress, 100);
  assert.equal(ready.label, "World ready");
  assert.ok(ready.stages.every(({status}) => status === "done"));
});

test("publishes bounded progress evidence for browser and production smoke tests", () => {
  assert.match(controller, /MutationObserver/);
  assert.match(controller, /dataset\.peacockBallroomProgress = String\(model\.progress\)/);
  assert.match(controller, /dataset\.peacockBallroomProgressStage = model\.activeStage/);
  assert.match(controller, /__PEACOCK_BALLROOM_PROGRESS__/);
  assert.match(controller, /Math\.min\(96/);
  assert.doesNotMatch(controller, /setInterval|Date\.now|setTimeout/);
});
