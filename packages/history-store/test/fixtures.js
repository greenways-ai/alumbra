import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";

export const world = {
  id: "world:history-store-fixture",
  version: "0.1.0",
};

export const pins = {
  generator: {
    package: "hara:greenways/alumbra-hara",
    version: "0.1.0",
    id: "alumbra/fixture-height-field",
    seed: "17",
  },
};

export function registry() {
  return createBlockRegistry([
    { id: "alumbra/air", empty: true, metadata: { render: { visible: false, opaque: false } } },
    { id: "alumbra/stone", metadata: { render: { color: [0.45, 0.48, 0.54], opaque: true } } },
    { id: "alumbra/soil", metadata: { render: { color: [0.42, 0.27, 0.16], opaque: true } } },
  ], { id: "alumbra/history-store-fixture", version: "0.1.0" });
}

export function chunks(blockRegistry) {
  return [[-1, 0, 0], [0, 0, 0], [8, 0, 0]].map((coord) => {
    let chunk = createChunk({ registry: blockRegistry, coord, shape: [2, 2, 2] });
    chunk = patchChunk(chunk, [
      { local: [0, 0, 0], value: "alumbra/stone" },
      { local: [1, 0, 1], value: "alumbra/soil" },
    ], blockRegistry);
    return chunk;
  });
}

export function change(values) {
  const chunk = values.find((entry) => entry.key === "0,0,0");
  return {
    id: "history-store/change-1",
    expectedRevisions: [{ chunk: chunk.coord, revision: chunk.revision }],
    changes: [{
      chunk: chunk.coord,
      local: [0, 0, 0],
      before: "alumbra/stone",
      after: "alumbra/soil",
    }],
  };
}
