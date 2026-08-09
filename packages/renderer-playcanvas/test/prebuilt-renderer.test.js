import assert from "node:assert/strict";
import test from "node:test";
import { createBlockRegistry, createChunk, patchChunk } from "@greenways/alumbra-core";
import { buildChunkMesh } from "../src/mesh.js";
import {
  MATERIAL_RENDER_EVIDENCE_FORMAT,
  createPlayCanvasPrebuiltMeshRenderer,
  validatePrebuiltChunkMesh,
} from "../src/prebuilt-renderer.js";
import { MATERIAL_PROFILE_IDS } from "../src/material-profile.js";
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
      this.drawOrder = 0;
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

function createMaterialMatrixRegistry({ unknown = false } = {}) {
  const render = (profile, color, extra = {}) => ({ profile, color, ...extra });
  return createBlockRegistry([
    { id: "matrix/air", empty: true, metadata: { render: { visible: false, opaque: false } } },
    { id: "matrix/opaque", metadata: { render: render(MATERIAL_PROFILE_IDS.opaque, [0.2, 0.3, 0.4]) } },
    { id: "matrix/cutout", metadata: { render: render(MATERIAL_PROFILE_IDS.cutout, [0.2, 0.7, 0.3, 0.8], { alphaCutoff: 0.5 }) } },
    { id: "matrix/transparent", metadata: { render: render(MATERIAL_PROFILE_IDS.transparent, [0.4, 0.8, 0.9, 0.4], { opaque: false, opacity: 0.4 }) } },
    { id: "matrix/emissive", metadata: { render: render(MATERIAL_PROFILE_IDS.emissive, [0.5, 0.1, 0.05], { emissive: [0.9, 0.2, 0.05] }) } },
    { id: "matrix/overlay", metadata: { render: render(MATERIAL_PROFILE_IDS.selectionOverlay, [1, 0.8, 0.2, 0.25], { selectionOverlay: true, opaque: false, opacity: 0.25 }) } },
    ...(unknown ? [{ id: "matrix/unknown", metadata: { render: { profile: "matrix/not-installed", color: [1, 0, 1] } } }] : []),
  ], { id: unknown ? "matrix/unknown-registry" : "matrix/registry", version: "0.1.0" });
}

function materialMatrixChunk(registry, coord) {
  const chunk = createChunk({ registry, coord, shape: [5, 1, 1] });
  return patchChunk(chunk, [
    { local: [0, 0, 0], value: "matrix/opaque" },
    { local: [1, 0, 0], value: "matrix/cutout" },
    { local: [2, 0, 0], value: "matrix/transparent" },
    { local: [3, 0, 0], value: "matrix/emissive" },
    { local: [4, 0, 0], value: "matrix/overlay" },
  ], registry, { revision: 1 });
}

test("prebuilt renderer installs five passes and exposes bounded shared-resource evidence", () => {
  const registry = createMaterialMatrixRegistry();
  const { pc, app } = createMockPlayCanvas();
  const renderer = createPlayCanvasPrebuiltMeshRenderer({ pc, app, registry });
  for (const coord of [[0, 0, 0], [1, 0, 0]]) {
    const chunk = materialMatrixChunk(registry, coord);
    renderer.installChunkMesh({ chunk, mesh: buildChunkMesh({ chunk, registry }) });
  }
  assert.deepEqual(renderer.materialEvidence(), {
    format: MATERIAL_RENDER_EVIDENCE_FORMAT,
    materialGroupCount: 10,
    profileCount: 5,
    profileIds: [
      MATERIAL_PROFILE_IDS.cutout,
      MATERIAL_PROFILE_IDS.emissive,
      MATERIAL_PROFILE_IDS.opaque,
      MATERIAL_PROFILE_IDS.selectionOverlay,
      MATERIAL_PROFILE_IDS.transparent,
    ].sort(),
    opaquePassCount: 2,
    cutoutPassCount: 2,
    transparentPassCount: 2,
    emissivePassCount: 2,
    overlayPassCount: 2,
    sharedMeshResources: 5,
    sharedMaterialResources: 5,
    sharedResourceCount: 10,
    materialResources: 5,
    materialReferences: 10,
  });
  renderer.destroy();
  assert.equal(renderer.materialEvidence().materialGroupCount, 0);
});

test("unknown material profiles fail before any PlayCanvas resource is allocated", () => {
  const registry = createMaterialMatrixRegistry({ unknown: true });
  const { pc, app, resources } = createMockPlayCanvas();
  const renderer = createPlayCanvasPrebuiltMeshRenderer({ pc, app, registry });
  const chunk = createChunk({ registry, coord: [0, 0, 0], shape: [1, 1, 1], fill: "matrix/unknown", revision: 1 });
  const mesh = buildChunkMesh({ chunk, registry });
  assert.throws(
    () => renderer.installChunkMesh({ chunk, mesh }),
    (error) => error.code === "renderer/material-profile-not-installed",
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
