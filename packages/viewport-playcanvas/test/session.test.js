import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlayCanvasViewportSession,
  createViewportSessionGroup,
} from "../src/index.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((value) => value !== listener));
  }
}

class FakeEntity {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.enabled = true;
    this.position = {x: 0, y: 0, z: 0};
    this.forward = {x: 0, y: 0, z: -1};
    this.destroyed = false;
  }
  addChild(child) { this.children.push(child); }
  addComponent(type, value) { this[type] = {...value}; }
  setLocalPosition(x, y, z) { this.position = {x, y, z}; }
  getPosition() { return this.position; }
  setLocalEulerAngles(pitch, yaw, roll) { this.euler = {pitch, yaw, roll}; }
  destroy() { this.destroyed = true; }
}

class FakeColor {
  constructor(r, g, b) { Object.assign(this, {r, g, b}); }
}

function fakeApp() {
  const handlers = new Map();
  const root = new FakeEntity("root");
  return {
    root,
    scene: {},
    graphicsDevice: {},
    autoRender: true,
    renderNextFrame: false,
    resizeCount: 0,
    on(type, listener) {
      handlers.set(type, listener);
      return {off: () => handlers.delete(type)};
    },
    off(type) { handlers.delete(type); },
    emit(type, value) { handlers.get(type)?.(value); },
    resizeCanvas() { this.resizeCount += 1; },
  };
}

function fakeInput() {
  let enabled = true;
  let destroyed = false;
  return {
    selectedSlot: 0,
    sample() {
      if (destroyed) throw new Error("destroyed");
      return {
        move: enabled ? [1, 0] : [0, 0],
        look: [0, 0],
        jump: false,
        actions: [],
        selectedSlot: 0,
      };
    },
    suspend() { enabled = false; },
    resume() { enabled = true; },
    destroy() { destroyed = true; },
  };
}

function fakeRenderer() {
  const state = {setChunks: 0, destroyed: 0};
  return {
    state,
    setChunk() { state.setChunks += 1; },
    setView() { return {visible: 1, total: 1}; },
    setSelection() {},
    getBlock() { return {id: "alumbra/air", state: {}}; },
    stats() { return {chunks: 1, quads: 6}; },
    destroy() { state.destroyed += 1; },
  };
}

function fixture(id) {
  const registry = {
    get: () => ({empty: true, metadata: {render: {visible: false}}}),
  };
  const chunk = {key: "0,0,0", coord: [0,0,0], shape: [1,1,1]};
  const world = {
    worldId: `world:${id}`,
    revision: 0,
    registry,
    chunks: () => new Map([[chunk.key, chunk]]),
  };
  let state = {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    grounded: false,
  };
  const player = {
    get state() { return state; },
    advance(delta, input) {
      state = {...state, position: [state.position[0] + input.move[0] * delta, 0, 0]};
      return {state};
    },
  };
  return {world, player};
}

const pc = {Entity: FakeEntity, Color: FakeColor};

test("viewport suspension preserves the same canonical world and resumes one session", () => {
  const app = fakeApp();
  const renderer = fakeRenderer();
  const input = fakeInput();
  const {world, player} = fixture("primary");
  const canvas = new FakeEventTarget();
  const events = new FakeEventTarget();
  const document = new FakeEventTarget();
  const frames = [];
  const viewport = createPlayCanvasViewportSession({
    sessionId: "primary",
    pc,
    canvas,
    world,
    player,
    application: app,
    renderer,
    input,
    eventTarget: events,
    documentTarget: document,
    onFrame: (frame) => frames.push(frame),
    disposeRenderer: true,
    disposeInput: true,
  });

  app.emit("update", 1);
  assert.equal(player.state.position[0], 1);
  assert.equal(frames.length, 1);
  assert.equal(viewport.snapshot().worldId, "world:primary");

  assert.equal(viewport.suspend("hidden"), true);
  assert.equal(app.autoRender, false);
  app.emit("update", 1);
  assert.equal(player.state.position[0], 1);

  assert.equal(viewport.resume("visible"), true);
  assert.equal(app.autoRender, true);
  assert.equal(app.renderNextFrame, true);
  app.emit("update", 1);
  assert.equal(player.state.position[0], 2);
  assert.equal(viewport.world, world);
  assert.deepEqual(
    {status: viewport.snapshot().status, suspensions: viewport.snapshot().suspensions, resumes: viewport.snapshot().resumes},
    {status: "active", suspensions: 1, resumes: 1},
  );

  viewport.destroy();
  viewport.destroy();
  assert.equal(renderer.state.destroyed, 1);
  assert.equal(viewport.status, "destroyed");
});

test("session groups keep two worlds, players and frame clocks independent", () => {
  const group = createViewportSessionGroup();
  const left = fixture("left");
  const right = fixture("right");
  const leftApp = fakeApp();
  const rightApp = fakeApp();
  const shared = {
    pc,
    canvas: new FakeEventTarget(),
    eventTarget: new FakeEventTarget(),
    documentTarget: new FakeEventTarget(),
    renderer: fakeRenderer(),
    input: fakeInput(),
    disposeRenderer: true,
    disposeInput: true,
  };
  group.create("left", {...shared, application: leftApp, ...left});
  group.create("right", {
    ...shared,
    canvas: new FakeEventTarget(),
    renderer: fakeRenderer(),
    input: fakeInput(),
    application: rightApp,
    ...right,
  });

  leftApp.emit("update", 1);
  leftApp.emit("update", 1);
  assert.equal(left.player.state.position[0], 2);
  assert.equal(right.player.state.position[0], 0);
  rightApp.emit("update", 0.5);
  assert.equal(right.player.state.position[0], 0.5);
  assert.deepEqual(group.snapshot().map(({sessionId, worldId, frame}) => ({sessionId, worldId, frame})), [
    {sessionId: "left", worldId: "world:left", frame: 2},
    {sessionId: "right", worldId: "world:right", frame: 1},
  ]);

  group.destroy();
  assert.deepEqual(group.ids(), []);
});

test("viewport creates an owned world controller against its renderer boundary", () => {
  const app = fakeApp();
  const renderer = fakeRenderer();
  const input = fakeInput();
  const {world, player} = fixture("owned-controller");
  let createdWith = null;
  let destroyed = 0;
  const viewport = createPlayCanvasViewportSession({
    sessionId: "owned-controller",
    pc,
    canvas: new FakeEventTarget(),
    world,
    player,
    application: app,
    renderer,
    input,
    eventTarget: new FakeEventTarget(),
    documentTarget: new FakeEventTarget(),
    createController(options) {
      createdWith = options;
      return {
        applyAction() { return {transaction: {id: "build/1/break"}}; },
        undo() { return null; },
        destroy() { destroyed += 1; },
      };
    },
  });
  assert.equal(createdWith.world, world);
  assert.equal(createdWith.renderer, renderer);
  assert.ok(viewport.controller);
  viewport.destroy();
  assert.equal(destroyed, 1);
});
