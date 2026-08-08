import assert from "node:assert/strict";
import test from "node:test";
import {
  digestChunkSnapshot,
  localToIndex,
} from "@greenways/alumbra-core";
import {
  createFlatFixturePlan,
  createHeightFieldFixturePlan,
  integerFixtureHeight,
  materializeGeneratedChunk,
  normalizeGeneratedChunkPlan,
} from "../src/index.js";
import { fixtureRegistry, flatGenerator, heightGenerator } from "./fixtures.js";

const blockAt = (chunk, local) => chunk.palette[chunk.indices[localToIndex(local, chunk.shape)]];

test("flat fixture materializes deterministic chunks across negative coordinates", async () => {
  const registry = fixtureRegistry();
  const generator = flatGenerator();
  const plan = createFlatFixturePlan({
    generator,
    coord:[-2, 0, -1],
    shape:[8, 8, 8],
    base:"alumbra/air",
    block:"alumbra/fixture-stone",
    surface:3,
  }, registry);
  const first = materializeGeneratedChunk(plan, registry, {expectedGenerator:generator});
  const second = materializeGeneratedChunk(plan, registry, {expectedGenerator:generator});
  assert.equal(await digestChunkSnapshot(first), await digestChunkSnapshot(second));
  assert.equal(blockAt(first, [0, 3, 0]).id, "alumbra/fixture-stone");
  assert.equal(blockAt(first, [0, 4, 0]).id, "alumbra/air");
});

test("integer height-field fixture is deterministic and uses explicit surface overrides", async () => {
  const registry = fixtureRegistry();
  const generator = heightGenerator();
  const options = {
    generator,
    coord:[-1, 0, 1],
    shape:[8, 8, 8],
    base:"alumbra/air",
    fill:"alumbra/fixture-soil",
    surfaceBlock:"alumbra/fixture-grass",
    seed:17,
    minimum:1,
    span:5,
  };
  const plan = createHeightFieldFixturePlan(options, registry);
  const chunk = materializeGeneratedChunk(plan, registry);
  const worldX = -8;
  const worldZ = 8;
  const height = integerFixtureHeight(worldX, worldZ, {seed:17, minimum:1, span:5});
  assert.equal(blockAt(chunk, [0, height, 0]).id, "alumbra/fixture-grass");
  if (height > 0) assert.equal(blockAt(chunk, [0, height - 1, 0]).id, "alumbra/fixture-soil");
  const again = materializeGeneratedChunk(createHeightFieldFixturePlan(options, registry), registry);
  assert.equal(await digestChunkSnapshot(chunk), await digestChunkSnapshot(again));
});

test("generated plans reject overlap, duplicate overrides, bounds and unknown blocks", () => {
  const registry = fixtureRegistry();
  const generator = flatGenerator();
  const base = {
    format:"alumbra.generated-chunk/1",
    generator,
    coord:[0, 0, 0],
    shape:[4, 4, 4],
    revision:0,
    base:"alumbra/air",
    overrides:[],
  };
  assert.throws(() => normalizeGeneratedChunkPlan({
    ...base,
    regions:[
      {from:[0, 0, 0], to:[3, 2, 3], block:"alumbra/fixture-stone"},
      {from:[2, 1, 2], to:[4, 3, 4], block:"alumbra/fixture-soil"},
    ],
  }, registry), /overlap/i);
  assert.throws(() => normalizeGeneratedChunkPlan({
    ...base,
    regions:[],
    overrides:[
      {local:[1, 1, 1], block:"alumbra/fixture-stone"},
      {local:[1, 1, 1], block:"alumbra/fixture-soil"},
    ],
  }, registry), /duplicate targets/i);
  assert.throws(() => normalizeGeneratedChunkPlan({
    ...base,
    regions:[{from:[0, 0, 0], to:[5, 1, 1], block:"alumbra/fixture-stone"}],
  }, registry), /outside the chunk/i);
  assert.throws(() => normalizeGeneratedChunkPlan({
    ...base,
    regions:[{from:[0, 0, 0], to:[1, 1, 1], block:"alumbra/missing"}],
  }, registry), /unknown/i);
});

test("plan expectations reject generator, coordinate and shape mismatches", () => {
  const registry = fixtureRegistry();
  const generator = flatGenerator();
  const plan = createFlatFixturePlan({
    generator,
    coord:[0, 0, 0],
    shape:[4, 4, 4],
    base:"alumbra/air",
    block:"alumbra/fixture-stone",
    surface:1,
  }, registry);
  assert.throws(() => materializeGeneratedChunk(plan, registry, {
    expectedCoord:[1, 0, 0],
  }), /expected coordinate/i);
  assert.throws(() => materializeGeneratedChunk(plan, registry, {
    expectedShape:[8, 8, 8],
  }), /expected shape/i);
});
