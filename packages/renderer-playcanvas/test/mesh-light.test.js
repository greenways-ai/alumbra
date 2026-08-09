import assert from "node:assert/strict";
import test from "node:test";
import { createChunk } from "@greenways/alumbra-core/chunks";
import {
  MESH_LIGHT_SNAPSHOT_FORMAT,
  MESH_LIGHTING_FORMAT,
  createMeshLightingContext,
  normalizeMeshLightingEvidence,
} from "../src/mesh-light.js";
import { createTestRegistry } from "./fixtures.js";

const lightBytes = (chunk, value) => {
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
  maxLevel = 15,
  sunlight = 0,
  emitted = 0,
  sourceRevision = chunk.revision,
} = {}) => ({
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId,
  generation,
  epoch,
  maxLevel,
  key: chunk.key,
  coord: chunk.coord,
  shape: chunk.shape,
  sourceRevision,
  sunlight: lightBytes(chunk, sunlight),
  emitted: lightBytes(chunk, emitted),
});

test("mesh lighting context copies cardinal snapshots and samples negative world coordinates", () => {
  const registry = createTestRegistry();
  const left = createChunk({ registry, coord: [-1, 0, 0], shape: [2, 1, 1] });
  const right = createChunk({ registry, coord: [0, 0, 0], shape: [2, 1, 1] });
  const leftSunlight = Uint8Array.of(3, 4);
  const context = createMeshLightingContext({
    chunk: left,
    snapshots: [
      snapshot(right, { sunlight: [12, 13], emitted: [1, 2] }),
      snapshot(left, { sunlight: leftSunlight, emitted: [5, 6] }),
    ],
  });

  leftSunlight[0] = 0;
  assert.deepEqual(context.sample([-2, 0, 0]), {
    world: [-2, 0, 0],
    chunk: [-1, 0, 0],
    local: [0, 0, 0],
    sunlight: 3,
    emitted: 5,
    level: 5,
  });
  assert.equal(context.sample([0, 0, 0]).sunlight, 12);
  assert.equal(context.sample([2, 0, 0]), null);

  const evidence = context.evidence();
  assert.equal(evidence.format, MESH_LIGHTING_FORMAT);
  assert.deepEqual(evidence.sourceFields.map((entry) => entry.key), ["-1,0,0", "0,0,0"]);
  assert.deepEqual(normalizeMeshLightingEvidence(evidence, { chunk: left }), evidence);

  const copies = context.snapshots();
  copies[0].sunlight[0] = 0;
  assert.equal(context.sample([-2, 0, 0]).sunlight, 3);
});

test("mesh lighting context rejects stale targets, non-cardinal fields and identity drift", () => {
  const registry = createTestRegistry();
  const target = createChunk({ registry, coord: [0, 0, 0], shape: [2, 2, 2], revision: 4 });
  const distant = createChunk({ registry, coord: [2, 0, 0], shape: [2, 2, 2], revision: 4 });

  assert.throws(
    () => createMeshLightingContext({
      chunk: target,
      snapshots: [snapshot(target, { sourceRevision: 3 })],
    }),
    (error) => error.code === "mesh-light/target-revision",
  );
  assert.throws(
    () => createMeshLightingContext({
      chunk: target,
      snapshots: [snapshot(target), snapshot(distant)],
    }),
    (error) => error.code === "mesh-light/neighbour",
  );
  const neighbor = createChunk({ registry, coord: [1, 0, 0], shape: [2, 2, 2], revision: 4 });
  assert.throws(
    () => createMeshLightingContext({
      chunk: target,
      snapshots: [snapshot(target), snapshot(neighbor, { generation: 5 })],
    }),
    (error) => error.code === "mesh-light/identity",
  );
});

test("mesh light snapshot levels and closed fields fail before meshing", () => {
  const registry = createTestRegistry();
  const target = createChunk({ registry, shape: [1, 1, 1] });
  assert.throws(
    () => createMeshLightingContext({
      chunk: target,
      snapshots: [snapshot(target, { sunlight: Uint8Array.of(16) })],
    }),
    (error) => error.code === "mesh-light/level",
  );
  assert.throws(
    () => createMeshLightingContext({
      chunk: target,
      snapshots: [{ ...snapshot(target), authority: "engine" }],
    }),
    (error) => error.code === "mesh-light/field",
  );
});
