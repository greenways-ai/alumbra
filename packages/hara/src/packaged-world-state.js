import {
  deepFreeze,
  normalizeChunkShape,
  normalizeVector3,
  validationError,
} from "@greenways/alumbra-core";
import {
  boundedArray,
  finiteNumber,
  normalizePackageReference,
  objectValue,
  requiredString,
} from "./common.js";
import {
  FIXTURE_PACKAGE,
  FIXTURE_VERSION,
} from "./fixtures.js";
import {normalizeGeneratorDescriptor} from "./generator-plan.js";

export const PACKAGED_WORLD_STATE_FORMAT = "alumbra.packaged-world-state/1";
export const PACKAGED_WORLD_EVIDENCE_FORMAT = "alumbra.packaged-world-evidence/1";

export const PACKAGED_WORLD_STATE_IDS = Object.freeze({
  defaultSeed: "world/default-seed",
  negativeCoordinate: "world/negative-coordinate",
  packageMismatch: "world/package-mismatch",
});

export const PACKAGED_WORLD_FIXTURE = deepFreeze({
  package: FIXTURE_PACKAGE,
  version: FIXTURE_VERSION,
  blockPackId: "alumbra/fixture-blocks",
  blockPackEntry: {
    module: "gw.alumbra.fixture",
    function: "fixture-block-pack",
  },
  generatorId: "alumbra/fixture-height-field",
  generatorEntry: {
    module: "gw.alumbra.fixture",
    function: "height-field-fixture-plan",
  },
  shape: [8, 8, 8],
});

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const EXPECTED_PACKAGE_MISMATCH = "hara/package-version-mismatch";

const exactKeys = (value, allowed, label) => {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    validationError(`${label} contains unsupported fields`, "hara/packaged-world-fields", {
      label,
      fields: unexpected.sort(),
    });
  }
};

const vector3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3) {
    validationError(`${label} must contain three values`, "hara/packaged-world-vector", {label});
  }
  return Object.freeze(value.map((entry, axis) => finiteNumber(entry, `${label}[${axis}]`)));
};

const normalizeSpawn = (value) => {
  const input = objectValue(value, "Packaged world spawn");
  exactKeys(input, new Set(["position", "velocity", "yaw", "pitch"]), "Packaged world spawn");
  return deepFreeze({
    position: vector3(input.position, "Packaged world spawn position"),
    velocity: vector3(input.velocity ?? [0, 0, 0], "Packaged world spawn velocity"),
    yaw: finiteNumber(input.yaw ?? 0, "Packaged world spawn yaw"),
    pitch: finiteNumber(input.pitch ?? 0, "Packaged world spawn pitch", {minimum: -89, maximum: 89}),
    grounded: false,
  });
};

const normalizeChunkExpectation = (value, index) => {
  const input = objectValue(value, `Packaged world chunk ${index}`);
  exactKeys(input, new Set(["coord", "shape", "digest"]), `Packaged world chunk ${index}`);
  return deepFreeze({
    coord: normalizeVector3(input.coord, `Packaged world chunk ${index} coordinate`),
    shape: normalizeChunkShape(input.shape),
    digest: requiredString(input.digest, `Packaged world chunk ${index} digest`, {
      maximum: 71,
      pattern: SHA256_PATTERN,
    }),
  });
};

const normalizeExpectedError = (value) => {
  if (value == null) return null;
  const input = objectValue(value, "Packaged world expected error");
  exactKeys(input, new Set(["code", "message"]), "Packaged world expected error");
  return deepFreeze({
    code: requiredString(input.code, "Packaged world expected error code", {maximum: 256}),
    message: requiredString(input.message, "Packaged world expected error message", {maximum: 2048}),
  });
};

