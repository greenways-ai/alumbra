import { chunkKey } from "@greenways/alumbra-core/coordinates";
import { CHUNK_MESH_FORMAT, meshGroupSignature } from "./mesh.js";
import {
  DEFAULT_MATERIAL_PROFILES,
  applyMaterialProfileToPlayCanvas,
  createMaterialProfileRegistry,
  describeMaterialGroup,
} from "./material-profile.js";
import { createReferencePool } from "./resource-pool.js";

export const PREBUILT_RENDERER_FORMAT = "alumbra.playcanvas-prebuilt-renderer/1";
export const MATERIAL_RENDER_EVIDENCE_FORMAT = "alumbra.material-render-evidence/1";

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

function createProfileMaterial(pc, descriptor) {
  const material = new pc.StandardMaterial();
  return applyMaterialProfileToPlayCanvas({ pc, material, descriptor });
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

function materialEvidence(records, meshPool, materialPool) {
  const resources = [...records.values()].flatMap((record) => record.resources);
  const passCounts = {
    opaque: 0,
    cutout: 0,
    transparent: 0,
    emissive: 0,
    overlay: 0,
  };
  const profileIds = new Set();
  for (const resource of resources) {
    if (Object.hasOwn(passCounts, resource.pass)) passCounts[resource.pass] += 1;
    profileIds.add(resource.profileId);
  }
  const meshStats = meshPool.stats();
  const materialStats = materialPool.stats();
  return Object.freeze({
    format: MATERIAL_RENDER_EVIDENCE_FORMAT,
    materialGroupCount: resources.length,
    profileCount: profileIds.size,
    profileIds: Object.freeze([...profileIds].sort()),
    opaquePassCount: passCounts.opaque,
    cutoutPassCount: passCounts.cutout,
    transparentPassCount: passCounts.transparent,
    emissivePassCount: passCounts.emissive,
    overlayPassCount: passCounts.overlay,
    sharedMeshResources: Math.max(0, meshStats.references - meshStats.resources),
    sharedMaterialResources: Math.max(0, materialStats.references - materialStats.resources),
    sharedResourceCount: Math.max(0, meshStats.references - meshStats.resources)
      + Math.max(0, materialStats.references - materialStats.resources),
    materialResources: materialStats.resources,
    materialReferences: materialStats.references,
  });
}

export function createPlayCanvasPrebuiltMeshRenderer({
  pc,
  app,
  registry,
  root = app?.root,
  createMaterial = null,
  materialProfiles = DEFAULT_MATERIAL_PROFILES,
} = {}) {
  assertPlayCanvas(pc, app);
  if (!registry) throw new TypeError("Alumbra prebuilt renderer requires a block registry");
  if (!root || typeof root.addChild !== "function") {
    throw new TypeError("Prebuilt renderer root must be a PlayCanvas graph node");
  }

  const profileRegistry = materialProfiles?.get
    ? materialProfiles
    : createMaterialProfileRegistry(materialProfiles);
  const records = new Map();
  let shape = null;
  let destroyed = false;

  const meshPool = createReferencePool({
    keyOf: meshGroupSignature,
    create: (group) => createMesh(pc, app.graphicsDevice, group),
    destroy: (mesh) => mesh.destroy?.(),
  });
  const materialPool = createReferencePool({
    keyOf: (descriptor) => descriptor.resourceKey,
    create: (descriptor) => (createMaterial
      ? createMaterial({
        pc,
        app,
        registry,
        material: descriptor.material,
        profile: profileRegistry.get(descriptor.profileId),
        descriptor,
      })
      : createProfileMaterial(pc, descriptor)),
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

      // Resolve every material profile before allocating a mesh, material or entity.
      // An unknown profile therefore fails closed with no partial GPU allocation.
      const preparedGroups = prebuilt.groups.map((group) => Object.freeze({
        group,
        descriptor: describeMaterialGroup({
          profiles: profileRegistry,
          blockRegistry: registry,
          material: group.material,
          group,
        }),
      }));

      const resources = [];
      const meshInstances = [];
      try {
        for (const prepared of preparedGroups) {
          const meshResource = meshPool.acquire(prepared.group);
          const materialResource = materialPool.acquire(prepared.descriptor);
          resources.push({
            meshKey: meshResource.key,
            materialKey: materialResource.key,
            profileId: prepared.descriptor.profileId,
            pass: prepared.descriptor.pass,
          });
          const instance = new pc.MeshInstance(meshResource.value, materialResource.value);
          instance.castShadow = prepared.descriptor.pass !== "overlay";
          instance.receiveShadow = prepared.descriptor.pass !== "overlay";
          if (Number.isFinite(Number(prepared.descriptor.priority))) {
            instance.drawOrder = prepared.descriptor.priority;
          }
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
    materialEvidence() {
      return materialEvidence(records, meshPool, materialPool);
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
