import assert from "node:assert/strict";
import test from "node:test";
import {
  readViewportEvidence,
  setViewportEvidenceProvider,
} from "../src/viewport-evidence.js";

test("viewport evidence exposes bounded immutable session snapshots", () => {
  const clear = setViewportEvidenceProvider(() => ({
    activeActivity: "alumbra-viewport-playcanvas/two-sessions",
    mode: "two",
    sessions: [
      {sessionId: "primary", worldId: "world:one", status: "active"},
      {sessionId: "secondary", worldId: "world:two", status: "active"},
    ],
  }));
  const evidence = readViewportEvidence();
  assert.equal(evidence.mode, "two");
  assert.equal(evidence.sessions.length, 2);
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(evidence.sessions));
  assert.ok(Object.isFrozen(evidence.sessions[0]));
  clear();
  assert.deepEqual(readViewportEvidence().sessions, []);
});
