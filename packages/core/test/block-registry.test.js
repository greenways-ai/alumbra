import assert from "node:assert/strict";
import test from "node:test";
import {
  AlumbraValidationError,
  blockValueKey,
  createBlockRegistry,
  normalizeBlockValue,
} from "../src/index.js";

const registry = () => createBlockRegistry([
  { id: "alumbra/air", empty: true },
  {
    id: "alumbra/lamp",
    states: {
      age: { type: "integer", min: 0, max: 7, default: 0 },
      facing: { type: "enum", values: ["north", "east", "south", "west"], default: "north" },
      lit: { type: "boolean", default: false },
    },
  },
]);

test("block registry applies sorted defaults and validates state", () => {
  const value = normalizeBlockValue(registry(), {
    id: "alumbra/lamp",
    state: { lit: true, facing: "east" },
  });
  assert.deepEqual(value, {
    id: "alumbra/lamp",
    state: { age: 0, facing: "east", lit: true },
  });
  assert.equal(
    blockValueKey(value),
    '{"id":"alumbra/lamp","state":{"age":0,"facing":"east","lit":true}}',
  );
});

test("block registry rejects duplicate, unknown and invalid state", () => {
  assert.throws(() => createBlockRegistry([
    { id: "alumbra/air", empty: true },
    { id: "alumbra/air" },
  ]), AlumbraValidationError);

  const value = registry();
  assert.throws(() => normalizeBlockValue(value, "alumbra/missing"), AlumbraValidationError);
  assert.throws(() => normalizeBlockValue(value, {
    id: "alumbra/lamp",
    state: { age: 8 },
  }), AlumbraValidationError);
  assert.throws(() => normalizeBlockValue(value, {
    id: "alumbra/lamp",
    state: { surprise: true },
  }), AlumbraValidationError);
});
