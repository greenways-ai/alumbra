import assert from "node:assert/strict";
import test from "node:test";
import {
  RENDERER_WORKSPACE_AUTHORITIES,
  RENDERER_WORKSPACE_EVIDENCE_FORMAT,
  RENDERER_WORKSPACE_SURFACES,
  createRendererWorkspaceSession,
} from "../src/renderer-workspace.js";

const ACTIVITY_A = "alumbra-renderer-playcanvas/material-matrix";
const ACTIVITY_B = "alumbra-renderer-playcanvas/chunk-residency";

const model = ({
  activityId = ACTIVITY_A,
  revision = 0,
  worldId = `world:${activityId}`,
  sessionId = `session:${activityId}`,
  engineId = `engine:${activityId}`,
} = {}) => ({
  "world/id": worldId,
  "session/id": sessionId,
  "world/revision": revision,
  "engine/handle": engineId,
  camera: { position: [3, 14, 22], rotation: [-18, 8, 0], fov: 66, nearClip: 0.05, farClip: 300 },
  status: "active",
  capabilities: { move: true, look: true },
  metadata: { activityId },
});

function fixture() {
  const events = [];
  let sequence = 0;
  const session = createRendererWorkspaceSession({
    installedActivityIds: [ACTIVITY_A, ACTIVITY_B],
    createViewportHost: async ({ activityId }) => {
      const hostId = ++sequence;
      events.push(`create:${activityId}:${hostId}`);
      return {
        async update(value) { events.push(`update:${activityId}:${hostId}:r${value["world/revision"]}`); },
        async suspend(reason) { events.push(`suspend:${activityId}:${hostId}:${reason}`); },
        async resume(reason) { events.push(`resume:${activityId}:${hostId}:${reason}`); },
        async destroy(reason) { events.push(`destroy:${activityId}:${hostId}:${reason}`); },
      };
    },
  });
  return { session, events };
}

test("activity switching destroys the previous viewport before creating the next one", async () => {
  const { session, events } = fixture();
  await session.openActivity(ACTIVITY_A, model());
  await session.openActivity(ACTIVITY_B, model({ activityId: ACTIVITY_B }));
  assert.deepEqual(events.slice(0, 3), [
    `create:${ACTIVITY_A}:1`,
    `destroy:${ACTIVITY_A}:1:activity:${ACTIVITY_B}`,
    `create:${ACTIVITY_B}:2`,
  ]);
  const evidence = session.evidence();
  assert.equal(evidence.activeActivityId, ACTIVITY_B);
  assert.equal(evidence.createdHosts, 2);
  assert.equal(evidence.destroyedHosts, 1);
  assert.equal(evidence.activitySwitches, 1);
  await session.destroy();
  assert.equal(session.evidence().destroyedHosts, 2);
});

test("model-only updates preserve the active engine, world and host", async () => {
  const { session, events } = fixture();
  await session.openActivity(ACTIVITY_A, model({ revision: 1 }));
  const before = session.evidence();
  await session.updateModel(model({ revision: 2 }));
  const after = session.evidence();
  assert.equal(after.engineId, before.engineId);
  assert.equal(after.worldId, before.worldId);
  assert.equal(after.sessionId, before.sessionId);
  assert.equal(after.createdHosts, 1);
  assert.equal(after.modelUpdates, 1);
  assert.equal(after.worldRevision, 2);
  assert.deepEqual(events, [
    `create:${ACTIVITY_A}:1`,
    `update:${ACTIVITY_A}:1:r2`,
  ]);
  await assert.rejects(
    session.updateModel(model({ revision: 3, engineId: "engine:replacement" })),
    /cannot replace world, session or engine identity/,
  );
  await session.destroy();
});

test("hidden viewport surfaces suspend and resume the same canonical session", async () => {
  const { session, events } = fixture();
  await session.openActivity(ACTIVITY_A, model());
  const identity = session.evidence();
  await session.selectSurface("code");
  const suspended = session.evidence();
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.viewportStatus, "suspended");
  assert.equal(suspended.engineId, identity.engineId);
  assert.equal(suspended.worldId, identity.worldId);
  await session.selectSurface("world");
  const resumed = session.evidence();
  assert.equal(resumed.status, "active");
  assert.equal(resumed.viewportStatus, "active");
  assert.equal(resumed.createdHosts, 1);
  assert.equal(resumed.suspendedHosts, 1);
  assert.equal(resumed.resumedHosts, 1);
  assert.match(events[1], /^suspend:/);
  assert.match(events[2], /^resume:/);
  await session.destroy();
});

test("wide and compact layouts retain separate bounded surface authorities", async () => {
  const { session } = fixture();
  assert.equal(session.evidence().layout, "wide");
  assert.deepEqual(session.evidence().visibleSurfaceIds, RENDERER_WORKSPACE_SURFACES);
  await session.setViewportWidth(640);
  const compact = session.evidence();
  assert.equal(compact.layout, "compact");
  assert.deepEqual(compact.visibleSurfaceIds, ["catalog", "world", "code", "execution", "problems"]);
  assert.deepEqual(compact.authorityIds, RENDERER_WORKSPACE_AUTHORITIES);
  await assert.rejects(session.selectSurface("repl"), /compact layout cannot select repl/);
  await session.destroy();
});

test("workspace evidence is closed data and rejects uninstalled or path-shaped identities", async () => {
  const { session } = fixture();
  await session.openActivity(ACTIVITY_A, model());
  const evidence = session.evidence();
  assert.equal(evidence.format, RENDERER_WORKSPACE_EVIDENCE_FORMAT);
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(evidence.visibleSurfaceIds));
  assert.ok(Object.isFrozen(evidence.authorityIds));
  const serialized = JSON.stringify(evidence);
  for (const forbidden of ["project", "shader", "source", "callback", "host", "PlayCanvas"]) {
    assert.equal(serialized.includes(forbidden), false, `evidence leaked ${forbidden}`);
  }
  await assert.rejects(session.openActivity("../../outside", model()), /semantic package\/activity identity/);
  await assert.rejects(session.openActivity("alumbra-renderer-playcanvas/not-installed", model()), /not installed/);
  await session.destroy();
});
