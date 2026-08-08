import { createBlockRegistry } from "@greenways/alumbra-core/blocks";
import { createChunk, patchChunk } from "@greenways/alumbra-core/chunks";

export function createTestRegistry() {
  return createBlockRegistry([
    { id: "alumbra/air", empty: true, metadata: { render: { visible: false, opaque: false } } },
    { id: "alumbra/stone", metadata: { render: { color: [0.48, 0.52, 0.58], opaque: true } } },
    { id: "alumbra/soil", metadata: { render: { color: [0.48, 0.31, 0.18], opaque: true } } },
    { id: "alumbra/glass", metadata: { render: { color: [0.65, 0.85, 0.95, 0.45], opaque: false, opacity: 0.45 } } },
  ]);
}

export function solidChunk(registry, {
  coord = [0, 0, 0],
  shape = [1, 1, 1],
  block = "alumbra/stone",
  revision = 0,
} = {}) {
  return createChunk({ registry, coord, shape, fill: block, revision });
}

export function flatChunk(registry, {
  coord = [0, 0, 0],
  shape = [4, 4, 4],
  height = 1,
  block = "alumbra/stone",
} = {}) {
  const chunk = createChunk({ registry, coord, shape });
  const updates = [];
  for (let z = 0; z < shape[2]; z += 1) {
    for (let y = 0; y < Math.min(height, shape[1]); y += 1) {
      for (let x = 0; x < shape[0]; x += 1) updates.push({ local: [x, y, z], value: block });
    }
  }
  return patchChunk(chunk, updates, registry);
}
