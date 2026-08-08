import assert from "node:assert/strict";
import test from "node:test";
import { buildChunkMesh, createChunkWorldAccessor } from "../src/mesh.js";
import { createTestRegistry, solidChunk } from "./fixtures.js";

const arrays = (mesh) => mesh.groups.map((group) => ({
  material: group.material,
  positions: [...group.positions],
  normals: [...group.normals],
  uvs: [...group.uvs],
  indices: [...group.indices],
  quads: group.quads,
}));

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
