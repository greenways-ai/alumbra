import assert from "node:assert/strict";
import test from "node:test";
import {
  createLabRegistry,
  generateLabChunks,
  LAB_BLOCKS,
  LAB_GENERATOR,
} from "../src/block-pack.js";

test("lab defines eight original selectable blocks and one empty block", () => {
  const registry = createLabRegistry();
  assert.equal(LAB_BLOCKS.length, 8);
  assert.equal(new Set(LAB_BLOCKS.map((block) => block.id)).size, 8);
  assert.ok(LAB_BLOCKS.every((block) => block.id.startsWith("alumbra/")));
  assert.equal(registry.definitions.length, 9);
  assert.equal(registry.emptyBlock, "alumbra/air");
  assert.ok(LAB_BLOCKS.every((block) => registry.get(block.id).metadata.physics.breakable));
  assert.deepEqual(LAB_GENERATOR, {
    package: "hara:greenways/alumbra-lab",
    version: "0.1.0",
    id: "alumbra/lab-terrain",
    seed: "alumbra-lab-2026-08",
  });
});

test("lab generator produces the deterministic four-by-four chunk fixture", () => {
  const registry = createLabRegistry();
  const first = generateLabChunks(registry);
  const second = generateLabChunks(registry);
  assert.equal(first.length, 16);
  assert.deepEqual(first.map((chunk) => chunk.key), second.map((chunk) => chunk.key));
  assert.deepEqual(first.map((chunk) => chunk.revision), Array(16).fill(1));
  assert.deepEqual(new Set(first.map((chunk) => chunk.coord[0])), new Set([-2,-1,0,1]));
  assert.deepEqual(new Set(first.map((chunk) => chunk.coord[2])), new Set([-2,-1,0,1]));
});
