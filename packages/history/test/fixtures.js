import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";

export function createHistoryRegistry({
  id = "alumbra/history-fixture",
  version = "0.1.0",
} = {}) {
  return createBlockRegistry([
    {
      id: "alumbra/air",
      empty: true,
      metadata: { render: { visible: false, opaque: false } },
    },
    {
      id: "alumbra/stone",
      metadata: { render: { color: [0.45, 0.48, 0.54], opaque: true } },
    },
    {
      id: "alumbra/soil",
      metadata: { render: { color: [0.42, 0.27, 0.16], opaque: true } },
    },
  ], { id, version });
}

export function historyChunks(registry) {
  const chunks = [];
  for (const coord of [[-9, 0, -1], [-1, 0, 0], [0, 0, 0], [8, 0, 1]]) {
    let chunk = createChunk({
      registry,
      coord,
      shape: [2, 2, 2],
      fill: "alumbra/air",
    });
    chunk = patchChunk(chunk, [
      { local: [0, 0, 0], value: "alumbra/stone" },
      { local: [1, 0, 1], value: "alumbra/soil" },
    ], registry);
    chunks.push(chunk);
  }
  return chunks;
}

export function firstChange(chunks) {
  const chunk = chunks.find((value) => value.key === "0,0,0");
  return {
    id: "history/change-1",
    expectedRevisions: [{ chunk: chunk.coord, revision: chunk.revision }],
    changes: [{
      chunk: chunk.coord,
      local: [0, 0, 0],
      before: "alumbra/stone",
      after: "alumbra/soil",
    }],
    metadata: { reason: "fixture" },
  };
}
