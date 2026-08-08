import assert from "node:assert/strict";
import test from "node:test";
import {createFixedStepAccumulator, normalizeFixedStepOptions} from "../src/index.js";

test("fixed-step accumulator emits deterministic ticks and interpolation", () => {
  const accumulator = createFixedStepAccumulator({tick: 0.1, maxFrame: 1, maxSteps: 10});
  const calls = [];
  const first = accumulator.advance(0.25, (delta, tick) => calls.push([delta, tick]));
  assert.deepEqual(calls, [[0.1, 0], [0.1, 1]]);
  assert.equal(first.steps, 2);
  assert.ok(Math.abs(first.alpha - 0.5) < 1e-12);
  assert.equal(first.dropped, 0);
  const second = accumulator.advance(0.05, (delta, tick) => calls.push([delta, tick]));
  assert.equal(second.steps, 1);
  assert.equal(second.ticks, 3);
  assert.ok(second.alpha < 1e-12);
});

test("fixed-step accumulator clamps frames and discards bounded backlog explicitly", () => {
  const accumulator = createFixedStepAccumulator({tick: 0.1, maxFrame: 0.5, maxSteps: 2});
  let count = 0;
  const frame = accumulator.advance(1, () => { count += 1; });
  assert.equal(count, 2);
  assert.equal(frame.steps, 2);
  assert.ok(Math.abs(frame.dropped - 0.8) < 1e-12);
  assert.ok(frame.alpha < 1e-12);
});

test("fixed-step configuration and reset reject malformed time", () => {
  assert.throws(() => normalizeFixedStepOptions({tick: 0}), /positive/);
  assert.throws(() => createFixedStepAccumulator({maxSteps: 0}), /between 1 and 1000/);
  const accumulator = createFixedStepAccumulator({tick: 0.1});
  accumulator.advance(0.2, () => {});
  accumulator.reset();
  assert.deepEqual(accumulator.state, {
    accumulator: 0,
    elapsed: 0,
    ticks: 0,
    tick: 0.1,
    maxFrame: 0.25,
    maxSteps: 8,
  });
  assert.throws(() => accumulator.advance(-1, () => {}), /non-negative/);
});
