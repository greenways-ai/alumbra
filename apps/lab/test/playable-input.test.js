import assert from "node:assert/strict";
import test from "node:test";
import {createPlayableInput, PLAYABLE_VIRTUAL_INPUT_EVENT} from "../src/playable-input.js";

class Target {
  constructor() {
    this.listeners = new Map();
    this.captures = new Set();
    this.rect = {left: 0, top: 0, width: 400, height: 300};
  }
  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }
  removeEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    this.listeners.set(type, values.filter((entry) => entry !== listener));
  }
  fire(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  count() { return [...this.listeners.values()].reduce((sum, entries) => sum + entries.length, 0); }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id) { this.captures.add(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}

const event = (value = {}) => ({
  preventDefault() {},
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  pointerType: "mouse",
  ...value,
});

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not close to ${expected}`);
};

test("playable input projects movement, one-shot jump, look and build actions", () => {
  const canvas = new Target();
  const windowTarget = new Target();
  const documentTarget = new Target();
  documentTarget.pointerLockElement = null;
  canvas.requestPointerLock = () => { documentTarget.pointerLockElement = canvas; };
  const selections = [];
  const input = createPlayableInput({
    canvas,
    eventTarget: windowTarget,
    documentTarget,
    lookSensitivity: 0.1,
    requirePointerLock: true,
    onSelectionChange: (slot) => selections.push(slot),
  });

  canvas.fire("pointerdown", event({button: 0}));
  assert.equal(documentTarget.pointerLockElement, canvas);
  windowTarget.fire("keydown", event({code: "KeyW"}));
  windowTarget.fire("keydown", event({code: "KeyD"}));
  windowTarget.fire("keydown", event({code: "Space"}));
  windowTarget.fire("mousemove", event({movementX: 20, movementY: -10}));
  canvas.fire("pointerdown", event({button: 0}));
  canvas.fire("pointerdown", event({button: 2}));
  windowTarget.fire("keydown", event({code: "Digit3"}));
  windowTarget.fire("keydown", event({code: "KeyZ"}));

  const first = input.sample();
  assert.deepEqual(first.move, [1, 1]);
  assert.deepEqual(first.look, [-2, 1]);
  assert.equal(first.jump, true);
  assert.deepEqual(first.actions, [{type: "break"}, {type: "place"}, {type: "undo"}]);
  assert.equal(first.selectedSlot, 2);
  assert.deepEqual(selections, [0, 2]);

  const second = input.sample();
  assert.deepEqual(second.look, [0, 0]);
  assert.equal(second.jump, false);
  assert.deepEqual(second.actions, []);
  assert.deepEqual(second.move, [1, 1]);
  windowTarget.fire("keyup", event({code: "KeyW"}));
  windowTarget.fire("keyup", event({code: "KeyD"}));
  assert.deepEqual(input.sample().move, [0, 0]);
});

test("mouse actions do not request pointer lock when the caller disables it", () => {
  const canvas = new Target();
  const windowTarget = new Target();
  const documentTarget = new Target();
  documentTarget.pointerLockElement = null;
  let requests = 0;
  canvas.requestPointerLock = () => { requests += 1; };
  const input = createPlayableInput({
    canvas,
    eventTarget: windowTarget,
    documentTarget,
    requirePointerLock: false,
  });

  canvas.fire("pointerdown", event({button: 0}));
  assert.equal(requests, 0);
  assert.deepEqual(input.sample().actions, [{type: "break"}]);
});

test("two touch pointers provide simultaneous movement and look without pointer lock", () => {
  const canvas = new Target();
  const windowTarget = new Target();
  const documentTarget = new Target();
  documentTarget.pointerLockElement = null;
  let requests = 0;
  canvas.requestPointerLock = () => { requests += 1; };
  const input = createPlayableInput({
    canvas,
    eventTarget: windowTarget,
    documentTarget,
    requirePointerLock: true,
    touchMoveRadius: 64,
    touchLookSensitivity: 0.2,
  });

  canvas.fire("pointerdown", event({pointerType: "touch", pointerId: 1, clientX: 80, clientY: 220}));
  canvas.fire("pointerdown", event({pointerType: "touch", pointerId: 2, clientX: 320, clientY: 160}));
  canvas.fire("pointermove", event({pointerType: "touch", pointerId: 1, clientX: 144, clientY: 156}));
  canvas.fire("pointermove", event({pointerType: "touch", pointerId: 2, clientX: 340, clientY: 140}));
  input.queueJump();
  input.queueAction("break");

  const frame = input.sample();
  assert.equal(requests, 0);
  closeTo(frame.move[0], Math.SQRT1_2);
  closeTo(frame.move[1], Math.SQRT1_2);
  assert.deepEqual(frame.look, [-4, 4]);
  assert.equal(frame.jump, true);
  assert.deepEqual(frame.actions, [{type: "break"}]);
  assert.equal(input.touchActive, true);

  canvas.fire("pointerup", event({pointerType: "touch", pointerId: 1, clientX: 144, clientY: 156}));
  assert.deepEqual(input.sample().move, [0, 0]);
  canvas.fire("pointercancel", event({pointerType: "touch", pointerId: 2, clientX: 340, clientY: 140}));
  assert.equal(input.touchActive, false);
  assert.equal(canvas.captures.size, 0);
});

test("DOM virtual-input events reach the sampled controller frame", () => {
  const canvas = new Target();
  const windowTarget = new Target();
  const documentTarget = new Target();
  const input = createPlayableInput({canvas, eventTarget: windowTarget, documentTarget});

  canvas.fire(PLAYABLE_VIRTUAL_INPUT_EVENT, event({detail: {type: "jump"}}));
  canvas.fire(PLAYABLE_VIRTUAL_INPUT_EVENT, event({detail: {type: "undo"}}));
  const frame = input.sample();
  assert.equal(frame.jump, true);
  assert.deepEqual(frame.actions, [{type: "undo"}]);
});

test("virtual controls are bounded and cleared by suspension", () => {
  const canvas = new Target();
  const windowTarget = new Target();
  const documentTarget = new Target();
  const input = createPlayableInput({canvas, eventTarget: windowTarget, documentTarget});

  const move = input.setVirtualMove([4, -3]);
  closeTo(move[0], 0.8);
  closeTo(move[1], -0.6);
  input.addVirtualLook([3, -2]);
  input.queueJump();
  input.queueAction("place");
  assert.deepEqual(input.sample(), {
    move: [0.8, -0.6],
    look: [3, -2],
    jump: true,
    actions: [{type: "place"}],
    selectedSlot: 0,
  });
  assert.throws(() => input.queueAction("teleport"), /Unsupported virtual action/);
  assert.equal(input.suspend(), true);
  assert.deepEqual(input.sample(), {
    move: [0, 0], look: [0, 0], jump: false, actions: [], selectedSlot: 0,
  });
  assert.equal(input.queueJump(), false);
  assert.equal(input.resume(), true);
  assert.deepEqual(input.sample().move, [0, 0]);
});

test("wheel selection wraps and input disposal removes every listener once", () => {
  const canvas = new Target();
  const windowTarget = new Target();
  const documentTarget = new Target();
  documentTarget.pointerLockElement = canvas;
  let exits = 0;
  documentTarget.exitPointerLock = () => { exits += 1; documentTarget.pointerLockElement = null; };
  const input = createPlayableInput({canvas, eventTarget: windowTarget, documentTarget, initialSlot: 7});
  canvas.fire("wheel", event({deltaY: 1}));
  assert.equal(input.selectedSlot, 0);
  canvas.fire("wheel", event({deltaY: -1}));
  assert.equal(input.selectedSlot, 7);
  assert.ok(canvas.count() > 0);
  assert.ok(windowTarget.count() > 0);
  input.destroy();
  input.destroy();
  assert.equal(canvas.count(), 0);
  assert.equal(windowTarget.count(), 0);
  assert.equal(exits, 1);
  assert.throws(() => input.sample(), /destroyed/);
});
