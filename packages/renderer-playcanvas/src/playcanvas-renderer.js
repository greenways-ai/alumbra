import { normalizeBlockValue } from "@greenways/alumbra-core/blocks";
import { getBlock } from "@greenways/alumbra-core/chunks";
import { chunkKey, worldToChunk } from "@greenways/alumbra-core/coordinates";
import { buildChunkMesh, meshGroupSignature } from "./mesh.js";
import { createReferencePool } from "./resource-pool.js";
import { visibleChunkKeys } from "./visibility.js";

const NEIGHBOR_OFFSETS = Object.freeze([
  Object.freeze([1, 0, 0]),
  Object.freeze([-1, 0, 0]),
  Object.freeze([0, 1, 0]),
  Object.freeze([0, -1, 0]),
  Object.freeze([0, 0, 1]),
  Object.freeze([0, 0, -1]),
]);

const FACE_AXES = Object.freeze({
  east: Object.freeze({ normal: [1, 0, 0], uAxis: 1, vAxis: 2 }),
  west: Object.freeze({ normal: [-1, 0, 0], uAxis: 2, vAxis: 1 }),
  up: Object.freeze({ normal: [0, 1, 0], uAxis: 2, vAxis: 0 }),
  down: Object.freeze({ normal: [0, -1, 0], uAxis: 0, vAxis: 2 }),
  south: Object.freeze({ normal: [0, 0, 1], uAxis: 0, vAxis: 1 }),
  north: Object.freeze({ normal: [0, 0, -1], uAxis: 1, vAxis: 0 }),
});

function assertPlayCanvas(pc, app) {
  if (!pc || typeof pc.Entity !== "function" || typeof pc.Geometry !== "function") {
    throw new TypeError("Alumbra PlayCanvas renderer requires the PlayCanvas module");
  }
  if (!pc.Mesh || typeof pc.Mesh.fromGeometry !== "function" || typeof pc.MeshInstance !== "function") {
    throw new TypeError("PlayCanvas Mesh and MeshInstance APIs are required");
  }
  if (!app?.graphicsDevice || !app?.root) throw new TypeError("A started PlayCanvas Application is required");
}

function materialDescription(registry, key, group) {
  const definition = registry.has(key) ? registry.get(key) : null;
  const render = definition?.metadata?.render && typeof definition.metadata.render === "object"
    ? definition.metadata.render
    : {};
  return {
    color: Array.isArray(render.color) ? render.color : group.color,
    emissive: Array.isArray(render.emissive) ? render.emissive : null,
    opacity: Number.isFinite(Number(render.opacity)) ? Math.max(0, Math.min(1, Number(render.opacity))) : 1,
    metalness: Number.isFinite(Number(render.metalness)) ? Math.max(0, Math.min(1, Number(render.metalness))) : 0,
    gloss: Number.isFinite(Number(render.gloss)) ? Math.max(0, Math.min(1, Number(render.gloss))) : 0.25,
  };
}

function pcColor(pc, value, fallback = [1, 1, 1]) {
  const source = Array.isArray(value) ? value : fallback;
  return new pc.Color(
    Number.isFinite(Number(source[0])) ? Number(source[0]) : fallback[0],
    Number.isFinite(Number(source[1])) ? Number(source[1]) : fallback[1],
    Number.isFinite(Number(source[2])) ? Number(source[2]) : fallback[2],
  );
}

