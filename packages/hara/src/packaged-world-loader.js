import {
  deepFreeze,
  digestChunkSnapshot,
  validationError,
} from "@greenways/alumbra-core";
import {materializeBlockRegistry} from "./block-pack.js";
import {safeInteger} from "./common.js";
import {materializeGeneratedChunk} from "./generator-plan.js";
import {normalizeHaraActivation} from "./runtime.js";
import {
  PACKAGED_WORLD_EVIDENCE_FORMAT,
  normalizePackagedWorldState,
} from "./packaged-world-state.js";

const EXPECTED_PACKAGE_MISMATCH = "hara/package-version-mismatch";
const INTEGER_SEED = /^-?(?:0|[1-9][0-9]*)$/;
const pinnedVersion = (activation, packageId) => activation.packages
  .find((entry) => entry.package === packageId)?.version ?? null;

const generatorSeedArgument = (value) => {
  const source = String(value);
  if (!INTEGER_SEED.test(source)) {
    validationError(
      "The packaged height-field generator requires an integer identity seed",
      "hara/packaged-world-seed",
      {seed: source},
    );
  }
  return safeInteger(Number(source), "Packaged world generator seed");
};

const rejectionEvidence = (state, pinned) => deepFreeze({
  format: PACKAGED_WORLD_EVIDENCE_FORMAT,
  status: "rejected",
  stateId: state.id,
  package: {
    coordinate: state.blockPack.package,
    requestedVersion: state.blockPack.version,
    pinnedVersion: pinned,
    blockPackId: state.blockPack.id,
    matched: false,
  },
  generator: {
    coordinate: state.generator.package,
    version: state.generator.version,
    id: state.generator.id,
    seed: state.generator.seed,
    matched: false,
  },
  snapshots: [],
  negativeCoordinateParity: false,
  error: state.expectedError,
});

export async function loadPackagedHaraWorld({
  session,
  state,
  registryId = "alumbra/hara-showcase-blocks",
  registryVersion = "0.1.0",
  worldId = null,
} = {}) {
  if (!session || typeof session.invokeBlockPack !== "function" || typeof session.invokeGenerator !== "function") {
    validationError(
      "Packaged Hara worlds require a rule session with block-pack and generator invocation",
      "hara/packaged-world-session",
    );
  }
  const normalizedState = normalizePackagedWorldState(state);
  const activation = normalizeHaraActivation(session.activation);
  const pinned = pinnedVersion(activation, normalizedState.blockPack.package);
  if (pinned == null) {
    validationError(
      `Packaged world package ${normalizedState.blockPack.package} is not pinned`,
      "hara/package-unpinned",
      {package: normalizedState.blockPack.package},
    );
  }

  if (pinned !== normalizedState.blockPack.version) {
    if (normalizedState.expectedError?.code !== EXPECTED_PACKAGE_MISMATCH) {
      validationError(
        "Packaged world package version does not match the active lock",
        EXPECTED_PACKAGE_MISMATCH,
        {
          package: normalizedState.blockPack.package,
          requested: normalizedState.blockPack.version,
          pinned,
        },
      );
    }
    return Object.freeze({
      status: "rejected",
      state: normalizedState,
      registry: null,
      chunks: Object.freeze([]),
      spawn: normalizedState.spawn,
      worldId: String(worldId ?? `world:alumbra/${normalizedState.id.replace("/", "-")}`),
      evidence: rejectionEvidence(normalizedState, pinned),
    });
  }

  if (normalizedState.expectedError) {
    validationError(
      "Packaged world expected a package mismatch but the exact lock accepted it",
      "hara/packaged-world-mismatch-not-observed",
      {state: normalizedState.id},
    );
  }

  const runtimePack = await session.invokeBlockPack(normalizedState.blockPack);
  const {registry} = materializeBlockRegistry([runtimePack], {
    id: registryId,
    version: registryVersion,
  });
  const chunks = [];
  const snapshots = [];
  const invocationSeed = generatorSeedArgument(normalizedState.generator.seed);
  for (const expectation of normalizedState.chunks) {
    const parameters = normalizedState.generator.parameters;
    const plan = await session.invokeGenerator(
      normalizedState.generator,
      [
        normalizedState.generator,
        expectation.coord,
        expectation.shape,
        "alumbra/air",
        "alumbra/fixture-soil",
        "alumbra/fixture-grass",
        invocationSeed,
        parameters.minimum,
        parameters.span,
      ],
      {
        registry,
        expectedCoord: expectation.coord,
        expectedShape: expectation.shape,
      },
    );
    const chunk = materializeGeneratedChunk(plan, registry, {
      expectedGenerator: normalizedState.generator,
      expectedCoord: expectation.coord,
      expectedShape: expectation.shape,
    });
    const digest = await digestChunkSnapshot(chunk);
    if (digest !== expectation.digest) {
      validationError(
        `Packaged world snapshot digest drifted at ${expectation.coord.join(",")}`,
        "hara/packaged-world-digest",
        {expected: expectation.digest, actual: digest, coord: expectation.coord},
      );
    }
    chunks.push(chunk);
    snapshots.push(deepFreeze({
      coord: expectation.coord,
      shape: expectation.shape,
      digest,
      expectedDigest: expectation.digest,
      matched: true,
    }));
  }

  const hasNegativeCoordinate = snapshots.some((snapshot) => snapshot.coord.some((entry) => entry < 0));
  const evidence = deepFreeze({
    format: PACKAGED_WORLD_EVIDENCE_FORMAT,
    status: "ready",
    stateId: normalizedState.id,
    package: {
      coordinate: runtimePack.package,
      requestedVersion: normalizedState.blockPack.version,
      pinnedVersion: pinned,
      blockPackId: runtimePack.id,
      matched: runtimePack.package === normalizedState.blockPack.package
        && runtimePack.version === normalizedState.blockPack.version
        && runtimePack.id === normalizedState.blockPack.id,
    },
    generator: {
      coordinate: normalizedState.generator.package,
      version: normalizedState.generator.version,
      id: normalizedState.generator.id,
      seed: normalizedState.generator.seed,
      matched: true,
    },
    snapshots,
    negativeCoordinateParity: hasNegativeCoordinate
      ? snapshots.every((snapshot) => snapshot.matched)
      : false,
    error: null,
  });

  return Object.freeze({
    status: "ready",
    state: normalizedState,
    registry,
    chunks: Object.freeze(chunks),
    spawn: normalizedState.spawn,
    worldId: String(worldId ?? `world:alumbra/${normalizedState.id.replace("/", "-")}`),
    evidence,
  });
}
