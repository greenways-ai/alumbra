import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createChunk } from "@greenways/alumbra-core/chunks";
import { parseEdn } from "../../../scripts/lib/edn.mjs";
import {
  MESH_LIGHT_SNAPSHOT_FORMAT,
  createMeshLightingContext,
} from "../src/mesh-light.js";
import {
  buildChunkMesh,
  createChunkWorldAccessor,
  meshGroupSignature,
} from "../src/mesh.js";
import { createLocalMeshWorker } from "../src/mesh-worker.js";
import { createTestRegistry, solidChunk } from "./fixtures.js";

const packageRoot = new URL("../", import.meta.url);
const readEdn = async (relative) =>
  parseEdn(await readFile(new URL(relative, packageRoot), "utf8"));

const bytes = (chunk, value) => {
  if (value instanceof Uint8Array) return value;
  const output = new Uint8Array(chunk.volume);
  if (Array.isArray(value)) output.set(value);
  else output.fill(value);
  return output;
};

const snapshot = (chunk, {
  profileId = "alumbra/lighting-default",
  generation = 3,
  epoch = 2,
  maximum = 15,
  sunlight = 0,
  emitted = 0,
  sourceRevision = chunk.revision,
} = {}) => ({
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId,
  generation,
  epoch,
  maxLevel: maximum,
  key: chunk.key,
  coord: chunk.coord,
  shape: chunk.shape,
  sourceRevision,
  sunlight: bytes(chunk, sunlight),
  emitted: bytes(chunk, emitted),
});

const sortedUnique = (values) => [...new Set(values)].sort((left, right) => left - right);

test("light-aware meshing Showcase derives merge, attribute and signature evidence", async () => {
  const state = await readEdn("showcase/states/light-aware-meshing.edn");
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, {
    coord: state.target.coord,
    shape: state.target.shape,
    revision: state.target.revision,
  });

  const equal = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, {
      generation: state.target.generation,
      epoch: state.target.epoch,
      maximum: state.target.maximum,
      sunlight: state["equal-light"].sunlight,
      emitted: state["equal-light"].emitted,
    })],
  });
  const split = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, {
      generation: state.target.generation,
      epoch: state.target.epoch,
      maximum: state.target.maximum,
      sunlight: state["split-light"].sunlight,
      emitted: state["split-light"].emitted,
    })],
  });

  assert.equal(equal.quadCount, state["equal-light"]["quad-count"]);
  assert.equal(equal.groups[0].vertexCount, state["equal-light"]["vertex-count"]);
  assert.deepEqual(
    sortedUnique(equal.groups[0].sunlight),
    state["equal-light"]["unique-sunlight"],
  );
  assert.deepEqual(
    sortedUnique(equal.groups[0].emitted),
    state["equal-light"]["unique-emitted"],
  );
  assert.equal(split.quadCount, state["split-light"]["quad-count"]);
  assert.equal(split.groups[0].vertexCount, state["split-light"]["vertex-count"]);
  assert.deepEqual(
    sortedUnique(split.groups[0].sunlight),
    state["split-light"]["unique-sunlight"],
  );
  assert.deepEqual(
    sortedUnique(split.groups[0].emitted),
    state["split-light"]["unique-emitted"],
  );
  assert.equal(equal.groups[0].sunlight.length === equal.groups[0].vertexCount, true);
  assert.equal(equal.groups[0].emitted.length === equal.groups[0].vertexCount, true);
  assert.equal(
    meshGroupSignature(equal.groups[0]) !== meshGroupSignature(split.groups[0]),
    state.attributes["signature-changes"],
  );

  const repeated = buildChunkMesh({
    chunk,
    registry,
    lightSnapshots: [snapshot(chunk, {
      generation: state.target.generation,
      epoch: state.target.epoch,
      maximum: state.target.maximum,
      sunlight: state["split-light"].sunlight,
      emitted: state["split-light"].emitted,
    })],
  });
  assert.equal(
    JSON.stringify({
      quads: split.groups[0].quads,
      sunlight: [...split.groups[0].sunlight],
      emitted: [...split.groups[0].emitted],
    }) === JSON.stringify({
      quads: repeated.groups[0].quads,
      sunlight: [...repeated.groups[0].sunlight],
      emitted: [...repeated.groups[0].emitted],
    }),
    state.attributes["repeat-deterministic"],
  );
  assert.equal(state["projection-boundary"]["engine-runtime-imported"], false);
  assert.equal(state["projection-boundary"]["playcanvas-vertex-colour-projected"], false);
  assert.equal(state["projection-boundary"]["smooth-lighting"], false);
});