function createDefaultMaterial(pc, registry, input) {
  const descriptor = materialDescription(registry, input.key, input.group);
  const material = new pc.StandardMaterial();
  material.name = `Alumbra ${input.key}`;
  material.diffuse = pcColor(pc, descriptor.color, [0.62, 0.67, 0.72]);
  if (descriptor.emissive) material.emissive = pcColor(pc, descriptor.emissive, [0, 0, 0]);
  material.opacity = descriptor.opacity;
  material.metalness = descriptor.metalness;
  material.gloss = descriptor.gloss;
  if (descriptor.opacity < 1) {
    if (pc.BLEND_NORMAL != null) material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update?.();
  return material;
}

function createMesh(pc, device, group) {
  const geometry = new pc.Geometry();
  geometry.positions = Array.from(group.positions);
  geometry.normals = Array.from(group.normals);
  geometry.uvs = Array.from(group.uvs);
  geometry.indices = Array.from(group.indices);
  return pc.Mesh.fromGeometry(device, geometry);
}

function releaseResources(record, meshPool, materialPool) {
  for (const resource of record.resources.splice(0)) {
    meshPool.release(resource.meshKey);
    materialPool.release(resource.materialKey);
  }
}

function setRenderMeshInstances(entity, meshInstances) {
  if (!entity.render) entity.addComponent("render", { meshInstances });
  else entity.render.meshInstances = meshInstances;
}

function offsetCoord(coord, offset) {
  return coord.map((entry, axis) => entry + offset[axis]);
}

function selectionGeometry(hit, epsilon = 0.002) {
  const face = FACE_AXES[hit?.face];
  if (!face || !Array.isArray(hit.voxel)) return null;
  const origin = [...hit.voxel];
  const normalAxis = face.normal.findIndex((entry) => entry !== 0);
  if (face.normal[normalAxis] > 0) origin[normalAxis] += 1;
  for (let axis = 0; axis < 3; axis += 1) origin[axis] += face.normal[axis] * epsilon;
  const p0 = [...origin];
  const p1 = [...origin]; p1[face.uAxis] += 1;
  const p2 = [...p1]; p2[face.vAxis] += 1;
  const p3 = [...origin]; p3[face.vAxis] += 1;
  return {
    positions: [...p0, ...p1, ...p2, ...p3],
    normals: [...face.normal, ...face.normal, ...face.normal, ...face.normal],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

export function createPlayCanvasVoxelRenderer({
  pc,
  app,
  registry,
  root = app?.root,
  createMaterial = null,
  describeBlock = undefined,
  selectionColor = [1, 0.82, 0.25],
} = {}) {
  assertPlayCanvas(pc, app);
  if (!registry) throw new TypeError("Alumbra PlayCanvas renderer requires a block registry");
  if (!root || typeof root.addChild !== "function") throw new TypeError("Renderer root must be a PlayCanvas graph node");

  const empty = normalizeBlockValue(registry, registry.emptyBlock);
  const chunks = new Map();
  let shape = null;
  let destroyed = false;
  let selectionEntity = null;
  let selectionMesh = null;
  let selectionMaterial = null;

  const meshPool = createReferencePool({
    keyOf: meshGroupSignature,
    create: (group) => createMesh(pc, app.graphicsDevice, group),
    destroy: (mesh) => mesh.destroy?.(),
  });
  const materialPool = createReferencePool({
    keyOf: (input) => input.key,
    create: (input) => (createMaterial
      ? createMaterial({ pc, app, registry, material: input.key, group: input.group })
      : createDefaultMaterial(pc, registry, input)),
    destroy: (material) => material.destroy?.(),
  });

  const getBlockAtWorld = (world) => {
    if (!shape) return empty;
    const location = worldToChunk(world, shape);
    const record = chunks.get(chunkKey(location.chunk));
    return record ? getBlock(record.chunk, location.local) : empty;
  };

  const remesh = (key) => {
    const record = chunks.get(key);
    if (!record) return;
    const meshData = buildChunkMesh({
      chunk: record.chunk,
      registry,
      getBlockAtWorld,
      describeBlock,
    });
    const resources = [];
    const meshInstances = [];
    try {
      for (const group of meshData.groups) {
        const meshResource = meshPool.acquire(group);
        const materialResource = materialPool.acquire({ key: group.material, group });
        resources.push({
          meshKey: meshResource.key,
          materialKey: materialResource.key,
        });
        const meshInstance = new pc.MeshInstance(meshResource.value, materialResource.value);
        meshInstance.castShadow = true;
        meshInstance.receiveShadow = true;
        meshInstances.push(meshInstance);
      }
    } catch (error) {
      for (const resource of resources.reverse()) {
        meshPool.release(resource.meshKey);
        materialPool.release(resource.materialKey);
      }
      throw error;
    }
    setRenderMeshInstances(record.entity, meshInstances);
    releaseResources(record, meshPool, materialPool);
    record.resources = resources;
    record.mesh = meshData;
  };

  const remeshNeighborhood = (coord) => {
    remesh(chunkKey(coord));
    for (const offset of NEIGHBOR_OFFSETS) remesh(chunkKey(offsetCoord(coord, offset)));
  };

  const ensureSelection = () => {
    if (selectionEntity) return;
    selectionMaterial = new pc.StandardMaterial();
    selectionMaterial.name = "Alumbra block selection";
    selectionMaterial.diffuse = pcColor(pc, selectionColor, [1, 0.82, 0.25]);
    selectionMaterial.emissive = pcColor(pc, selectionColor, [1, 0.82, 0.25]);
    selectionMaterial.opacity = 0.45;
    selectionMaterial.depthWrite = false;
    if (pc.BLEND_NORMAL != null) selectionMaterial.blendType = pc.BLEND_NORMAL;
    if (pc.CULLFACE_NONE != null) selectionMaterial.cull = pc.CULLFACE_NONE;
    selectionMaterial.update?.();
    selectionEntity = new pc.Entity("Alumbra block selection");
    selectionEntity.enabled = false;
    selectionEntity.addComponent("render", { meshInstances: [] });
    root.addChild(selectionEntity);
  };

  return Object.freeze({
    setChunk(chunk) {
      if (destroyed) throw new Error("Alumbra PlayCanvas renderer has been destroyed");
      if (!chunk?.key || !Array.isArray(chunk.shape)) throw new TypeError("setChunk requires an Alumbra chunk");
      if (shape && shape.some((entry, axis) => entry !== chunk.shape[axis])) {
        throw new Error("All chunks in one renderer must use the same shape");
      }
      shape ??= chunk.shape;
      let record = chunks.get(chunk.key);
      if (!record) {
        const entity = new pc.Entity(`Alumbra chunk ${chunk.key}`);
        entity.setLocalPosition?.(
          chunk.coord[0] * chunk.shape[0],
          chunk.coord[1] * chunk.shape[1],
          chunk.coord[2] * chunk.shape[2],
        );
        entity.addComponent("render", { meshInstances: [] });
        root.addChild(entity);
        record = { chunk, entity, mesh: null, resources: [] };
        chunks.set(chunk.key, record);
      } else {
        record.chunk = chunk;
      }
      remeshNeighborhood(chunk.coord);
      return record.mesh;
    },
    removeChunk(coord) {
      if (destroyed) return false;
      const key = Array.isArray(coord) ? chunkKey(coord) : String(coord);
      const record = chunks.get(key);
      if (!record) return false;
      chunks.delete(key);
      setRenderMeshInstances(record.entity, []);
      releaseResources(record, meshPool, materialPool);
      record.entity.destroy?.();
      for (const offset of NEIGHBOR_OFFSETS) remesh(chunkKey(offsetCoord(record.chunk.coord, offset)));
      return true;
    },
    setView(options) {
      if (!shape) return Object.freeze({ visible: 0, total: chunks.size });
      const visible = visibleChunkKeys({ ...options, shape });
      let count = 0;
      for (const [key, record] of chunks) {
        record.entity.enabled = visible.has(key);
        if (record.entity.enabled) count += 1;
      }
      return Object.freeze({ visible: count, total: chunks.size });
    },
    setSelection(hit) {
      ensureSelection();
      const data = selectionGeometry(hit);
      if (!data) {
        selectionEntity.enabled = false;
        return;
      }
      const geometry = new pc.Geometry();
      geometry.positions = data.positions;
      geometry.normals = data.normals;
      geometry.uvs = data.uvs;
      geometry.indices = data.indices;
      const nextMesh = pc.Mesh.fromGeometry(app.graphicsDevice, geometry);
      const instance = new pc.MeshInstance(nextMesh, selectionMaterial);
      setRenderMeshInstances(selectionEntity, [instance]);
      selectionMesh?.destroy?.();
      selectionMesh = nextMesh;
      selectionEntity.enabled = true;
    },
    getChunk(coord) {
      return chunks.get(Array.isArray(coord) ? chunkKey(coord) : String(coord))?.chunk ?? null;
    },
    getBlock(world) {
      return getBlockAtWorld(world);
    },
    stats() {
      return Object.freeze({
        chunks: chunks.size,
        quads: [...chunks.values()].reduce((sum, record) => sum + (record.mesh?.quadCount ?? 0), 0),
        triangles: [...chunks.values()].reduce((sum, record) => sum + (record.mesh?.triangleCount ?? 0), 0),
        meshPool: meshPool.stats(),
        materialPool: materialPool.stats(),
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const record of chunks.values()) {
        setRenderMeshInstances(record.entity, []);
        releaseResources(record, meshPool, materialPool);
        record.entity.destroy?.();
      }
      chunks.clear();
      if (selectionEntity) {
        setRenderMeshInstances(selectionEntity, []);
        selectionEntity.destroy?.();
      }
      selectionMesh?.destroy?.();
      selectionMaterial?.destroy?.();
      meshPool.destroy();
      materialPool.destroy();
    },
  });
}
