import assert from "node:assert/strict";
import test from "node:test";
import { buildChunkMesh } from "../src/mesh.js";
import { MESH_LIGHT_SNAPSHOT_FORMAT } from "../src/mesh-light.js";
import {
  MESH_LIGHT_RENDER_EVIDENCE_FORMAT,
  createPlayCanvasPrebuiltMeshRenderer,
  validatePrebuiltChunkMesh,
} from "../src/prebuilt-renderer.js";
import { createTestRegistry, solidChunk } from "./fixtures.js";

function createMockPlayCanvas() {
  const resources = { meshes: [], materials: [], entities: [] };
  class Color {
    constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  }
  class Geometry {
    constructor() {
      this.positions = [];
      this.normals = [];
      this.uvs = [];
      this.indices = [];
      this.colors = undefined;
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
      this.diffuseVertexColor = false;
      this.diffuseVertexColorChannel = null;
      this.vertexColorGamma = true;
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
      this.drawOrder = 0;
    }
  }
  class Entity {
    constructor(name) {
      this.name = name;
      this.render = null;
      this.destroyCount = 0;
      resources.entities.push(this);
    }
    addComponent(type, data) {
      if (type === "render") this.render = { meshInstances: data?.meshInstances ?? [] };
      return this.render;
    }
    setLocalPosition(...position) { this.position = position; }
    destroy() { this.destroyCount += 1; }
  }
  const root = { children: [], addChild(entity) { this.children.push(entity); } };
  return {
    pc: {
      Color,
      Geometry,
      Mesh,
      StandardMaterial,
      MeshInstance,
      Entity,
      BLEND_NONE: 0,
      BLEND_NORMAL: 1,
      BLEND_ADDITIVE: 2,
      CULLFACE_NONE: 0,
      CULLFACE_FRONT: 1,
      CULLFACE_BACK: 2,
    },
    app: { graphicsDevice: {}, root, renderNextFrame: false },
    resources,
  };
}

const snapshot = (chunk, sunlight, emitted = 0) => ({
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId: "alumbra/lighting-default",
  generation: 4,
  epoch: 2,
  maxLevel: 15,
  key: chunk.key,
  coord: chunk.coord,
  shape: chunk.shape,
  sourceRevision: chunk.revision,
  sunlight: new Uint8Array(chunk.volume).fill(sunlight),
  emitted: new Uint8Array(chunk.volume).fill(emitted),
});

const colorProfile = Object.freeze({
  id: "alumbra/test-prebuilt-light",
  ambient: 0,
  sunlightScale: 1,
  emittedScale: 0,
});

test("prebuilt renderer projects exact light bytes into PlayCanvas vertex colors", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { revision: 2 });
  const mesh = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, 15)],
  });
  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasPrebuiltMeshRenderer({
    pc,
    app,
    registry,
    meshLightColorProfile: colorProfile,
  });
  const installed = renderer.installChunkMesh({ chunk, mesh });

  assert.equal(installed.lighting.format, MESH_LIGHT_RENDER_EVIDENCE_FORMAT);
  assert.equal(installed.lighting.profileId, "alumbra/lighting-default");
  assert.equal(installed.lighting.generation, 4);
  assert.equal(installed.lighting.epoch, 2);
  assert.equal(installed.lighting.minimumByte, 255);
  assert.equal(installed.lighting.maximumByte, 255);
  assert.equal(resources.meshes.length, 1);
  assert.equal(resources.meshes[0].geometry.colors.length, mesh.groups[0].vertexCount * 4);
  assert.deepEqual([...new Set(resources.meshes[0].geometry.colors)], [255]);
  assert.equal(resources.materials[0].diffuseVertexColor, true);
  assert.equal(resources.materials[0].diffuseVertexColorChannel, "rgb");
  assert.equal(resources.materials[0].vertexColorGamma, false);
  assert.deepEqual(renderer.materialEvidence().lighting, {
    format: MESH_LIGHT_RENDER_EVIDENCE_FORMAT,
    litGroupCount: 1,
    profileIds: ["alumbra/lighting-default"],
    colorProfileIds: ["alumbra/test-prebuilt-light"],
    vertices: mesh.groups[0].vertexCount,
    sunlightVertices: mesh.groups[0].vertexCount,
    emittedVertices: 0,
    minimumByte: 255,
    maximumByte: 255,
  });
  renderer.destroy();
});

test("same light reuses resources while changed light replaces the mesh only", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { revision: 1 });
  const bright = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, 15)],
  });
  const dim = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, 5)],
  });
  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasPrebuiltMeshRenderer({
    pc,
    app,
    registry,
    meshLightColorProfile: colorProfile,
  });

  renderer.installChunkMesh({ chunk, mesh: bright });
  renderer.installChunkMesh({ chunk, mesh: bright });
  assert.equal(resources.meshes.length, 1);
  assert.equal(resources.materials.length, 1);

  renderer.installChunkMesh({ chunk, mesh: dim });
  assert.equal(resources.meshes.length, 2);
  assert.equal(resources.meshes[0].destroyCount, 1);
  assert.equal(resources.materials.length, 1);
  assert.deepEqual(renderer.stats(), {
    chunks: 1,
    quads: dim.quadCount,
    triangles: dim.triangleCount,
    meshPool: { resources: 1, references: 1 },
    materialPool: { resources: 1, references: 1 },
  });
  renderer.destroy();
  assert.equal(resources.meshes[1].destroyCount, 1);
  assert.equal(resources.materials[0].destroyCount, 1);
});

test("malformed light arrays fail before any PlayCanvas allocation", () => {
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { revision: 3 });
  const mesh = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, 10)],
  });
  const malformed = {
    ...mesh,
    groups: [{
      ...mesh.groups[0],
      sunlight: Uint8Array.of(1),
    }],
  };
  assert.throws(
    () => validatePrebuiltChunkMesh({ chunk, mesh: malformed }),
    (error) => error.code === "mesh-light/group-bytes",
  );

  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasPrebuiltMeshRenderer({ pc, app, registry });
  assert.throws(
    () => renderer.installChunkMesh({ chunk, mesh: malformed }),
    (error) => error.code === "mesh-light/group-bytes",
  );
  assert.deepEqual(renderer.stats(), {
    chunks: 0,
    quads: 0,
    triangles: 0,
    meshPool: { resources: 0, references: 0 },
    materialPool: { resources: 0, references: 0 },
  });
  assert.equal(resources.meshes.length, 0);
  assert.equal(resources.materials.length, 0);
  assert.equal(resources.entities.length, 0);
  renderer.destroy();
});
