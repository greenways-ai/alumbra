import { createFixedStepAccumulator } from "./fixed-step.js";
import { moveBody, normalizePlayerBody } from "./collision.js";

const vector = (value, length, label) => {
  if (!Array.isArray(value) || value.length !== length) throw new TypeError(`${label} must contain ${length} finite numbers`);
  return Object.freeze(value.map((entry, index) => {
    const number = Number(entry);
    if (!Number.isFinite(number)) throw new TypeError(`${label}[${index}] must be finite`);
    return Object.is(number, -0) ? 0 : number;
  }));
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const approach = (value, target, amount) => value < target
  ? Math.min(target, value + amount)
  : Math.max(target, value - amount);

export function normalizePlayerConfig(value = {}) {
  const config = {
    body: normalizePlayerBody(value.body),
    moveSpeed: Number(value.moveSpeed ?? 5.4),
    groundAcceleration: Number(value.groundAcceleration ?? 38),
    airAcceleration: Number(value.airAcceleration ?? 12),
    groundFriction: Number(value.groundFriction ?? 28),
    gravity: Number(value.gravity ?? -24),
    jumpSpeed: Number(value.jumpSpeed ?? 8.2),
    maxFallSpeed: Number(value.maxFallSpeed ?? 45),
    collisionSubstep: Number(value.collisionSubstep ?? 0.2),
  };
  for (const [key, entry] of Object.entries(config)) {
    if (key === "body") continue;
    if (!Number.isFinite(entry)) throw new TypeError(`Player config ${key} must be finite`);
  }
  if (config.moveSpeed <= 0 || config.groundAcceleration <= 0 || config.airAcceleration <= 0 || config.groundFriction <= 0) {
    throw new RangeError("Player movement configuration must be positive");
  }
  if (config.gravity >= 0 || config.jumpSpeed <= 0 || config.maxFallSpeed <= 0) {
    throw new RangeError("Player gravity, jump and fall configuration is invalid");
  }
  return Object.freeze(config);
}

export function normalizePlayerState(value = {}) {
  const yaw = Number(value.yaw ?? 0);
  const pitch = Number(value.pitch ?? 0);
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new TypeError("Player orientation must be finite");
  return Object.freeze({
    position: vector(value.position ?? [0, 2, 0], 3, "Player position"),
    velocity: vector(value.velocity ?? [0, 0, 0], 3, "Player velocity"),
    yaw,
    pitch: clamp(pitch, -89, 89),
    grounded: Boolean(value.grounded),
  });
}

export function normalizePlayerInput(value = {}) {
  const move = vector(value.move ?? [0, 0], 2, "Player move input");
  const magnitude = Math.hypot(...move);
  const normalizedMove = magnitude > 1 ? move.map((entry) => entry / magnitude) : [...move];
  const look = vector(value.look ?? [0, 0], 2, "Player look input");
  return Object.freeze({
    move: Object.freeze(normalizedMove.map((entry) => clamp(entry, -1, 1))),
    look,
    jump: Boolean(value.jump),
  });
}

export function stepPlayer({
  state,
  input = {},
  delta,
  getBlock,
  isSolid,
  missingSolid = true,
  config = {},
} = {}) {
  const player = normalizePlayerState(state);
  const intent = normalizePlayerInput(input);
  const settings = normalizePlayerConfig(config);
  const seconds = Number(delta);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.05) {
    throw new RangeError("Player step delta must be positive and no greater than 0.05 seconds");
  }

  const yaw = player.yaw + intent.look[0];
  const pitch = clamp(player.pitch + intent.look[1], -89, 89);
  const radians = yaw * Math.PI / 180;
  const forward = [Math.sin(radians), -Math.cos(radians)];
  const right = [Math.cos(radians), Math.sin(radians)];
  const desired = [
    forward[0] * intent.move[1] + right[0] * intent.move[0],
    forward[1] * intent.move[1] + right[1] * intent.move[0],
  ];
  const desiredLength = Math.hypot(...desired);
  if (desiredLength > 1) {
    desired[0] /= desiredLength;
    desired[1] /= desiredLength;
  }

  const velocity = [...player.velocity];
  const acceleration = player.grounded ? settings.groundAcceleration : settings.airAcceleration;
  if (desiredLength > 0) {
    velocity[0] = approach(velocity[0], desired[0] * settings.moveSpeed, acceleration * seconds);
    velocity[2] = approach(velocity[2], desired[1] * settings.moveSpeed, acceleration * seconds);
  } else if (player.grounded) {
    velocity[0] = approach(velocity[0], 0, settings.groundFriction * seconds);
    velocity[2] = approach(velocity[2], 0, settings.groundFriction * seconds);
  }

  if (intent.jump && player.grounded) velocity[1] = settings.jumpSpeed;
  else velocity[1] = Math.max(-settings.maxFallSpeed, velocity[1] + settings.gravity * seconds);

  const movement = velocity.map((entry) => entry * seconds);
  const collision = moveBody({
    position: player.position,
    delta: movement,
    body: settings.body,
    getBlock,
    isSolid,
    missingSolid,
    maxSubstep: settings.collisionSubstep,
  });
  for (let axis = 0; axis < 3; axis += 1) if (collision.collisions[axis]) velocity[axis] = 0;

  return Object.freeze({
    position: collision.position,
    velocity: Object.freeze(velocity),
    yaw,
    pitch,
    grounded: collision.grounded,
  });
}

export function createPlayerRuntime({
  state,
  fixedStep = {},
  config = {},
  getBlock,
  isSolid,
  missingSolid = true,
} = {}) {
  let current = normalizePlayerState(state);
  const accumulator = createFixedStepAccumulator(fixedStep);
  return Object.freeze({
    get state() { return current; },
    advance(frameSeconds, input = {}) {
      const intent = normalizePlayerInput(input);
      current = Object.freeze({
        ...current,
        yaw: current.yaw + intent.look[0],
        pitch: clamp(current.pitch + intent.look[1], -89, 89),
      });
      const stepIntent = Object.freeze({...intent, look: Object.freeze([0, 0])});
      const frame = accumulator.advance(frameSeconds, (delta) => {
        current = stepPlayer({
          state: current,
          input: stepIntent,
          delta,
          config,
          getBlock,
          isSolid,
          missingSolid,
        });
      });
      return Object.freeze({state: current, frame});
    },
    reset(nextState = state) {
      current = normalizePlayerState(nextState);
      accumulator.reset();
      return current;
    },
  });
}