test("light-field handoff Showcase derives cardinal sampling and exact identity fences", async () => {
  const state = await readEdn("showcase/states/light-field-handoff.edn");
  const registry = createTestRegistry();
  const target = solidChunk(registry, {
    coord: state.target.coord,
    shape: state.target.shape,
    revision: state.target.revision,
  });
  const neighbor = createChunk({
    registry,
    coord: state["cardinal-neighbour"].coord,
    shape: state.target.shape,
    revision: state["cardinal-neighbour"].revision,
  });
  const accessor = createChunkWorldAccessor(new Map([
    [target.key, target],
    [neighbor.key, neighbor],
  ]), registry);
  const snapshots = [
    snapshot(neighbor, {
      generation: state.evidence.generation,
      epoch: state.evidence.epoch,
      maximum: state.evidence.maximum,
      sunlight: 13,
      emitted: 4,
    }),
    snapshot(target, {
      generation: state.evidence.generation,
      epoch: state.evidence.epoch,
      maximum: state.evidence.maximum,
      sunlight: 2,
      emitted: 1,
    }),
  ];
  const context = createMeshLightingContext({ chunk: target, snapshots });
  const mesh = buildChunkMesh({
    chunk: target,
    registry,
    getBlockAtWorld: accessor.getBlock,
    lightSnapshots: snapshots,
  });

  for (const sample of state["face-samples"]) {
    const quad = mesh.groups[0].quads.find((entry) => entry.face === sample.face);
    assert.ok(quad, `missing ${sample.face} quad`);
    assert.equal(quad.sunlight, sample.sunlight);
    assert.equal(quad.emitted, sample.emitted);
  }
  assert.deepEqual(
    context.evidence().sourceFields.map((entry) => entry.key),
    state.evidence["ordered-field-keys"],
  );
  assert.equal(context.evidence().profileId, state.evidence["profile-id"]);
  assert.equal(context.evidence().generation, state.evidence.generation);
  assert.equal(context.evidence().epoch, state.evidence.epoch);

  const staleTarget = solidChunk(registry, { shape: [1, 1, 1], revision: 4 });
  const distant = createChunk({ registry, coord: [2, 0, 0], shape: [1, 1, 1], revision: 4 });
  const cardinal = createChunk({ registry, coord: [1, 0, 0], shape: [1, 1, 1], revision: 4 });
  const rejection = Object.fromEntries(state.rejections.map((entry) => [entry.case, entry]));
  assert.throws(
    () => createMeshLightingContext({
      chunk: staleTarget,
      snapshots: [snapshot(staleTarget, { sourceRevision: 3 })],
    }),
    (error) => error.code === rejection["stale-target-revision"]["error-code"],
  );
  assert.throws(
    () => createMeshLightingContext({
      chunk: staleTarget,
      snapshots: [snapshot(staleTarget), snapshot(distant)],
    }),
    (error) => error.code === rejection["non-cardinal-neighbour"]["error-code"],
  );
  assert.throws(
    () => createMeshLightingContext({
      chunk: staleTarget,
      snapshots: [snapshot(staleTarget), snapshot(cardinal, { generation: 4 })],
    }),
    (error) => error.code === rejection["lighting-identity-drift"]["error-code"],
  );

  assert.equal(state["authority-boundary"]["snapshots-cloneable"], true);
  assert.equal(state["authority-boundary"]["engine-runtime-present"], false);
  assert.equal(state["authority-boundary"]["playcanvas-object-present"], false);
});

test("light-field handoff Showcase derives worker evidence and unlit compatibility", async () => {
  const state = await readEdn("showcase/states/light-field-handoff.edn");
  const registry = createTestRegistry();
  const chunk = solidChunk(registry, { shape: [2, 2, 2], revision: 3 });
  const exact = createLocalMeshWorker({
    buildMesh: ({ chunk: current, lightSnapshots }) => buildChunkMesh({
      chunk: current,
      registry,
      lightSnapshots,
    }),
  });
  const exactResult = await exact.submit({
    id: "showcase/light-exact",
    chunkKey: chunk.key,
    revision: chunk.revision,
    chunk,
    lightSnapshots: [snapshot(chunk, {
      generation: state.evidence.generation,
      epoch: state.evidence.epoch,
      sunlight: 9,
      emitted: 2,
    })],
  });
  assert.equal(
    JSON.stringify(exactResult.lighting) === JSON.stringify(exactResult.mesh.lighting),
    state.evidence["exact-worker-result"],
  );
  await exact.destroy();

  const substituted = createLocalMeshWorker({
    buildMesh: ({ chunk: current, lightSnapshots }) => {
      const mesh = buildChunkMesh({ chunk: current, registry, lightSnapshots });
      return {
        ...mesh,
        lighting: {
          ...mesh.lighting,
          generation: mesh.lighting.generation + 1,
        },
      };
    },
  });
  await assert.rejects(
    substituted.submit({
      id: "showcase/light-substituted",
      chunkKey: chunk.key,
      revision: chunk.revision,
      chunk,
      lightSnapshots: [snapshot(chunk)],
    }),
    /light-field evidence does not match/,
  );
  const substitutedState = state.rejections.find(
    (entry) => entry.case === "substituted-worker-evidence",
  );
  assert.equal(substituted.stats().failed, substitutedState["failed-job-count"]);
  assert.equal(substitutedState.accepted, false);
  await substituted.destroy();

  let requestKeys = null;
  const unlit = createLocalMeshWorker({
    buildMesh: (request) => {
      requestKeys = Object.keys(request).sort();
      return buildChunkMesh({ chunk: request.chunk, registry });
    },
  });
  const unlitResult = await unlit.submit({
    id: "showcase/unlit",
    chunkKey: chunk.key,
    revision: chunk.revision,
    chunk,
  });
  assert.deepEqual(requestKeys, ["chunk", "chunkKey", "context", "revision", "signal"]);
  assert.equal(
    Object.hasOwn(unlitResult, "lighting"),
    !state["backward-compatibility"]["unlit-result-lighting-omitted"],
  );
  assert.equal(state["backward-compatibility"]["unlit-request-shape-preserved"], true);
  await unlit.destroy();
});
