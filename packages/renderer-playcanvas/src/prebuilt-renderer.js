import { chunkKey } from "@greenways/alumbra-core/coordinates";
import { CHUNK_MESH_FORMAT, meshGroupSignature } from "./mesh.js";
import { createReferencePool } from "./resource-pool.js";

export const PREBUILT_RENDERER_FORMAT = "alumbra.playcanvas-prebuilt-renderer/1";

const MAX_MESH_GROUPS = 4096;

function sameVector(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

function typedArray(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function assertPlayCanvas(pc, app) {
  if (!pc || typeof pc.Entity !== "function" || typeof pc.Geometry !== "function") {
    throw new TypeError("Alumbra prebuilt renderer requires the PlayCanvas module");
  }
  if (!pc.Mesh || typeof pc.Mesh.fromGeometry !== "function" || typeof pc.MeshInstance !== "function") {
    throw new TypeError("PlayCanvas Mesh and MeshInstance APIs are required");
  }
  if (!app?.graphicsDevice || !app?.root) {
    throw new TypeError("A started PlayCanvas Application is required");
  }
}

function validateChunk(chunk) {
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
    throw new TypeError("Prebuilt mesh installation requires a canonical chunk");
  }
  if (!chunk.key || chunkKey(chunk.coord) !== chunk.key) {
    throw new TypeError("Canonical chunk key and coordinate do not match");
  }
  if (!Array.isArray(chunk.shape) || chunk.shape.length !== 3) {
    throw new TypeError("Canonical chunk must carry a three-axis shape");
  }
  if (!Number.isSafeInteger(chunk.revision) || chunk.revision < 0 || chunk.revision > 0xffffffff) {
    throw new TypeError("Canonical chunk revision must be an unsigned 32-bit integer");
  }
  if (!Number.isSafeInteger(chunk.volume) || chunk.volume < 1) {
    throw new TypeError("Canonical chunk must carry a positive volume");
  }
  return chunk;
}

function validateMeshGroup(group, index, maxVertices) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new TypeError(`Prebuilt mesh group ${index} must be an object`);
  }
  if (typeof group.material !== "string" || !group.material.trim()) {
    throw new TypeError(`Prebuilt mesh group ${index} requires a material identity`);
  }
  if (
    !typedArray(group.positions)
    || !typedArray(group.normals)
    || !typedArray(group.uvs)
    || !typedArray(group.indices)
  ) {
    throw new TypeError(`Prebuilt mesh group ${index} requires typed geometry arrays`);
  }
  if (group.positions.length % 3 !== 0) {
    throw new TypeError(`Prebuilt mesh group ${index} positions must contain xyz triples`);
  }
  const vertexCount = group.positions.length / 3;
  if (!Number.isSafeInteger(vertexCount) || vertexCount > maxVertices) {
    throw new RangeError(`Prebuilt mesh group ${index} exceeds the bounded vertex count`);
  }
  if (group.normals.length !== group.positions.length) {
    throw new TypeError(`Prebuilt mesh group ${index} normals do not match its vertices`);
  }
  if (group.uvs.length !== vertexCount * 2) {
    throw new TypeError(`Prebuilt mesh group ${index} UVs do not match its vertices`);
  }
  if (group.indices.length % 3 !== 0) {
    throw new TypeError(`Prebuilt mesh group ${index} indices must contain triangles`);
  }
  for (const value of group.indices) {
    if (!Number.isSafeInteger(Number(value)) || value < 0 || value >= vertexCount) {
      throw new RangeError(`Prebuilt mesh group ${index} contains an out-of-range vertex index`);
    }
  }
  const triangleCount = group.indices.length / 3;
  if (group.vertexCount != null && group.vertexCount !== vertexCount) {
    throw new Error(`Prebuilt mesh group ${index} vertex count is inconsistent`);
  }
  if (group.triangleCount != null && group.triangleCount !== triangleCount) {
    throw new Error(`Prebuilt mesh group ${index} triangle count is inconsistent`);
  }
  if (group.quads != null && !Array.isArray(group.quads)) {
    throw new TypeError(`Prebuilt mesh group ${index} quads must be an array`);
  }
  return Object.freeze({ vertexCount, triangleCount, quadCount: group.quads?.length ?? 0 });
}