export function normalizePackagedWorldState(value) {
  const input = objectValue(value, "Packaged world state");
  exactKeys(
    input,
    new Set(["format", "id", "blockPack", "generator", "chunks", "spawn", "expectedError"]),
    "Packaged world state",
  );
  if (input.format != null && input.format !== PACKAGED_WORLD_STATE_FORMAT) {
    validationError(`Unsupported packaged world state format: ${input.format}`, "hara/packaged-world-format", {
      format: input.format,
    });
  }
  const id = requiredString(input.id, "Packaged world state id", {maximum: 256});
  const blockPack = normalizePackageReference(input.blockPack, "Packaged world block pack", {entry: true});
  const generator = normalizeGeneratorDescriptor(input.generator);
  if (blockPack.package !== generator.package || blockPack.version !== generator.version) {
    validationError(
      "Packaged world block pack and generator must use one package coordinate",
      "hara/packaged-world-package",
      {blockPack, generator},
    );
  }
  const chunks = Object.freeze(boundedArray(
    input.chunks ?? [],
    "Packaged world chunks",
    64,
  ).map(normalizeChunkExpectation));
  const expectedError = normalizeExpectedError(input.expectedError);
  if (expectedError && chunks.length) {
    validationError(
      "A rejected packaged world state cannot advertise materialized chunks",
      "hara/packaged-world-rejected-chunks",
    );
  }
  if (!expectedError && !chunks.length) {
    validationError(
      "A ready packaged world state requires at least one chunk expectation",
      "hara/packaged-world-chunks",
    );
  }
  return deepFreeze({
    format: PACKAGED_WORLD_STATE_FORMAT,
    id,
    blockPack,
    generator,
    chunks,
    spawn: normalizeSpawn(input.spawn),
    expectedError,
  });
}

const packagedState = ({
  id,
  version = PACKAGED_WORLD_FIXTURE.version,
  coord,
  digest,
  spawn,
  expectedError = null,
}) => normalizePackagedWorldState({
  format: PACKAGED_WORLD_STATE_FORMAT,
  id,
  blockPack: {
    package: PACKAGED_WORLD_FIXTURE.package,
    version,
    id: PACKAGED_WORLD_FIXTURE.blockPackId,
    entry: PACKAGED_WORLD_FIXTURE.blockPackEntry,
  },
  generator: {
    format: "alumbra.generator/1",
    package: PACKAGED_WORLD_FIXTURE.package,
    version,
    id: PACKAGED_WORLD_FIXTURE.generatorId,
    seed: 17,
    entry: PACKAGED_WORLD_FIXTURE.generatorEntry,
    parameters: {minimum: 2, span: 5},
  },
  chunks: digest ? [{coord, shape: PACKAGED_WORLD_FIXTURE.shape, digest}] : [],
  spawn,
  expectedError,
});

export const PACKAGED_WORLD_STATES = deepFreeze({
  [PACKAGED_WORLD_STATE_IDS.defaultSeed]: packagedState({
    id: PACKAGED_WORLD_STATE_IDS.defaultSeed,
    coord: [0, 0, 0],
    digest: "sha256:3d11dc2d8176c2ddaff622544196e7111b8cfafaefef0746521ae304a1a953e6",
    spawn: {position: [3.5, 7, 3.5], velocity: [0, 0, 0], yaw: 12, pitch: -24},
  }),
  [PACKAGED_WORLD_STATE_IDS.negativeCoordinate]: packagedState({
    id: PACKAGED_WORLD_STATE_IDS.negativeCoordinate,
    coord: [-2, 0, 3],
    digest: "sha256:d11756fe007f7252053b95c996c0f8884e0561793205c9cc2a0fde8fcc336fc3",
    spawn: {position: [-12.5, 7, 27.5], velocity: [0, 0, 0], yaw: -24, pitch: -24},
  }),
  [PACKAGED_WORLD_STATE_IDS.packageMismatch]: packagedState({
    id: PACKAGED_WORLD_STATE_IDS.packageMismatch,
    version: "0.2.0",
    coord: null,
    digest: null,
    spawn: {position: [0, 0, 0], velocity: [0, 0, 0], yaw: 0, pitch: 0},
    expectedError: {
      code: EXPECTED_PACKAGE_MISMATCH,
      message: "The requested Hara package version does not match the exact Showcase lock.",
    },
  }),
});

export function packagedWorldState(id) {
  const key = requiredString(id, "Packaged world state id", {maximum: 256});
  const state = PACKAGED_WORLD_STATES[key];
  if (!state) {
    validationError(`Unknown packaged world state: ${key}`, "hara/packaged-world-state", {id: key});
  }
  return state;
}
