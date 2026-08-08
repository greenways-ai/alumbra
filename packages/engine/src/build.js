import { normalizeBlockValue } from "@greenways/alumbra-core/blocks";
import { createBlockTransaction } from "@greenways/alumbra-core/transactions";
import { aabbIntersectsVoxel, normalizePlayerBody, playerAabb } from "./collision.js";

const FACE_NORMALS = Object.freeze({
  west: Object.freeze([-1, 0, 0]),
  east: Object.freeze([1, 0, 0]),
  down: Object.freeze([0, -1, 0]),
  up: Object.freeze([0, 1, 0]),
  north: Object.freeze([0, 0, -1]),
  south: Object.freeze([0, 0, 1]),
});

const vector3 = (value, label, integers = false) => {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain three values`);
  const output = value.map((entry, index) => {
    const number = Number(entry);
    if (!Number.isFinite(number) || (integers && !Number.isSafeInteger(number))) {
      throw new TypeError(`${label}[${index}] must be ${integers ? "a safe integer" : "finite"}`);
    }
    return Object.is(number, -0) ? 0 : number;
  });
  return Object.freeze(output);
};

const nonEmptyId = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
};

function minimumDistanceToVoxel(origin, voxel) {
  let squared = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const minimum = voxel[axis];
    const maximum = voxel[axis] + 1;
    const distance = origin[axis] < minimum
      ? minimum - origin[axis]
      : origin[axis] > maximum
        ? origin[axis] - maximum
        : 0;
    squared += distance * distance;
  }
  return Math.sqrt(squared);
}

function assertReach(origin, voxel, reach) {
  const distance = minimumDistanceToVoxel(origin, voxel);
  if (!Number.isFinite(reach) || reach <= 0 || reach > 64) throw new RangeError("Build reach must be positive and at most 64 blocks");
  if (distance > reach) throw new Error(`Build target is out of reach: ${distance.toFixed(3)} > ${reach}`);
  return distance;
}

function normalizeHit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Build intent requires a voxel hit");
  const voxel = vector3(value.voxel, "Build hit voxel", true);
  let face = value.face == null ? null : String(value.face);
  if (face != null && !FACE_NORMALS[face]) throw new Error(`Unsupported build hit face: ${face}`);
  let normal = value.normal == null
    ? face == null ? null : FACE_NORMALS[face]
    : vector3(value.normal, "Build hit normal", true);
  if (normal && Math.abs(normal[0]) + Math.abs(normal[1]) + Math.abs(normal[2]) !== 1) {
    throw new Error("Build hit normal must be axis aligned");
  }
  if (face && normal && FACE_NORMALS[face].some((entry, axis) => entry !== normal[axis])) {
    throw new Error("Build hit face and normal do not agree");
  }

  let previous = value.previous == null
    ? normal == null ? null : Object.freeze(voxel.map((entry, axis) => entry + normal[axis]))
    : vector3(value.previous, "Build hit previous voxel", true);
  if (previous) {
    const difference = Object.freeze(previous.map((entry, axis) => entry - voxel[axis]));
    if (Math.abs(difference[0]) + Math.abs(difference[1]) + Math.abs(difference[2]) !== 1) {
      throw new Error("Build hit previous voxel must be face adjacent");
    }
    if (normal && difference.some((entry, axis) => entry !== normal[axis])) {
      throw new Error("Build hit previous voxel and normal do not agree");
    }
    normal ??= difference;
    if (face == null) {
      face = Object.entries(FACE_NORMALS).find(([, candidate]) =>
        candidate.every((entry, axis) => entry === normal[axis]))?.[0] ?? null;
    }
  }
  return Object.freeze({voxel, face, normal, previous});
}

function metadata(value, intent, extra = {}) {
  const output = {intent, ...extra};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) if (entry !== undefined) output[key] = entry;
  }
  return output;
}

export function createBreakBlockTransaction({
  id,
  world,
  hit,
  origin,
  reach = 6,
  actor = null,
  metadata: intentMetadata = {},
} = {}) {
  if (!world?.registry || typeof world.locate !== "function") throw new TypeError("Break intent requires an Alumbra world runtime");
  const target = normalizeHit(hit).voxel;
  const eye = vector3(origin, "Break intent origin");
  const distance = assertReach(eye, target, reach);
  const location = world.locate(target);
  if (!location.loaded) throw new Error(`Break target is in an unloaded chunk: ${target.join(",")}`);
  const before = world.getBlock(target);
  const definition = world.registry.get(before.id);
  if (definition.empty) throw new Error("Break target is empty");
  if (definition.metadata?.physics?.breakable === false) throw new Error(`Block is not breakable: ${before.id}`);
  return createBlockTransaction({
    id: nonEmptyId(id, "Break transaction id"),
    expectedRevisions: [{chunk: location.chunk.coord, revision: location.chunk.revision}],
    changes: [{chunk: location.chunk.coord, local: location.local, before, after: world.registry.emptyBlock}],
    metadata: metadata(intentMetadata, "break", {actor, distance, world: world.worldId}),
  }, world.registry);
}

export function createPlaceBlockTransaction({
  id,
  world,
  hit,
  origin,
  block,
  playerPosition,
  playerBody = {},
  reach = 6,
  actor = null,
  metadata: intentMetadata = {},
} = {}) {
  if (!world?.registry || typeof world.locate !== "function") throw new TypeError("Place intent requires an Alumbra world runtime");
  const normalizedHit = normalizeHit(hit);
  if (!normalizedHit.previous) throw new Error("Place intent requires a face-adjacent target");
  const target = normalizedHit.previous;
  const eye = vector3(origin, "Place intent origin");
  const distance = assertReach(eye, target, reach);
  const location = world.locate(target);
  if (!location.loaded) throw new Error(`Place target is in an unloaded chunk: ${target.join(",")}`);
  const before = world.getBlock(target);
  const beforeDefinition = world.registry.get(before.id);
  if (!beforeDefinition.empty && beforeDefinition.metadata?.physics?.replaceable !== true) {
    throw new Error(`Place target is not replaceable: ${before.id}`);
  }
  const after = normalizeBlockValue(world.registry, block);
  const afterDefinition = world.registry.get(after.id);
  if (afterDefinition.empty) throw new Error("Cannot place the empty block");
  if (afterDefinition.metadata?.physics?.solid !== false && playerPosition != null) {
    const body = normalizePlayerBody(playerBody);
    if (aabbIntersectsVoxel(playerAabb(playerPosition, body), target)) {
      throw new Error("Place target intersects the player body");
    }
  }
  return createBlockTransaction({
    id: nonEmptyId(id, "Place transaction id"),
    expectedRevisions: [{chunk: location.chunk.coord, revision: location.chunk.revision}],
    changes: [{chunk: location.chunk.coord, local: location.local, before, after}],
    metadata: metadata(intentMetadata, "place", {actor, distance, world: world.worldId, block: after.id}),
  }, world.registry);
}

export function createBuildTransaction(intent) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) throw new TypeError("Build intent must be an object");
  if (intent.type === "break") return createBreakBlockTransaction(intent);
  if (intent.type === "place") return createPlaceBlockTransaction(intent);
  throw new Error(`Unsupported build intent type: ${intent.type}`);
}

export function applyBuildIntent(world, intent) {
  const transaction = createBuildTransaction({...intent, world});
  return world.apply(transaction);
}
