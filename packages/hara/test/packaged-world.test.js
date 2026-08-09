import assert from "node:assert/strict";
import test from "node:test";
import {
  PACKAGED_WORLD_STATE_IDS,
  createFixturePackagedWorldSession,
  loadPackagedHaraWorld,
  packagedWorldState,
} from "../src/index.js";

const driftDigest = `sha256:${"f".repeat(64)}`;

test("default packaged world invokes the pinned block pack and generator into Core chunks", async () => {
  const session = createFixturePackagedWorldSession();
  const result = await loadPackagedHaraWorld({
    session,
    state: packagedWorldState(PACKAGED_WORLD_STATE_IDS.defaultSeed),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.registry.id, "alumbra/hara-showcase-blocks");
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0].key, "0,0,0");
  assert.equal(result.evidence.package.matched, true);
  assert.equal(result.evidence.generator.matched, true);
  assert.equal(result.evidence.snapshots[0].matched, true);
  assert.equal(
    result.evidence.snapshots[0].digest,
    "sha256:3d11dc2d8176c2ddaff622544196e7111b8cfafaefef0746521ae304a1a953e6",
  );
  assert.deepEqual(session.snapshot(), {
    disposed: false,
    blockPackInvocations: 1,
    generatorInvocations: 1,
  });
  assert.doesNotThrow(() => JSON.stringify(result.evidence));
  assert.equal(Object.hasOwn(result.evidence, "registry"), false);
  await session.dispose();
});

test("negative-coordinate state preserves the immutable Core snapshot parity", async () => {
  const session = createFixturePackagedWorldSession();
  const result = await loadPackagedHaraWorld({
    session,
    state: packagedWorldState(PACKAGED_WORLD_STATE_IDS.negativeCoordinate),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.chunks[0].key, "-2,0,3");
  assert.equal(result.evidence.negativeCoordinateParity, true);
  assert.deepEqual(result.evidence.snapshots[0].coord, [-2, 0, 3]);
  assert.equal(
    result.evidence.snapshots[0].digest,
    "sha256:d11756fe007f7252053b95c996c0f8884e0561793205c9cc2a0fde8fcc336fc3",
  );
  await session.dispose();
});

test("package mismatch is a descriptive rejection and invokes no runtime entry", async () => {
  const session = createFixturePackagedWorldSession();
  const result = await loadPackagedHaraWorld({
    session,
    state: packagedWorldState(PACKAGED_WORLD_STATE_IDS.packageMismatch),
  });
  assert.equal(result.status, "rejected");
  assert.equal(result.registry, null);
  assert.deepEqual(result.chunks, []);
  assert.equal(result.evidence.error.code, "hara/package-version-mismatch");
  assert.equal(result.evidence.package.requestedVersion, "0.2.0");
  assert.equal(result.evidence.package.pinnedVersion, "0.1.0");
  assert.deepEqual(session.snapshot(), {
    disposed: false,
    blockPackInvocations: 0,
    generatorInvocations: 0,
  });
  await session.dispose();
});

test("snapshot drift and unknown named states fail closed", async () => {
  const session = createFixturePackagedWorldSession();
  const state = packagedWorldState(PACKAGED_WORLD_STATE_IDS.defaultSeed);
  await assert.rejects(
    loadPackagedHaraWorld({
      session,
      state: {
        ...state,
        chunks: [{...state.chunks[0], digest: driftDigest}],
      },
    }),
    (error) => {
      assert.equal(error?.code, "hara/packaged-world-digest");
      return true;
    },
  );
  assert.throws(
    () => packagedWorldState("world/not-installed"),
    (error) => error?.code === "hara/packaged-world-state",
  );
  await session.dispose();
  await assert.rejects(
    loadPackagedHaraWorld({session, state}),
    (error) => error?.code === "hara/session-disposed",
  );
});
