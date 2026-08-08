import assert from "node:assert/strict";
import test from "node:test";
import {
  ALUMBRA_VIEWPORT_COMPONENT_CONTRACT,
  ALUMBRA_VIEWPORT_COMPONENT_ID,
  ALUMBRA_VIEWPORT_EVENTS,
  ALUMBRA_VIEWPORT_PROFILE,
  createAlumbraViewportArea,
  normalizeAlumbraViewportEvents,
  normalizeAlumbraViewportModel,
} from "../src/index.js";

const model = (overrides = {}) => ({
  "world/id": "world:alumbra/lab",
  "session/id": "session:lab",
  "world/revision": 7,
  "engine/handle": "handle:alumbra/lab",
  camera: { position: [3, 14, 22], rotation: [-18, 8, 0], fov: 66, nearClip: 0.05, farClip: 300 },
  selection: { type: "block", position: [-1, 4, 9], face: "north", blockId: "alumbra/basalt", distance: 3.25 },
  status: "active",
  capabilities: { move: true, look: true, jump: true, break: true },
  metadata: { generator: "alumbra/lab-v1" },
  ...overrides,
});

test("viewport model projects bounded serializable semantic state", () => {
  const value = normalizeAlumbraViewportModel(model());
  assert.equal(value.profile, ALUMBRA_VIEWPORT_PROFILE);
  assert.equal(value["world/id"], "world:alumbra/lab");
  assert.equal(value["world/revision"], 7);
  assert.deepEqual(value.camera.position, [3, 14, 22]);
  assert.deepEqual(value.selection, {
    type: "block", position: [-1, 4, 9], face: "north", blockId: "alumbra/basalt", distance: 3.25,
  });
  assert.deepEqual(value.capabilities, {
    move: true, look: true, jump: true, break: true, place: false, use: false, openInventory: false, command: false,
  });
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.camera));
  assert.ok(Object.isFrozen(value.metadata));
});

test("viewport model rejects host objects, cycles and malformed values", () => {
  assert.throws(() => normalizeAlumbraViewportModel(model({ metadata: new Uint8Array([1]) })), /host or non-plain object/);
  assert.throws(() => normalizeAlumbraViewportModel(model({ camera: { position: [0, Infinity, 0] } })), /finite/);
  assert.throws(() => normalizeAlumbraViewportModel(model({ selection: { position: [0, 0, 0], face: "diagonal" } })), /Unsupported/);
  assert.throws(() => normalizeAlumbraViewportModel(model({ "world/revision": -1 })), /unsigned/);
  assert.throws(() => normalizeAlumbraViewportModel(model({ status: "running" })), /Unsupported/);
  assert.throws(() => normalizeAlumbraViewportModel(model({ metadata: { execute() {} } })), /unsupported property/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => normalizeAlumbraViewportModel(model({ metadata: cyclic })), /cycle/);
});

test("viewport area uses the Hodos Workspace component contract and declared events", () => {
  const area = createAlumbraViewportArea({
    id: "area/world",
    title: "Voxel World",
    model: model(),
    events: ["alumbra/look", "alumbra/move", "alumbra/look"],
  });
  assert.equal(area["area/id"], "area/world");
  assert.equal(area["area/type"], ALUMBRA_VIEWPORT_COMPONENT_ID);
  assert.equal(area["area/component"]["component/id"], ALUMBRA_VIEWPORT_COMPONENT_ID);
  assert.equal(area["area/component"]["component/contract"], ALUMBRA_VIEWPORT_COMPONENT_CONTRACT);
  assert.deepEqual(area["area/component"]["component/events"], ["alumbra/look", "alumbra/move"]);
  assert.throws(() => normalizeAlumbraViewportEvents(["alumbra/teleport"]), /Unsupported/);
  assert.deepEqual(normalizeAlumbraViewportEvents(), ALUMBRA_VIEWPORT_EVENTS);
});
