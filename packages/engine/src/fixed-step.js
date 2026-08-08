const finitePositive = (value, fallback, label) => {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be positive and finite`);
  return number;
};

export function normalizeFixedStepOptions(value = {}) {
  const tick = finitePositive(value.tick, 1 / 60, "Fixed-step tick");
  const maxFrame = finitePositive(value.maxFrame, 0.25, "Fixed-step maxFrame");
  const maxSteps = value.maxSteps == null ? 8 : Number(value.maxSteps);
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 1000) {
    throw new RangeError("Fixed-step maxSteps must be an integer between 1 and 1000");
  }
  return Object.freeze({tick, maxFrame, maxSteps});
}

export function createFixedStepAccumulator(options = {}) {
  const config = normalizeFixedStepOptions(options);
  let accumulator = 0;
  let elapsed = 0;
  let ticks = 0;

  return Object.freeze({
    get state() {
      return Object.freeze({accumulator, elapsed, ticks, ...config});
    },
    advance(frameSeconds, step) {
      if (typeof step !== "function") throw new TypeError("Fixed-step advance requires a step function");
      const frame = Number(frameSeconds);
      if (!Number.isFinite(frame) || frame < 0) throw new RangeError("Fixed-step frame duration must be non-negative and finite");
      const accepted = Math.min(frame, config.maxFrame);
      const frameDropped = frame - accepted;
      accumulator += accepted;
      elapsed += accepted;
      let steps = 0;
      while (accumulator + Number.EPSILON >= config.tick && steps < config.maxSteps) {
        step(config.tick, ticks);
        accumulator -= config.tick;
        ticks += 1;
        steps += 1;
      }
      let backlogDropped = 0;
      if (accumulator >= config.tick) {
        backlogDropped = accumulator - (accumulator % config.tick);
        accumulator %= config.tick;
      }
      return Object.freeze({
        steps,
        tick: config.tick,
        alpha: accumulator / config.tick,
        dropped: frameDropped + backlogDropped,
        ticks,
      });
    },
    reset() {
      accumulator = 0;
      elapsed = 0;
      ticks = 0;
    },
  });
}
