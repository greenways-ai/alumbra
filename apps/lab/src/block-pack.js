import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "../../../packages/core/src/index.js";

export const LAB_WORLD_ID = "world:alumbra/lab";
export const LAB_SAVE_KEY = "alumbra/world/lab-v1";
export const LAB_GENERATOR = Object.freeze({
  package: "hara:greenways/alumbra-lab",
  version: "0.1.0",
  id: "alumbra/lab-terrain",
  seed: "alumbra-lab-2026-08",
});
export const LAB_CHUNK_SHAPE = Object.freeze([16, 16, 16]);
export const LAB_PLAYER_BODY = Object.freeze({radius: 0.34, height: 1.8, eyeHeight: 1.62});
export const LAB_SAFE_SPAWN = Object.freeze({
  position: Object.freeze([3.5, 12, 22.5]),
  velocity: Object.freeze([0, 0, 0]),
  yaw: 8,
  pitch: -18,
  grounded: false,
});

export const LAB_BLOCKS = Object.freeze([
  Object.freeze({id: "alumbra/basalt", label: "Basalt", color: [0.23, 0.27, 0.31], gloss: 0.16}),
  Object.freeze({id: "alumbra/loam", label: "Loam", color: [0.39, 0.29, 0.2], gloss: 0.08}),
  Object.freeze({id: "alumbra/moss", label: "Moss", color: [0.34, 0.48, 0.31], gloss: 0.12}),
  Object.freeze({id: "alumbra/ochre", label: "Ochre", color: [0.67, 0.47, 0.22], gloss: 0.2}),
  Object.freeze({id: "alumbra/crystal-glass", label: "Crystal", color: [0.55, 0.78, 0.83], gloss: 0.72, opaque: false, opacity: 0.38}),
  Object.freeze({id: "alumbra/moonstone", label: "Moonstone", color: [0.72, 0.72, 0.78], gloss: 0.55}),
  Object.freeze({id: "alumbra/ember-brick", label: "Ember Brick", color: [0.62, 0.25, 0.17], gloss: 0.28, emissive: [0.08, 0.018, 0.006]}),
  Object.freeze({id: "alumbra/silverwood", label: "Silverwood", color: [0.58, 0.51, 0.4], gloss: 0.12}),
]);

export function createLabRegistry() {
  return createBlockRegistry([
    {
      id: "alumbra/air",
      empty: true,
      metadata: {
        physics: {solid: false, replaceable: true},
        render: {visible: false, opaque: false},
      },
    },
    ...LAB_BLOCKS.map((block) => ({
      id: block.id,
      metadata: {
        label: block.label,
        physics: {solid: true, breakable: true, replaceable: false},
        render: {
          color: block.color,
          gloss: block.gloss,
          opaque: block.opaque ?? true,
          opacity: block.opacity ?? 1,
          emissive: block.emissive ?? [0, 0, 0],
        },
      },
    })),
  ], {
    id: "alumbra/lab-blocks",
    version: "0.1.0",
  });
}

export const terrainHeight = (worldX, worldZ) => Math.max(2, Math.min(
  8,
  4 + Math.floor(
    Math.sin(worldX * 0.13) * 1.15
    + Math.cos(worldZ * 0.11) * 1.05
    + Math.sin((worldX + worldZ) * 0.047) * 0.8,
  ),
));

export function generateLabChunk(registry, coord) {
  const chunk = createChunk({registry, coord, shape: LAB_CHUNK_SHAPE});
  const updates = [];
  for (let z = 0; z < LAB_CHUNK_SHAPE[2]; z += 1) {
    for (let x = 0; x < LAB_CHUNK_SHAPE[0]; x += 1) {
      const worldX = coord[0] * LAB_CHUNK_SHAPE[0] + x;
      const worldZ = coord[2] * LAB_CHUNK_SHAPE[2] + z;
      const height = terrainHeight(worldX, worldZ);
      for (let y = 0; y <= height; y += 1) {
        const id = y === height
          ? (height <= 3 ? "alumbra/ochre" : "alumbra/moss")
          : y >= height - 2
            ? "alumbra/loam"
            : "alumbra/basalt";
        updates.push({local: [x, y, z], value: id});
      }
    }
  }

  if (coord[0] === 0 && coord[2] === 0) {
    for (let y = 9; y < 14; y += 1) updates.push({local: [8, y, 8], value: "alumbra/crystal-glass"});
    for (let x = 4; x <= 12; x += 1) updates.push({local: [x, 9, 4], value: "alumbra/moonstone"});
    for (let z = 5; z <= 11; z += 1) updates.push({local: [4, 9, z], value: "alumbra/ember-brick"});
    for (let y = 9; y <= 12; y += 1) updates.push({local: [12, y, 12], value: "alumbra/silverwood"});
  }
  return patchChunk(chunk, updates, registry, {revision: 1});
}

export function generateLabChunks(registry) {
  const chunks = [];
  for (let z = -2; z < 2; z += 1) {
    for (let x = -2; x < 2; x += 1) chunks.push(generateLabChunk(registry, [x, 0, z]));
  }
  return Object.freeze(chunks);
}
