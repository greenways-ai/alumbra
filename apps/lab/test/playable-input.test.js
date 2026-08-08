import assert from "node:assert/strict";
import test from "node:test";
import {createPlayableInput} from "../src/playable-input.js";

class Target {
  constructor() { this.listeners = new Map(); }
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
}

const event = (value = {}) => ({preventDefault() {}, repeat: false, ctrlKey: false, metaKey: false, ...value});

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
