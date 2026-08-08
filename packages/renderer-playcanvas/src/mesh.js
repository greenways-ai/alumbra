import { blockValueKey, normalizeBlockValue } from "@greenways/alumbra-core/blocks";
import { getBlock } from "@greenways/alumbra-core/chunks";
import {
  chunkKey,
  normalizeChunkShape,
  worldToChunk,
} from "@greenways/alumbra-core/coordinates";

export const CHUNK_MESH_FORMAT = "alumbra.chunk-mesh/1";

const FACE_DEFINITIONS = Object.freeze([
  Object.freeze({ name: "east", axis: 0, sign: 1, uAxis: 1, vAxis: 2, normal: Object.freeze([1, 0, 0]) }),
  Object.freeze({ name: "west", axis: 0, sign: -1, uAxis: 2, vAxis: 1, normal: Object.freeze([-1, 0, 0]) }),
  Object.freeze({ name: "up", axis: 1, sign: 1, uAxis: 2, vAxis: 0, normal: Object.freeze([0, 1, 0]) }),
  Object.freeze({ name: "down", axis: 1, sign: -1, uAxis: 0, vAxis: 2, normal: Object.freeze([0, -1, 0]) }),
  Object.freeze({ name: "south", axis: 2, sign: 1, uAxis: 0, vAxis: 1, normal: Object.freeze([0, 0, 1]) }),
  Object.freeze({ name: "north", axis: 2, sign: -1, uAxis: 1, vAxis: 0, normal: Object.freeze([0, 0, -1]) }),
]);

const finiteColor = (value, fallback) => {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return value.slice(0, 4).map((entry, index) => {
    const fallbackValue = index === 3 ? 1 : fallback[index];
    return Number.isFinite(Number(entry)) ? Math.max(0, Math.min(1, Number(entry))) : fallbackValue;
  });
};

export function defaultBlockAppearance(registry, block) {
  const definition = registry.get(block.id);
  const render = definition.metadata?.render && typeof definition.metadata.render === "object"
    ? definition.metadata.render
    : {};
  const visible = !definition.empty && render.visible !== false;
  const opaque = visible && render.opaque !== false;
  const material = String(render.material || block.id);
  const tile = Array.isArray(render.tile) && render.tile.length === 2
    ? render.tile.map((entry) => Number.isSafeInteger(entry) ? entry : 0)
    : [0, 0];
  const color = finiteColor(render.color, [0.62, 0.67, 0.72, 1]);
  return Object.freeze({
    visible,
    opaque,
    material,
    tile: Object.freeze(tile),
    color: Object.freeze(color),
    mergeKey: `${material}|${tile.join(",")}|${blockValueKey(block)}`,
  });
}

export function createChunkWorldAccessor(chunks, registry, { shape = null } = {}) {
  const records = chunks instanceof Map
    ? chunks
    : new Map(Array.from(chunks ?? [], (chunk) => [chunk.key ?? chunkKey(chunk.coord), chunk]));
  const chunkShape = normalizeChunkShape(shape ?? records.values().next().value?.shape ?? [32, 32, 32]);
  const empty = normalizeBlockValue(registry, registry.emptyBlock);

  return Object.freeze({
    shape: chunkShape,
    getChunk(coord) {
      return records.get(chunkKey(coord)) ?? null;
    },
    getBlock(world) {
      const location = worldToChunk(world, chunkShape);
      const chunk = records.get(chunkKey(location.chunk));
      return chunk ? getBlock(chunk, location.local) : empty;
    },
  });
}

function inside(local, shape) {
  return local[0] >= 0 && local[0] < shape[0]
    && local[1] >= 0 && local[1] < shape[1]
    && local[2] >= 0 && local[2] < shape[2];
}

function worldCoordinate(chunk, local) {
  return Object.freeze(local.map((entry, axis) => chunk.coord[axis] * chunk.shape[axis] + entry));
}

function shouldRenderFace(current, neighbor) {
  if (!current.visible) return false;
  if (!neighbor.visible) return true;
  if (neighbor.opaque) return false;
  return current.opaque || current.mergeKey !== neighbor.mergeKey;
}

function groupFor(groups, appearance) {
  let group = groups.get(appearance.material);
  if (!group) {
    group = {
      material: appearance.material,
      color: appearance.color,
      positions: [],
      normals: [],
      uvs: [],
      indices: [],
      quads: [],
    };
    groups.set(appearance.material, group);
  }
  return group;
}

function addVector(base, axis, amount) {
  const result = [...base];
  result[axis] += amount;
  return result;
}

function emitQuad(groups, face, slice, u, v, width, height, cell) {
  const group = groupFor(groups, cell.appearance);
  const p0 = [0, 0, 0];
  p0[face.axis] = slice + (face.sign > 0 ? 1 : 0);
  p0[face.uAxis] = u;
  p0[face.vAxis] = v;
  const p1 = addVector(p0, face.uAxis, width);
  const p2 = addVector(p1, face.vAxis, height);
  const p3 = addVector(p0, face.vAxis, height);
  const offset = group.positions.length / 3;

  for (const point of [p0, p1, p2, p3]) group.positions.push(...point);
  for (let index = 0; index < 4; index += 1) group.normals.push(...face.normal);
  group.uvs.push(0, 0, width, 0, width, height, 0, height);
  group.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  group.quads.push(Object.freeze({
    face: face.name,
    normal: face.normal,
    origin: Object.freeze(p0),
    size: Object.freeze([width, height]),
    block: cell.block,
    material: cell.appearance.material,
    tile: cell.appearance.tile,
  }));
}

