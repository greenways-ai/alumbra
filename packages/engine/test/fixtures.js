import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";

export function createTestRegistry() {
  return createBlockRegistry([
    {
      id: "alumbra/air",
      empty: true,
      metadata: {physics: {solid: false, replaceable: true}},
    },
    {
      id: "alumbra/stone",
      metadata: {physics: {solid: true, breakable: true}},
    },
    {
      id: "alumbra/bedrock",
      metadata: {physics: {solid: true, breakable: false}},
    },
    {
      id: "alumbra/grass",
      metadata: {physics: {solid: false, replaceable: true, breakable: true}},
    },
  ], {id: "alumbra/test-blocks", version: "0.1.0"});
}

export function chunkWithBlocks(registry, {
  coord = [0, 0, 0],
  shape = [8, 8, 8],
  blocks = [],
  revision = 0,
} = {}) {
  const chunk = createChunk({registry, coord, shape, revision});
  if (!blocks.length) return chunk;
  return patchChunk(chunk, blocks.map(({local, value}) => ({local, value})), registry, {
    revision,
  });
}

export function collisionWorld({
  floorY = 0,
  walls = [],
  minimum = -8,
  maximum = 8,
} = {}) {
  const solid = new Set();
  for (let z = minimum; z <= maximum; z += 1) {
    for (let x = minimum; x <= maximum; x += 1) solid.add(`${x},${floorY},${z}`);
  }
  for (const voxel of walls) solid.add(voxel.join(","));
  return {
    getBlock: (voxel) => solid.has(voxel.join(",")) ? {id: "alumbra/stone"} : {id: "alumbra/air"},
    isSolid: (block) => block.id === "alumbra/stone",
  };
}
