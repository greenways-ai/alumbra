import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import {
  LIGHT_FIELD_SET_FORMAT,
  buildVoxelLightFields,
  normalizeLightingProfile,
} from "../src/lighting.js";

const createRegistry = () => createBlockRegistry([
  {
    id: "lighting/air",
    empty: true,
    metadata: {
      physics: { solid: false },
      render: { visible: false, opaque: false },
    },
  },
  {
    id: "lighting/stone",
    metadata: {
      physics: { solid: true },
      render: { opaque: true },
    },
  },
  {
    id: "lighting/glass",
    metadata: {
      physics: { solid: true },
      render: { opaque: false },
      light: { opacity: 1 },
    },
  },
  {
    id: "lighting/lamp",
    metadata: {
      physics: { solid: true },
      render: { opaque: true },
      emittedLight: 15,
    },
  },
], {
  id: "lighting/test-registry",
  version: "0.1.0",
});

const airChunk = (registry, coord, shape = [4, 4, 4]) => createChunk({
  registry,
  coord,
  shape,
  fill: "lighting/air",
});

test("lighting profiles are closed and bounded", () => {
  assert.deepEqual(normalizeLightingProfile(), {
    format: "alumbra.lighting-profile/1",
    id: "alumbra/lighting-default",
    maxLevel: 15,
    sunlightAttenuation: 1,
    emittedAttenuation: 1,
    missingNeighborPolicy: "opaque",
  });
  assert.throws(
    () => normalizeLightingProfile({ unknown: true }),
    (error) => error.code === "lighting/field",
  );
  assert.throws(
    () => normalizeLightingProfile({ sunlightAttenuation: 0 }),
    (error) => error.code === "lighting/integer",
  );
  assert.throws(
    () => normalizeLightingProfile({ missingNeighborPolicy: "ambient" }),
    (error) => error.code === "lighting/missing-neighbor-policy",
  );
});

test("sunlight seeds the loaded sky boundary and attenuates vertically", () => {
  const registry = createRegistry();
  const chunk = airChunk(registry, [0, 0, 0]);
  const result = buildVoxelLightFields({ registry, chunks: [chunk] });
  const field = result.getField([0, 0, 0]);

  assert.equal(result.format, LIGHT_FIELD_SET_FORMAT);
  assert.equal(field.sunlightAt([0, 3, 0]), 15);
  assert.equal(field.sunlightAt([0, 2, 0]), 14);
  assert.equal(field.sunlightAt([0, 1, 0]), 13);
  assert.equal(field.sunlightAt([0, 0, 0]), 12);
  assert.equal(field.emittedAt([0, 0, 0]), 0);
  assert.deepEqual(field.sample([0, 0, 0]), {
    local: [0, 0, 0],
    sunlight: 12,
    emitted: 0,
    level: 12,
  });

  const copy = field.copySunlight();
  copy[0] = 0;
  assert.equal(field.sunlightAt([0, 0, 0]), 12);
  assert.equal(result.evidence().sunlitVoxels, chunk.volume);
});

test("sunlight crosses loaded vertical chunks and treats missing segments explicitly", () => {
  const registry = createRegistry();
  const lower = airChunk(registry, [0, 0, 0]);
  const upper = airChunk(registry, [0, 1, 0]);
  const contiguous = buildVoxelLightFields({ registry, chunks: [upper, lower] });

  assert.equal(contiguous.getField([0, 1, 0]).sunlightAt([0, 3, 0]), 15);
  assert.equal(contiguous.getField([0, 0, 0]).sunlightAt([0, 3, 0]), 11);

  const separated = airChunk(registry, [0, 2, 0]);
  const opaqueGap = buildVoxelLightFields({ registry, chunks: [lower, separated] });
  assert.equal(opaqueGap.getField([0, 0, 0]).sunlightAt([0, 3, 0]), 0);

  const openGap = buildVoxelLightFields({
    registry,
    chunks: [lower, separated],
    profile: { missingNeighborPolicy: "open" },
  });
  assert.equal(openGap.getField([0, 0, 0]).sunlightAt([0, 3, 0]), 15);
});

test("emitted light propagates deterministically across negative chunk coordinates", () => {
  const registry = createRegistry();
  const leftBase = airChunk(registry, [-1, 0, 0]);
  const left = patchChunk(leftBase, [{
    local: [3, 1, 1],
    value: "lighting/lamp",
  }], registry, { revision: 1 });
  const right = airChunk(registry, [0, 0, 0]);

  const first = buildVoxelLightFields({ registry, chunks: [right, left] });
  const second = buildVoxelLightFields({ registry, chunks: [left, right] });

  assert.equal(first.getField([-1, 0, 0]).emittedAt([3, 1, 1]), 15);
  assert.equal(first.getField([0, 0, 0]).emittedAt([0, 1, 1]), 14);
  assert.deepEqual(
    [...first.getField([-1, 0, 0]).copyEmitted()],
    [...second.getField([-1, 0, 0]).copyEmitted()],
  );
  assert.deepEqual(
    [...first.getField([0, 0, 0]).copyEmitted()],
    [...second.getField([0, 0, 0]).copyEmitted()],
  );
  assert.deepEqual(first.keys(), ["-1,0,0", "0,0,0"]);
});

test("an opaque voxel plane blocks emitted-light propagation", () => {
  const registry = createRegistry();
  const shape = [5, 5, 5];
  const base = airChunk(registry, [0, 0, 0], shape);
  const updates = [{ local: [1, 2, 2], value: "lighting/lamp" }];
  for (let y = 0; y < shape[1]; y += 1) {
    for (let z = 0; z < shape[2]; z += 1) {
      updates.push({ local: [2, y, z], value: "lighting/stone" });
    }
  }
  const chunk = patchChunk(base, updates, registry, { revision: 1 });
  const result = buildVoxelLightFields({ registry, chunks: [chunk] });
  const field = result.getField(chunk.key);

  assert.equal(field.emittedAt([1, 2, 2]), 15);
  assert.equal(field.emittedAt([2, 2, 2]), 0);
  assert.equal(field.emittedAt([3, 2, 2]), 0);
});

test("malformed block light metadata fails before a field is returned", () => {
  const registry = createBlockRegistry([
    {
      id: "lighting/bad-air",
      empty: true,
      metadata: { render: { opaque: false }, emittedLight: 16 },
    },
  ], { id: "lighting/bad-registry", version: "0.1.0" });
  const chunk = createChunk({ registry, shape: [1, 1, 1] });
  assert.throws(
    () => buildVoxelLightFields({ registry, chunks: [chunk] }),
    (error) => error.code === "lighting/block-level",
  );
});