function sameCell(left, right) {
  return left != null && right != null && left.appearance.mergeKey === right.appearance.mergeKey;
}

function typedIndices(values, vertexCount) {
  return vertexCount <= 0xffff ? Uint16Array.from(values) : Uint32Array.from(values);
}

export function buildChunkMesh({
  chunk,
  registry,
  getBlockAtWorld = null,
  describeBlock = defaultBlockAppearance,
} = {}) {
  if (!chunk || !registry) throw new TypeError("Chunk meshing requires a chunk and block registry");
  const empty = normalizeBlockValue(registry, registry.emptyBlock);
  const appearanceCache = new Map();
  const appearanceFor = (block) => {
    const key = blockValueKey(block);
    if (!appearanceCache.has(key)) appearanceCache.set(key, describeBlock(registry, block));
    return appearanceCache.get(key);
  };
  const blockAt = (local) => {
    if (inside(local, chunk.shape)) return getBlock(chunk, local);
    return getBlockAtWorld ? getBlockAtWorld(worldCoordinate(chunk, local)) : empty;
  };
  const groups = new Map();

  for (const face of FACE_DEFINITIONS) {
    const width = chunk.shape[face.uAxis];
    const height = chunk.shape[face.vAxis];
    const planeSize = width * height;

    for (let slice = 0; slice < chunk.shape[face.axis]; slice += 1) {
      const mask = new Array(planeSize).fill(null);
      for (let v = 0; v < height; v += 1) {
        for (let u = 0; u < width; u += 1) {
          const local = [0, 0, 0];
          local[face.axis] = slice;
          local[face.uAxis] = u;
          local[face.vAxis] = v;
          const block = blockAt(local);
          const neighborLocal = local.map((entry, axis) => entry + face.normal[axis]);
          const neighbor = blockAt(neighborLocal);
          const appearance = appearanceFor(block);
          if (shouldRenderFace(appearance, appearanceFor(neighbor))) {
            mask[u + width * v] = { block, appearance };
          }
        }
      }

      for (let v = 0; v < height; v += 1) {
        for (let u = 0; u < width; u += 1) {
          const index = u + width * v;
          const cell = mask[index];
          if (!cell) continue;

          let runWidth = 1;
          while (u + runWidth < width && sameCell(cell, mask[index + runWidth])) runWidth += 1;

          let runHeight = 1;
          heightLoop: while (v + runHeight < height) {
            const row = (v + runHeight) * width + u;
            for (let offset = 0; offset < runWidth; offset += 1) {
              if (!sameCell(cell, mask[row + offset])) break heightLoop;
            }
            runHeight += 1;
          }

          for (let row = 0; row < runHeight; row += 1) {
            for (let column = 0; column < runWidth; column += 1) {
              mask[(v + row) * width + u + column] = null;
            }
          }
          emitQuad(groups, face, slice, u, v, runWidth, runHeight, cell);
        }
      }
    }
  }

  const outputGroups = [...groups.values()]
    .sort((left, right) => left.material.localeCompare(right.material))
    .map((group) => {
      const vertexCount = group.positions.length / 3;
      return Object.freeze({
        material: group.material,
        color: group.color,
        positions: Float32Array.from(group.positions),
        normals: Float32Array.from(group.normals),
        uvs: Float32Array.from(group.uvs),
        indices: typedIndices(group.indices, vertexCount),
        quads: Object.freeze(group.quads),
        vertexCount,
        triangleCount: group.indices.length / 3,
      });
    });

  return Object.freeze({
    format: CHUNK_MESH_FORMAT,
    coord: chunk.coord,
    chunkKey: chunk.key,
    revision: chunk.revision,
    shape: chunk.shape,
    groups: Object.freeze(outputGroups),
    quadCount: outputGroups.reduce((sum, group) => sum + group.quads.length, 0),
    triangleCount: outputGroups.reduce((sum, group) => sum + group.triangleCount, 0),
  });
}

const hashByte = (state, byte) => Math.imul((state ^ byte) >>> 0, 16777619) >>> 0;

export function meshGroupSignature(group) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(String(group.material ?? ""))) hash = hashByte(hash, byte);
  const scratch = new ArrayBuffer(8);
  const view = new DataView(scratch);
  const visitFloat = (value) => {
    view.setFloat32(0, Number(value), true);
    for (let index = 0; index < 4; index += 1) hash = hashByte(hash, view.getUint8(index));
  };
  const visitIndex = (value) => {
    view.setUint32(0, Number(value), true);
    for (let index = 0; index < 4; index += 1) hash = hashByte(hash, view.getUint8(index));
  };
  for (const value of group.positions) visitFloat(value);
  for (const value of group.normals) visitFloat(value);
  for (const value of group.uvs) visitFloat(value);
  for (const value of group.indices) visitIndex(value);
  return `mesh:${hash.toString(16).padStart(8, "0")}:${group.positions.length}:${group.indices.length}`;
}
