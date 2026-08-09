import assert from "node:assert/strict";
import test from "node:test";
import { buildChunkMesh } from "../src/mesh.js";
import {
  createPlayCanvasPrebuiltMeshRenderer,
  validatePrebuiltChunkMesh,
} from "../src/prebuilt-renderer.js";
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
    },
    app: { graphicsDevice: {}, root, renderNextFrame: false },
    resources,
  };
}

test("prebuilt renderer installs an exact worker mesh and releases pooled GPU resources", () => {
  const registry = createTestRegistry();
  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasPrebuiltMeshRenderer({ pc, app, registry });
  const initial = solidChunk(registry, { shape: [2, 2, 2], revision: 0 });
  const firstMesh = buildChunkMesh({ chunk: initial, registry });

  const installed = renderer.installChunkMesh({ chunk: initial, mesh: firstMesh });
  assert.deepEqual(installed, {
    key: "0,0,0",
    revision: 0,
    groups: 1,
    quads: 6,
    triangles: 12,
  });
  assert.equal(renderer.getChunk([0, 0, 0]), initial);
  assert.deepEqual(renderer.stats(), {
    chunks: 1,
    quads: 6,
    triangles: 12,
    meshPool: { resources: 1, references: 1 },
    materialPool: { resources: 1, references: 1 },
  });

  const next = solidChunk(registry, { shape: [2, 2, 2], revision: 1 });
  const nextMesh = buildChunkMesh({ chunk: next, registry });
  renderer.installChunkMesh({ chunk: next, mesh: nextMesh });
  assert.equal(renderer.getChunk("0,0,0"), next);
  assert.equal(resources.meshes.length, 1, "equal geometry should reuse the pooled mesh");
  assert.equal(resources.materials.length, 1, "equal materials should reuse the pooled material");
  assert.throws(
    () => renderer.installChunkMesh({ chunk: next, mesh: firstMesh }),
    /does not match the canonical chunk revision/,
  );

  const removed = renderer.removeChunk([0, 0, 0]);
  assert.deepEqual(removed, { removed: true, resources: 2 });
  assert.equal(renderer.stats().chunks, 0);
  assert.ok(resources.meshes.every((mesh) => mesh.destroyCount === 1));
  assert.ok(resources.materials.every((material) => material.destroyCount === 1));

  renderer.destroy();
  renderer.destroy();
});

test("prebuilt mesh validation rejects malformed geometry before PlayCanvas allocation", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { shape: [2, 2, 2], revision: 4 });
  const mesh = buildChunkMesh({ chunk, registry });
  const malformed = {
    ...mesh,
    groups: [{
      ...mesh.groups[0],
      indices: Uint16Array.from([0, 1, 999]),
      triangleCount: 1,
    }],
    triangleCount: 1,
  };
  assert.throws(
    () => validatePrebuiltChunkMesh({ chunk, mesh: malformed }),
    /out-of-range vertex index/,
  );
});
