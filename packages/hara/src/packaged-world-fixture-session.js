import {
  deepFreeze,
  normalizeChunkShape,
  normalizeVector3,
  validationError,
} from "@greenways/alumbra-core";
import {
  boundedArray,
  normalizePackageReference,
  safeInteger,
  sameCanonical,
} from "./common.js";
import {createFixtureBlockPack} from "./fixtures.js";
import {
  createHeightFieldFixturePlan,
  normalizeGeneratorDescriptor,
} from "./generator-plan.js";
import {
  PACKAGED_WORLD_FIXTURE,
  PACKAGED_WORLD_STATE_IDS,
  packagedWorldState,
} from "./packaged-world-state.js";

const SYNTHETIC_DIGEST = `sha256:${"0".repeat(64)}`;

export function createFixturePackagedWorldSession() {
  let disposed = false;
  let blockPackInvocations = 0;
  let generatorInvocations = 0;
  const activation = deepFreeze({
    format: "alumbra.hara-activation/1",
    project: {
      id: "greenways/alumbra-hara",
      version: PACKAGED_WORLD_FIXTURE.version,
      digest: SYNTHETIC_DIGEST,
    },
    lock: {format: 1, digest: SYNTHETIC_DIGEST},
    packages: [
      {package: PACKAGED_WORLD_FIXTURE.package, version: PACKAGED_WORLD_FIXTURE.version},
      {package: "hara:greenways/alumbra-core", version: "0.1.0"},
    ],
    capabilities: [],
  });
  const ensureActive = () => {
    if (disposed) validationError("Fixture packaged-world session is disposed", "hara/session-disposed");
  };

  return Object.freeze({
    activation,
    async invokeBlockPack(reference) {
      ensureActive();
      const normalized = normalizePackageReference(reference, "Fixture block-pack reference", {entry: true});
      const expected = packagedWorldState(PACKAGED_WORLD_STATE_IDS.defaultSeed).blockPack;
      if (!sameCanonical(normalized, expected)) {
        validationError(
          "Fixture packaged-world session received an unexpected block-pack reference",
          "hara/fixture-reference",
          {expected, actual: normalized},
        );
      }
      blockPackInvocations += 1;
      return createFixtureBlockPack();
    },
    async invokeGenerator(generatorValue, argumentsValue, {
      registry,
      expectedCoord = null,
      expectedShape = null,
    } = {}) {
      ensureActive();
      const generator = normalizeGeneratorDescriptor(generatorValue);
      if (
        generator.package !== PACKAGED_WORLD_FIXTURE.package
        || generator.version !== PACKAGED_WORLD_FIXTURE.version
        || generator.id !== PACKAGED_WORLD_FIXTURE.generatorId
        || !sameCanonical(generator.entry, PACKAGED_WORLD_FIXTURE.generatorEntry)
      ) {
        validationError(
          "Fixture packaged-world session received an unexpected generator reference",
          "hara/fixture-reference",
          {generator},
        );
      }
      const values = boundedArray(argumentsValue, "Fixture generator arguments", 16);
      if (values.length !== 9) {
        validationError("Fixture height-field generator requires nine arguments", "hara/fixture-arguments", {
          length: values.length,
        });
      }
      const [argumentGenerator, coord, shape, base, fill, surfaceBlock, seed, minimum, span] = values;
      if (!sameCanonical(normalizeGeneratorDescriptor(argumentGenerator), generator)) {
        validationError("Fixture generator argument identity drifted", "hara/fixture-generator");
      }
      const normalizedCoord = normalizeVector3(coord, "Fixture generator coordinate");
      const normalizedShape = normalizeChunkShape(shape);
      if (expectedCoord && !sameCanonical(normalizedCoord, normalizeVector3(expectedCoord, "Expected coordinate"))) {
        validationError("Fixture generator coordinate does not match its request", "hara/generated-coordinate-mismatch");
      }
      if (expectedShape && !sameCanonical(normalizedShape, normalizeChunkShape(expectedShape))) {
        validationError("Fixture generator shape does not match its request", "hara/generated-shape-mismatch");
      }
      generatorInvocations += 1;
      return createHeightFieldFixturePlan({
        generator,
        coord: normalizedCoord,
        shape: normalizedShape,
        base,
        fill,
        surfaceBlock,
        seed: safeInteger(seed, "Fixture generator seed"),
        minimum: safeInteger(minimum, "Fixture generator minimum"),
        span: safeInteger(span, "Fixture generator span", {minimum: 1}),
      }, registry);
    },
    snapshot() {
      return deepFreeze({disposed, blockPackInvocations, generatorInvocations});
    },
    async dispose() {
      disposed = true;
    },
  });
}
