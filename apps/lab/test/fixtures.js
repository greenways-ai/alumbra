import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import {createWorldRuntime} from "@greenways/alumbra-engine";

export const GENERATOR = Object.freeze({
  package: "hara:greenways/alumbra-lab",
  version: "0.1.0",
  id: "alumbra/lab-terrain",
  seed: "lab-seed-1",
});

export function createRegistry() {
  return createBlockRegistry([
    {id: "alumbra/air", empty: true, metadata: {physics: {solid: false, replaceable: true}, render: {visible: false}}},
    {id: "alumbra/basalt", metadata: {physics: {solid: true, breakable: true}, render: {color: [0.2,0.2,0.2]}}},
    {id: "alumbra/loam", metadata: {physics: {solid: true, breakable: true}, render: {color: [0.4,0.3,0.2]}}},
  ], {id: "alumbra/lab-blocks", version: "0.1.0"});
}

export function createWorld() {
  const registry = createRegistry();
  let chunk = createChunk({registry, coord: [0,0,0], shape: [8,8,8]});
  const updates = [];
  for (let z = 0; z < 8; z += 1) for (let x = 0; x < 8; x += 1) {
    updates.push({local: [x,0,z], value: "alumbra/basalt"});
  }
  updates.push({local: [2,1,2], value: "alumbra/loam"});
  chunk = patchChunk(chunk, updates, registry, {revision: 1});
  const world = createWorldRuntime({
    registry,
    chunks: [chunk],
    missingChunkPolicy: "solid",
    worldId: "world:alumbra/lab",
  });
  return {registry, world};
}
