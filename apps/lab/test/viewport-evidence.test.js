import assert from "node:assert/strict";
import test from "node:test";
import {
  readViewportEvidence,
  setViewportEvidenceContributor,
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

test("viewport evidence composes separately owned bounded contributors", () => {
  const clearBase = setViewportEvidenceProvider(() => ({
    activeActivity: "alumbra-hodos/renderer-catalog",
    mode: "single",
    sessions: [],
  }));
  const clearResidency = setViewportEvidenceContributor("residency", () => ({
    format: "alumbra.residency-story/1",
    hostReady: true,
    activeActivity: null,
    status: "idle",
  }));
  const evidence = readViewportEvidence();
  assert.equal(evidence.activeActivity, "alumbra-hodos/renderer-catalog");
  assert.equal(evidence.residency.hostReady, true);
  assert.ok(Object.isFrozen(evidence.residency));
  clearResidency();
  clearBase();
  assert.equal(Object.hasOwn(readViewportEvidence(), "residency"), false);
});
