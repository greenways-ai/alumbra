import assert from "node:assert/strict";
import test from "node:test";
import {createPlayerRuntime, stepPlayer} from "../src/index.js";
import {collisionWorld} from "./fixtures.js";

const close = (left, right, epsilon = 1e-7) => Math.abs(left - right) <= epsilon;

test("fixed player steps fall to a stable grounded position", () => {
  const world = collisionWorld();
  let state = {position: [0.5, 5, 0.5], velocity: [0, 0, 0]};
  for (let index = 0; index < 180; index += 1) {
    state = stepPlayer({state, delta: 1 / 60, ...world});
  }
  assert.equal(state.grounded, true);
  assert.ok(close(state.position[1], 1, 1e-5));
  assert.equal(state.velocity[1], 0);
});

test("jump is accepted only from a grounded state", () => {
  const world = collisionWorld();
  const jumped = stepPlayer({
    state: {position: [0.5, 1, 0.5], velocity: [0, 0, 0], grounded: true},
    input: {jump: true},
    delta: 1 / 60,
    ...world,
  });
  assert.ok(jumped.velocity[1] > 8);
  assert.equal(jumped.grounded, false);

  const airborne = stepPlayer({
    state: {position: [0.5, 3, 0.5], velocity: [0, 0, 0], grounded: false},
    input: {jump: true},
    delta: 1 / 60,
    ...world,
  });
  assert.ok(airborne.velocity[1] < 0);
});

test("player collision clears velocity into a wall", () => {
  const walls = [];
  for (let y = 1; y <= 3; y += 1) for (let z = -1; z <= 1; z += 1) walls.push([2, y, z]);
  const world = collisionWorld({walls});
  let state = {position: [0.5, 1, 0.5], velocity: [0, 0, 0], grounded: true};
  for (let index = 0; index < 120; index += 1) {
    state = stepPlayer({state, input: {move: [1, 0]}, delta: 1 / 60, ...world});
  }
  assert.ok(state.position[0] <= 1.66001);
  assert.equal(state.velocity[0], 0);
});

test("player runtime is invariant to frame grouping for the same fixed ticks", () => {
  const world = collisionWorld();
  const options = {
    state: {position: [0.5, 1, 0.5], velocity: [0, 0, 0], grounded: true},
    fixedStep: {tick: 1 / 60, maxFrame: 0.25, maxSteps: 20},
    ...world,
  };
  const sixty = createPlayerRuntime(options);
  const thirty = createPlayerRuntime(options);
  for (let index = 0; index < 60; index += 1) sixty.advance(1 / 60, {move: [0, 1]});
  for (let index = 0; index < 30; index += 1) thirty.advance(1 / 30, {move: [0, 1]});
  assert.deepEqual(sixty.state, thirty.state);
});

test("runtime applies look once per host frame rather than once per catch-up tick", () => {
  const world = collisionWorld();
  const runtime = createPlayerRuntime({
    state: {position: [0.5, 1, 0.5], velocity: [0, 0, 0], grounded: true},
    fixedStep: {tick: 1 / 60, maxSteps: 8},
    ...world,
  });
  const result = runtime.advance(1 / 30, {look: [10, 5]});
  assert.equal(result.frame.steps, 2);
  assert.equal(result.state.yaw, 10);
  assert.equal(result.state.pitch, 5);
});
