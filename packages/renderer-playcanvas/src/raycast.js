const FACE_NAMES = Object.freeze({
  "-1,0,0": "west",
  "1,0,0": "east",
  "0,-1,0": "down",
  "0,1,0": "up",
  "0,0,-1": "north",
  "0,0,1": "south",
});

const finiteVector = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => !Number.isFinite(Number(entry)))) {
    throw new TypeError(`${label} must contain three finite numbers`);
  }
  return value.map(Number);
};

export function raycastVoxels({
  origin,
  direction,
  maxDistance = 8,
  getBlock,
  isSolid = (block) => block != null,
} = {}) {
  if (typeof getBlock !== "function") throw new TypeError("Voxel raycast requires getBlock(world)");
  const start = finiteVector(origin, "Ray origin");
  const rawDirection = finiteVector(direction, "Ray direction");
  if (!Number.isFinite(maxDistance) || maxDistance < 0) throw new RangeError("maxDistance must be non-negative");
  const length = Math.hypot(...rawDirection);
  if (length === 0) throw new RangeError("Ray direction must not be zero");
  const ray = rawDirection.map((entry) => entry / length);
  const voxel = start.map(Math.floor);
  const firstBlock = getBlock(Object.freeze([...voxel]));
  if (isSolid(firstBlock)) {
    return Object.freeze({
      block: firstBlock,
      voxel: Object.freeze([...voxel]),
      previous: null,
      face: null,
      normal: null,
      distance: 0,
      position: Object.freeze([...start]),
      inside: true,
    });
  }

  const step = ray.map((entry) => entry > 0 ? 1 : entry < 0 ? -1 : 0);
  const tDelta = ray.map((entry) => entry === 0 ? Infinity : Math.abs(1 / entry));
  const tMax = ray.map((entry, axis) => {
    if (entry > 0) return (voxel[axis] + 1 - start[axis]) / entry;
    if (entry < 0) return (start[axis] - voxel[axis]) / -entry;
    return Infinity;
  });

  while (true) {
    let axis = 0;
    if (tMax[1] < tMax[axis]) axis = 1;
    if (tMax[2] < tMax[axis]) axis = 2;
    const distance = tMax[axis];
    if (!Number.isFinite(distance) || distance > maxDistance) return null;

    voxel[axis] += step[axis];
    const normal = [0, 0, 0];
    normal[axis] = -step[axis];
    const frozenVoxel = Object.freeze([...voxel]);
    const block = getBlock(frozenVoxel);
    if (isSolid(block)) {
      const previous = voxel.map((entry, index) => entry + normal[index]);
      return Object.freeze({
        block,
        voxel: frozenVoxel,
        previous: Object.freeze(previous),
        face: FACE_NAMES[normal.join(",")],
        normal: Object.freeze(normal),
        distance,
        position: Object.freeze(start.map((entry, index) => entry + ray[index] * distance)),
        inside: false,
      });
    }
    tMax[axis] += tDelta[axis];
  }
}
