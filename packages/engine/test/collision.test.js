import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyIntersectsWorld,
  moveBody,
  overlappingVoxels,
  playerAabb,
} from "../src/index.js";
import {collisionWorld} from "./fixtures.js";

test("body collision lands on a voxel floor without tunnelling", () => {
  const world = collisionWorld();
  const result = moveBody({
    position: [0.5, 4, 0.5],
    delta: [0, -8, 0],
    ...world,
    maxSubstep: 0.2,
  });
  assert.equal(result.grounded, true);
  assert.equal(result.collisions[1], true);
  assert.ok(Math.abs(result.position[1] - 1) < 1e-5);
  assert.equal(bodyIntersectsWorld({position: result.position, ...world}), false);
});

test("body collision stops horizontal movement against a wall", () => {
  const walls = [];
  for (let y = 1; y <= 3; y += 1) {
    for (let z = -1; z <= 1; z += 1) walls.push([2, y, z]);
  }
  const world = collisionWorld({walls});
  const result = moveBody({
    position: [0.5, 1, 0.5],
    delta: [5, 0, 0],
    ...world,
    maxSubstep: 0.15,
  });
  assert.equal(result.collisions[0], true);
  assert.ok(result.position[0] <= 1.66001);
  assert.ok(result.position[0] >= 1.659);
  assert.equal(bodyIntersectsWorld({position: result.position, ...world}), false);
});

test("collision math covers negative voxels and explicit missing policy", () => {
  const aabb = playerAabb([-0.5, 1, -0.5]);
  assert.deepEqual(overlappingVoxels([-0.5, 1, -0.5]), [
    [-1, 1, -1], [-1, 2, -1],
  ]);
  assert.ok(aabb.min[0] < 0 && aabb.min[2] < 0);
  const getBlock = () => null;
  const isSolid = () => false;
  assert.equal(bodyIntersectsWorld({position: [0.5, 1, 0.5], getBlock, isSolid, missingSolid: true}), true);
  assert.equal(bodyIntersectsWorld({position: [0.5, 1, 0.5], getBlock, isSolid, missingSolid: false}), false);
});

test("movement rejects a body starting inside a solid voxel", () => {
  const world = collisionWorld();
  assert.throws(() => moveBody({
    position: [0.5, 0.5, 0.5],
    delta: [0, 0, 0],
    ...world,
  }), /starts inside/);
});
