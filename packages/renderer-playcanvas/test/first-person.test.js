import assert from "node:assert/strict";
import test from "node:test";
import { createFirstPersonController } from "../src/first-person.js";

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  fire(type, event = {}) { this.listeners.get(type)?.(event); }
}

test("first-person controller moves, looks and disposes deterministically", () => {
  const canvas = new Target();
  canvas.requestPointerLock = () => { documentTarget.pointerLockElement = canvas; };
  const eventTarget = new Target();
  const documentTarget = new Target();
  documentTarget.pointerLockElement = null;
  documentTarget.exitPointerLock = () => { documentTarget.pointerLockElement = null; };
  const pressed = new Set();
  const keyboard = { isPressed: (key) => pressed.has(key) };
  let update = null;
  let offCount = 0;
  const app = { keyboard, on(_name, callback) { update = callback; return { off() { offCount += 1; } }; } };
  const position = { x: 0, y: 0, z: 0 };
  const camera = {
    euler: null,
    setLocalEulerAngles(...value) { this.euler = value; },
    getLocalPosition() { return position; },
    setLocalPosition(x, y, z) { position.x = x; position.y = y; position.z = z; },
  };
  const pc = {
    KEY_W: "w", KEY_S: "s", KEY_A: "a", KEY_D: "d",
    KEY_SHIFT: "shift", KEY_SPACE: "space", KEY_CONTROL: "control",
  };
  const controller = createFirstPersonController({
    pc, app, camera, canvas, eventTarget, documentTarget, keyboard,
    initialYaw: 0, initialPitch: 0, speed: 10,
  });
  canvas.fire("pointerdown");
  eventTarget.fire("mousemove", { movementX: 10, movementY: -5 });
  assert.notDeepEqual(controller.orientation, { yaw: 0, pitch: 0 });
  pressed.add("w");
  update(0.5);
  assert.ok(position.z < -4.9);
  controller.destroy();
  controller.destroy();
  assert.equal(offCount, 1);
  assert.equal(canvas.listeners.size, 0);
  assert.equal(eventTarget.listeners.size, 0);
  assert.equal(documentTarget.pointerLockElement, null);
});
