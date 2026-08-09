import assert from "node:assert/strict";
import test from "node:test";
import { createChunk } from "@greenways/alumbra-core/chunks";
import {
  MESH_LIGHT_SNAPSHOT_FORMAT,
} from "../src/mesh-light.js";
import {
  buildChunkMesh,
  createChunkWorldAccessor,
  meshGroupSignature,
} from "../src/mesh.js";
import { createTestRegistry, solidChunk } from "./fixtures.js";

const arrays = (mesh) => mesh.groups.map((group) => ({
  material: group.material,
  positions: [...group.positions],
  normals: [...group.normals],
  uvs: [...group.uvs],
  indices: [...group.indices],
  quads: group.quads,
}));

const bytes = (chunk, value) => {
  const output = new Uint8Array(chunk.volume);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) output.set(value);
  else output.fill(value);
  return output;
};

const lightSnapshot = (chunk, {
  sunlight = 0,
  emitted = 0,
  generation = 1,
  epoch = 0,
} = {}) => ({
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId: "alumbra/lighting-default",
  generation,
  epoch,
  maxLevel: 15,
  key: chunk.key,
  coord: chunk.coord,
  shape: chunk.shape,
  sourceRevision: chunk.revision,
  sunlight: bytes(chunk, sunlight),
  emitted: bytes(chunk, emitted),
});

test("one voxel emits six outward quads", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry);
  const mesh = buildChunkMesh({ chunk, registry });
  assert.equal(mesh.quadCount, 6);
  assert.equal(mesh.triangleCount, 12);
  assert.deepEqual(mesh.groups.map((group) => group.material), ["alumbra/stone"]);
  assert.equal(mesh.groups[0].vertexCount, 24);
  assert.deepEqual(new Set(mesh.groups[0].quads.map((quad) => quad.face)), new Set([
    "east", "west", "up", "down", "south", "north",
  ]));
  assert.equal(Object.hasOwn(mesh, "lighting"), false);
  assert.equal(Object.hasOwn(mesh.groups[0], "sunlight"), false);
  assert.equal(Object.hasOwn(mesh.groups[0], "emitted"), false);
});

test("greedy meshing reduces a solid rectangular chunk to six quads", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { shape: [4, 3, 2] });
  const mesh = buildChunkMesh({ chunk, registry });
  assert.equal(mesh.quadCount, 6);
  assert.equal(mesh.triangleCount, 12);
  const sizes = mesh.groups[0].quads.map((quad) => quad.size.join("x")).sort();
  assert.deepEqual(sizes, ["2x3", "2x4", "3x2", "3x4", "4x2", "4x3"]);
});

test("loaded neighboring chunks remove their shared boundary faces", () => {
  const registry = createTestRegistry();
  const left = solidChunk(registry, { coord: [-1, 0, 0], shape: [2, 2, 2] });
  const right = solidChunk(registry, { coord: [0, 0, 0], shape: [2, 2, 2] });
  const chunks = new Map([[left.key, left], [right.key, right]]);
  const accessor = createChunkWorldAccessor(chunks, registry);
  const leftMesh = buildChunkMesh({ chunk: left, registry, getBlockAtWorld: accessor.getBlock });
  const rightMesh = buildChunkMesh({ chunk: right, registry, getBlockAtWorld: accessor.getBlock });
  assert.equal(leftMesh.quadCount, 5);
  assert.equal(rightMesh.quadCount, 5);
  assert.equal(leftMesh.groups[0].quads.some((quad) => quad.face === "east"), false);
  assert.equal(rightMesh.groups[0].quads.some((quad) => quad.face === "west"), false);
});

test("meshing is deterministic for the same chunk and neighborhood", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { coord: [-2, 1, 3], shape: [3, 2, 4] });
  const first = buildChunkMesh({ chunk, registry });
  const second = buildChunkMesh({ chunk, registry });
  assert.deepEqual(arrays(first), arrays(second));
});

test("adjacent identical transparent blocks suppress their internal face", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { shape: [2, 1, 1], block: "alumbra/glass" });
  const mesh = buildChunkMesh({ chunk, registry });
  assert.equal(mesh.quadCount, 6);
});

test("equal face light permits greedy merging while different light splits quads", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { shape: [2, 1, 1] });
  const equal = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [lightSnapshot(chunk, { sunlight: 8, emitted: 2 })],
  });
  const split = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [lightSnapshot(chunk, { sunlight: [4, 10], emitted: [1, 3] })],
  });

  assert.equal(equal.quadCount, 6);
  assert.equal(split.quadCount, 10);
  assert.equal(equal.groups[0].sunlight.length, equal.groups[0].vertexCount);
  assert.equal(equal.groups[0].emitted.length, equal.groups[0].vertexCount);
  assert.deepEqual([...new Set(equal.groups[0].sunlight)], [8]);
  assert.deepEqual([...new Set(equal.groups[0].emitted)], [2]);
  assert.notEqual(meshGroupSignature(equal.groups[0]), meshGroupSignature(split.groups[0]));

  const repeated = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [lightSnapshot(chunk, { sunlight: [4, 10], emitted: [1, 3] })],
  });
  assert.deepEqual(
    split.groups.map((group) => ({
      sunlight: [...group.sunlight],
      emitted: [...group.emitted],
      quads: group.quads,
    })),
    repeated.groups.map((group) => ({
      sunlight: [...group.sunlight],
      emitted: [...group.emitted],
      quads: group.quads,
    })),
  );
});

test("an exposed negative-coordinate boundary face samples its loaded neighbour", () => {
  const registry = createTestRegistry();
  const left = solidChunk(registry, { coord: [-1, 0, 0], shape: [1, 1, 1] });
  const right = createChunk({ registry, coord: [0, 0, 0], shape: [1, 1, 1] });
  const accessor = createChunkWorldAccessor(new Map([
    [left.key, left],
    [right.key, right],
  ]), registry);
  const mesh = buildChunkMesh({
    chunk: left,
    registry,
    getBlockAtWorld: accessor.getBlock,
    lightSnapshots: [
      lightSnapshot(right, { sunlight: 13, emitted: 4 }),
      lightSnapshot(left, { sunlight: 2, emitted: 1 }),
    ],
  });
  const east = mesh.groups[0].quads.find((quad) => quad.face === "east");
  const west = mesh.groups[0].quads.find((quad) => quad.face === "west");
  assert.deepEqual({ sunlight: east.sunlight, emitted: east.emitted }, { sunlight: 13, emitted: 4 });
  assert.deepEqual({ sunlight: west.sunlight, emitted: west.emitted }, { sunlight: 2, emitted: 1 });
});
