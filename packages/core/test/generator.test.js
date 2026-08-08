import assert from "node:assert/strict";
import test from "node:test";
import {
  AlumbraValidationError,
  generatorChunkKey,
  normalizeGeneratorIdentity,
} from "../src/index.js";

test("generator identity and chunk keys are deterministic", () => {
  const identity = normalizeGeneratorIdentity({
    package: "hara:greenways/alumbra-terrain",
    version: "0.1.0",
    id: "alumbra/overworld",
    seed: 918273645,
  });
  assert.deepEqual(identity, {
    package: "hara:greenways/alumbra-terrain",
    version: "0.1.0",
    id: "alumbra/overworld",
    seed: "918273645",
  });
  assert.equal(
    generatorChunkKey(identity, [-2, 0, 4]),
    '{"chunk":[-2,0,4],"generator":{"id":"alumbra/overworld","package":"hara:greenways/alumbra-terrain","seed":"918273645","version":"0.1.0"}}',
  );
});

test("generator identity rejects ambient or malformed inputs", () => {
  assert.throws(() => normalizeGeneratorIdentity({
    package: "https://example.com/generator.js",
    version: "0.1.0",
    id: "alumbra/overworld",
    seed: 1,
  }), AlumbraValidationError);
});
