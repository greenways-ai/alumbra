import assert from "node:assert/strict";
import test from "node:test";
import { createPlayCanvasVoxelRenderer } from "../src/playcanvas-renderer.js";
import { createTestRegistry, solidChunk } from "./fixtures.js";

function createMockPlayCanvas() {
  const resources = {
    meshes: [],
    materials: [],
    entities: [],
  };

  class Color {
    constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  }
  class Geometry {
    constructor() {
      this.positions = [];
      this.normals = [];
      this.uvs = [];
      this.indices = [];
    }
  }
  class Mesh {
    constructor(geometry) {
      this.geometry = geometry;
      this.destroyCount = 0;
      resources.meshes.push(this);
    }
    destroy() { this.destroyCount += 1; }
    static fromGeometry(_device, geometry) { return new Mesh(geometry); }
  }
  class StandardMaterial {
    constructor() {
      this.destroyCount = 0;
      this.updateCount = 0;
      resources.materials.push(this);
    }
    update() { this.updateCount += 1; }
    destroy() { this.destroyCount += 1; }
  }
  class MeshInstance {
    constructor(mesh, material) {
      this.mesh = mesh;
      this.material = material;
      this.castShadow = false;
      this.receiveShadow = false;
    }
  }
  class Entity {
    constructor(name) {
      this.name = name;
      this.enabled = true;
      this.render = null;
      this.destroyCount = 0;
      this.position = [0, 0, 0];
      resources.entities.push(this);
    }
    addComponent(type, data) {
      if (type === "render") this.render = { meshInstances: data?.meshInstances ?? [] };
      return this.render;
    }
    setLocalPosition(...position) { this.position = position; }
    destroy() { this.destroyCount += 1; }
  }
  const root = {
    children: [],
    addChild(entity) { this.children.push(entity); },
  };
  return {
    pc: {
      Color,
      Geometry,
      Mesh,
      StandardMaterial,
      MeshInstance,
      Entity,
      BLEND_NORMAL: 1,
      CULLFACE_NONE: 0,
    },
    app: { graphicsDevice: {}, root },
    resources,
  };
}

test("PlayCanvas adapter remeshes affected chunks and preserves unrelated entities", () => {
  const registry = createTestRegistry();
  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasVoxelRenderer({ pc, app, registry });
  const left = solidChunk(registry, { coord: [-1, 0, 0], shape: [2, 2, 2] });
  const right = solidChunk(registry, { coord: [0, 0, 0], shape: [2, 2, 2] });

  const leftMesh = renderer.setChunk(left);
  const leftEntity = resources.entities.find((entity) => entity.name === "Alumbra chunk -1,0,0");
  assert.equal(leftMesh.quadCount, 6);
  renderer.setChunk(right);
  const rightEntity = resources.entities.find((entity) => entity.name === "Alumbra chunk 0,0,0");
  assert.equal(renderer.stats().chunks, 2);
  assert.equal(renderer.getChunk([-1, 0, 0]), left);
  assert.equal(leftEntity.destroyCount, 0);
  assert.equal(rightEntity.destroyCount, 0);
  assert.equal(leftEntity.render.meshInstances.length, 1);
  assert.equal(rightEntity.render.meshInstances.length, 1);
  assert.equal(renderer.stats().quads, 10);

  const visibility = renderer.setView({
    position: [0, 0, 0],
    horizontalDistance: 0,
    verticalDistance: 0,
  });
  assert.deepEqual(visibility, { visible: 1, total: 2 });
  assert.equal(leftEntity.enabled, false);
  assert.equal(rightEntity.enabled, true);

  renderer.setSelection({ voxel: [0, 1, 0], face: "up" });
  const selection = resources.entities.find((entity) => entity.name === "Alumbra block selection");
  assert.equal(selection.enabled, true);
  assert.equal(selection.render.meshInstances.length, 1);

  assert.equal(renderer.removeChunk([0, 0, 0]), true);
  assert.equal(rightEntity.destroyCount, 1);
  assert.equal(renderer.stats().chunks, 1);
  assert.equal(renderer.stats().quads, 6);

  renderer.destroy();
  renderer.destroy();
  assert.equal(leftEntity.destroyCount, 1);
  assert.equal(selection.destroyCount, 1);
  assert.ok(resources.meshes.every((mesh) => mesh.destroyCount === 1));
  assert.ok(resources.materials.every((material) => material.destroyCount === 1));
});

test("same-geometry remesh uses the mesh resource pool", () => {
  const registry = createTestRegistry();
  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasVoxelRenderer({ pc, app, registry });
  const initial = solidChunk(registry, { shape: [2, 2, 2], revision: 0 });
  const next = solidChunk(registry, { shape: [2, 2, 2], revision: 1 });
  renderer.setChunk(initial);
  const firstMesh = resources.meshes[0];
  renderer.setChunk(next);
  assert.equal(resources.meshes.length, 1);
  assert.equal(firstMesh.destroyCount, 0);
  assert.deepEqual(renderer.stats().meshPool, { resources: 1, references: 1 });
  renderer.destroy();
  assert.equal(firstMesh.destroyCount, 1);
});
