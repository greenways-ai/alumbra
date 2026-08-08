const EPSILON = 1e-7;
const AXIS_ORDER = Object.freeze([0, 2, 1]);

const vector3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain three numbers`);
  return value.map((entry, index) => {
    const number = Number(entry);
    if (!Number.isFinite(number)) throw new TypeError(`${label}[${index}] must be finite`);
    return Object.is(number, -0) ? 0 : number;
  });
};

export function normalizePlayerBody(value = {}) {
  const radius = Number(value.radius ?? 0.34);
  const height = Number(value.height ?? 1.8);
  const eyeHeight = Number(value.eyeHeight ?? 1.62);
  if (!Number.isFinite(radius) || radius <= 0 || radius >= 0.5) {
    throw new RangeError("Player body radius must be positive and less than 0.5 blocks");
  }
  if (!Number.isFinite(height) || height <= radius * 2 || height > 4) {
    throw new RangeError("Player body height is outside the supported range");
  }
  if (!Number.isFinite(eyeHeight) || eyeHeight <= 0 || eyeHeight > height) {
    throw new RangeError("Player eye height must be within the body");
  }
  return Object.freeze({radius, height, eyeHeight});
}

export function playerAabb(position, body = normalizePlayerBody()) {
  const point = vector3(position, "Player position");
  const value = normalizePlayerBody(body);
  return Object.freeze({
    min: Object.freeze([point[0] - value.radius, point[1], point[2] - value.radius]),
    max: Object.freeze([point[0] + value.radius, point[1] + value.height, point[2] + value.radius]),
  });
}

export function aabbIntersectsVoxel(aabb, voxel, epsilon = EPSILON) {
  const position = vector3(voxel, "Voxel position");
  return aabb.max[0] > position[0] + epsilon
    && aabb.min[0] < position[0] + 1 - epsilon
    && aabb.max[1] > position[1] + epsilon
    && aabb.min[1] < position[1] + 1 - epsilon
    && aabb.max[2] > position[2] + epsilon
    && aabb.min[2] < position[2] + 1 - epsilon;
}

export function overlappingVoxels(position, body = normalizePlayerBody()) {
  const aabb = playerAabb(position, body);
  const minimum = aabb.min.map((entry) => Math.floor(entry + EPSILON));
  const maximum = aabb.max.map((entry) => Math.floor(entry - EPSILON));
  const output = [];
  for (let y = minimum[1]; y <= maximum[1]; y += 1) {
    for (let z = minimum[2]; z <= maximum[2]; z += 1) {
      for (let x = minimum[0]; x <= maximum[0]; x += 1) output.push(Object.freeze([x, y, z]));
    }
  }
  return Object.freeze(output);
}

export function bodyIntersectsWorld({
  position,
  body = normalizePlayerBody(),
  getBlock,
  isSolid,
  missingSolid = true,
} = {}) {
  if (typeof getBlock !== "function" || typeof isSolid !== "function") {
    throw new TypeError("Collision query requires getBlock and isSolid functions");
  }
  for (const voxel of overlappingVoxels(position, body)) {
    const block = getBlock(voxel);
    if (block == null ? missingSolid : isSolid(block)) return true;
  }
  return false;
}

function resolveAxis({position, axis, amount, body, getBlock, isSolid, missingSolid, iterations}) {
  if (amount === 0) return {position, collided: false};
  const attempted = [...position];
  attempted[axis] += amount;
  if (!bodyIntersectsWorld({position: attempted, body, getBlock, isSolid, missingSolid})) {
    return {position: attempted, collided: false};
  }
  let low = 0;
  let high = 1;
  for (let index = 0; index < iterations; index += 1) {
    const middle = (low + high) / 2;
    const candidate = [...position];
    candidate[axis] += amount * middle;
    if (bodyIntersectsWorld({position: candidate, body, getBlock, isSolid, missingSolid})) high = middle;
    else low = middle;
  }
  const resolved = [...position];
  resolved[axis] += amount * low;
  return {position: resolved, collided: true};
}

export function moveBody({
  position,
  delta,
  body = normalizePlayerBody(),
  getBlock,
  isSolid,
  missingSolid = true,
  maxSubstep = 0.2,
  iterations = 18,
} = {}) {
  let current = vector3(position, "Player position");
  const movement = vector3(delta, "Player movement");
  const normalizedBody = normalizePlayerBody(body);
  if (!Number.isFinite(maxSubstep) || maxSubstep <= 0 || maxSubstep > 1) {
    throw new RangeError("Collision maxSubstep must be positive and at most one block");
  }
  if (!Number.isSafeInteger(iterations) || iterations < 4 || iterations > 40) {
    throw new RangeError("Collision iterations must be an integer between 4 and 40");
  }
  if (bodyIntersectsWorld({position: current, body: normalizedBody, getBlock, isSolid, missingSolid})) {
    throw new Error("Player starts inside a solid or unloaded voxel");
  }

  const stepCount = Math.max(1, Math.ceil(Math.max(...movement.map(Math.abs)) / maxSubstep));
  const perStep = movement.map((entry) => entry / stepCount);
  const collisions = [false, false, false];
  let grounded = false;

  for (let step = 0; step < stepCount; step += 1) {
    for (const axis of AXIS_ORDER) {
      const result = resolveAxis({
        position: current,
        axis,
        amount: perStep[axis],
        body: normalizedBody,
        getBlock,
        isSolid,
        missingSolid,
        iterations,
      });
      current = result.position;
      if (result.collided) {
        collisions[axis] = true;
        if (axis === 1 && perStep[axis] < 0) grounded = true;
      }
    }
  }

  return Object.freeze({
    position: Object.freeze(current),
    collisions: Object.freeze(collisions),
    grounded,
    steps: stepCount,
  });
}