export function validatePrebuiltChunkMesh({ chunk, mesh } = {}) {
  const canonical = validateChunk(chunk);
  if (!mesh || typeof mesh !== "object" || Array.isArray(mesh)) {
    throw new TypeError("Prebuilt mesh installation requires a mesh object");
  }
  if (mesh.format !== CHUNK_MESH_FORMAT) {
    throw new Error(`Unsupported prebuilt chunk mesh format: ${mesh.format}`);
  }
  if (mesh.chunkKey !== canonical.key || mesh.revision !== canonical.revision) {
    throw new Error("Prebuilt chunk mesh does not match the canonical chunk revision");
  }
  if (!sameVector(mesh.coord, canonical.coord) || !sameVector(mesh.shape, canonical.shape)) {
    throw new Error("Prebuilt chunk mesh coordinate or shape does not match its canonical chunk");
  }
  if (!Array.isArray(mesh.groups) || mesh.groups.length > MAX_MESH_GROUPS) {
    throw new RangeError(`Prebuilt chunk mesh cannot exceed ${MAX_MESH_GROUPS} groups`);
  }
  const maxVertices = canonical.volume * 24;
  let vertices = 0;
  let triangles = 0;
  let quads = 0;
  mesh.groups.forEach((group, index) => {
    const counts = validateMeshGroup(group, index, maxVertices);
    vertices += counts.vertexCount;
    triangles += counts.triangleCount;
    quads += counts.quadCount;
  });
  if (vertices > maxVertices) {
    throw new RangeError("Prebuilt chunk mesh exceeds the canonical chunk vertex bound");
  }
  if (mesh.triangleCount !== triangles || mesh.quadCount !== quads) {
    throw new Error("Prebuilt chunk mesh aggregate counts are inconsistent");
  }
  return mesh;
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
  const source = Array.isArray(value) || typedArray(value) ? value : fallback;
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

function setRenderMeshInstances(entity, meshInstances) {
  if (!entity.render) entity.addComponent("render", { meshInstances });
  else entity.render.meshInstances = meshInstances;
}

function releaseResources(record, meshPool, materialPool) {
  let released = 0;
  for (const resource of record.resources.splice(0)) {
    if (meshPool.release(resource.meshKey)) released += 1;
    if (materialPool.release(resource.materialKey)) released += 1;
  }
  return released;
}

export function createPlayCanvasPrebuiltMeshRenderer({
  pc,
  app,
  registry,
  root = app?.root,
  createMaterial = null,
} = {}) {
  assertPlayCanvas(pc, app);
  if (!registry) throw new TypeError("Alumbra prebuilt renderer requires a block registry");
  if (!root || typeof root.addChild !== "function") {
    throw new TypeError("Prebuilt renderer root must be a PlayCanvas graph node");
  }

  const records = new Map();
  let shape = null;
  let destroyed = false;

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

  const ensureShape = (chunk) => {
    if (shape && shape.some((entry, axis) => entry !== chunk.shape[axis])) {
      throw new Error("All chunks in one prebuilt renderer must use the same shape");
    }
    shape ??= chunk.shape;
  };

  const ensureRecord = (chunk) => {
    let record = records.get(chunk.key);
    if (!record) {
      const entity = new pc.Entity(`Alumbra resident chunk ${chunk.key}`);
      entity.setLocalPosition?.(
        chunk.coord[0] * chunk.shape[0],
        chunk.coord[1] * chunk.shape[1],
        chunk.coord[2] * chunk.shape[2],
      );
      entity.addComponent("render", { meshInstances: [] });
      root.addChild(entity);
      record = { chunk, mesh: null, entity, resources: [] };
      records.set(chunk.key, record);
    }
    return record;
  };

  return Object.freeze({
    format: PREBUILT_RENDERER_FORMAT,
    installChunkMesh({ chunk, mesh } = {}) {
      if (destroyed) throw new Error("Alumbra prebuilt renderer has been destroyed");
      const canonical = validateChunk(chunk);
      const prebuilt = validatePrebuiltChunkMesh({ chunk: canonical, mesh });
      ensureShape(canonical);

      const resources = [];
      const meshInstances = [];
      try {
        for (const group of prebuilt.groups) {
          const meshResource = meshPool.acquire(group);
          const materialResource = materialPool.acquire({ key: group.material, group });
          resources.push({
            meshKey: meshResource.key,
            materialKey: materialResource.key,
          });
          const instance = new pc.MeshInstance(meshResource.value, materialResource.value);
          instance.castShadow = true;
          instance.receiveShadow = true;
          meshInstances.push(instance);
        }
      } catch (error) {
        for (const resource of resources.reverse()) {
          meshPool.release(resource.meshKey);
          materialPool.release(resource.materialKey);
        }
        throw error;
      }

      const record = ensureRecord(canonical);
      setRenderMeshInstances(record.entity, meshInstances);
      releaseResources(record, meshPool, materialPool);
      record.chunk = canonical;
      record.mesh = prebuilt;
      record.resources = resources;
      if ("renderNextFrame" in app) app.renderNextFrame = true;
      return Object.freeze({
        key: canonical.key,
        revision: canonical.revision,
        groups: prebuilt.groups.length,
        quads: prebuilt.quadCount,
        triangles: prebuilt.triangleCount,
      });
    },
    removeChunk(coordOrKey) {
      if (destroyed) return Object.freeze({ removed: false, resources: 0 });
      const key = Array.isArray(coordOrKey) ? chunkKey(coordOrKey) : String(coordOrKey);
      const record = records.get(key);
      if (!record) return Object.freeze({ removed: false, resources: 0 });
      records.delete(key);
      setRenderMeshInstances(record.entity, []);
      const before = meshPool.stats().resources + materialPool.stats().resources;
      releaseResources(record, meshPool, materialPool);
      const after = meshPool.stats().resources + materialPool.stats().resources;
      record.entity.destroy?.();
      if ("renderNextFrame" in app) app.renderNextFrame = true;
      return Object.freeze({ removed: true, resources: before - after });
    },
    getChunk(coordOrKey) {
      const key = Array.isArray(coordOrKey) ? chunkKey(coordOrKey) : String(coordOrKey);
      return records.get(key)?.chunk ?? null;
    },
    stats() {
      return Object.freeze({
        chunks: records.size,
        quads: [...records.values()].reduce((sum, record) => sum + (record.mesh?.quadCount ?? 0), 0),
        triangles: [...records.values()].reduce((sum, record) => sum + (record.mesh?.triangleCount ?? 0), 0),
        meshPool: meshPool.stats(),
        materialPool: materialPool.stats(),
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const record of records.values()) {
        setRenderMeshInstances(record.entity, []);
        releaseResources(record, meshPool, materialPool);
        record.entity.destroy?.();
      }
      records.clear();
      meshPool.destroy();
      materialPool.destroy();
    },
  });
}
