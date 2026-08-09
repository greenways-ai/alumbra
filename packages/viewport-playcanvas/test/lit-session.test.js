import assert from "node:assert/strict";
import test from "node:test";
import {
  LIT_VIEWPORT_SESSION_FORMAT,
  createLitPlayCanvasViewportSession,
} from "../src/lit-session.js";

function fixture({ initialSuspended = false } = {}) {
  const calls = [];
  let baseStatus = initialSuspended ? "suspended" : "active";
  let renderer = null;
  const prebuilt = { id: "prebuilt" };
  const coordinatorEvidence = () => Object.freeze({
    format: "alumbra.viewport-lighting-evidence/1",
    status: calls.includes("projection:destroy") ? "disposed" : baseStatus,
    loadedChunks: 2,
    baseline: calls.includes("projection:destroy"),
  });
  const projection = {
    coordinator: { evidence: coordinatorEvidence },
    suspend(reason) { calls.push(`projection:suspend:${reason}`); return true; },
    resume(reason) { calls.push(`projection:resume:${reason}`); return true; },
    project() { calls.push("projection:project"); return Promise.resolve(coordinatorEvidence()); },
    drain() { calls.push("projection:drain"); return Promise.resolve(coordinatorEvidence()); },
    lightingEvidence: coordinatorEvidence,
    destroy() { calls.push("projection:destroy"); return Promise.resolve(coordinatorEvidence()); },
  };
  const session = createLitPlayCanvasViewportSession({
    initialSuspended,
    createPrebuiltRenderer(options) {
      calls.push(`prebuilt:${options.root}`);
      return prebuilt;
    },
    createLitRenderer(options) {
      calls.push(`projection:${options.chunks.length}`);
      assert.equal(options.renderer, prebuilt);
      return projection;
    },
    createSession(options) {
      renderer = options.createRenderer({ pc: {}, app: {}, registry: {}, root: "root" });
      assert.equal(renderer, projection);
      return Object.freeze({
        id: "viewport/lit-test",
        get status() { return baseStatus; },
        suspend(reason) { calls.push(`session:suspend:${reason}`); baseStatus = "suspended"; return true; },
        resume(reason) { calls.push(`session:resume:${reason}`); baseStatus = "active"; return true; },
        snapshot() { return Object.freeze({ sessionId: "viewport/lit-test", status: baseStatus }); },
        destroy() { calls.push("session:destroy"); baseStatus = "destroyed"; if (options.disposeRenderer) renderer.destroy(); },
      });
    },
  });
  return { session, calls };
}

test("lit viewport composes renderer creation and bounded lighting evidence", async () => {
  const { session, calls } = fixture();
  assert.equal(session.format, LIT_VIEWPORT_SESSION_FORMAT);
  assert.equal(session.status, "active");
  assert.equal(session.snapshot().lighting.loadedChunks, 2);
  await session.project();
  await session.drain();
  assert.deepEqual(calls.slice(0, 4), [
    "prebuilt:root",
    "projection:0",
    "projection:project",
    "projection:drain",
  ]);
});

test("lit viewport fences projection work across suspend, resume and idempotent destroy", async () => {
  const { session, calls } = fixture();
  assert.equal(session.suspend("hidden"), true);
  assert.equal(session.status, "suspended");
  assert.equal(session.resume("visible"), true);
  assert.equal(session.status, "active");
  const first = await session.destroy();
  const second = await session.destroy();
  assert.deepEqual(second, first);
  assert.equal(first.baseline, true);
  assert.deepEqual(calls.slice(-6), [
    "session:suspend:hidden",
    "projection:suspend:hidden",
    "projection:resume:visible",
    "session:resume:visible",
    "projection:destroy",
    "session:destroy",
  ]);
});

test("initial suspension fences lighting before canonical chunks are supplied", () => {
  const { session, calls } = fixture({ initialSuspended: true });
  assert.equal(session.status, "suspended");
  assert.ok(calls.includes("projection:suspend:initial"));
});
