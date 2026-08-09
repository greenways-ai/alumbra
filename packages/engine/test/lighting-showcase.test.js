import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "@greenways/alumbra-core";
import { parseEdn } from "../../../scripts/lib/edn.mjs";
import {
  buildVoxelLightFields,
  normalizeLightingProfile,
} from "../src/lighting.js";
import {
  createLightingRuntime,
} from "../src/lighting-runtime.js";

const packageRoot = new URL("../", import.meta.url);
const readEdn = async (relative) =>
  parseEdn(await readFile(new URL(relative, packageRoot), "utf8"));

const createRegistry = () => createBlockRegistry([
  {
    id: "lighting-showcase/air",
    empty: true,
    metadata: {
      physics: { solid: false },
      render: { visible: false, opaque: false },
    },
  },
  {
    id: "lighting-showcase/stone",
    metadata: {
      physics: { solid: true },
      render: { opaque: true },
    },
  },
  {
    id: "lighting-showcase/lamp",
    metadata: {
      physics: { solid: true },
      render: { opaque: true },
      emittedLight: 15,
    },
  },
], {
  id: "lighting-showcase/registry",
  version: "0.1.0",
});

const airChunk = (registry, coord, shape = [4, 4, 4]) => createChunk({
  registry,
  coord,
  shape,
  fill: "lighting-showcase/air",
});

test("voxel-lighting Showcase derives sunlight, policy and negative-boundary emission", async () => {
  const state = await readEdn("showcase/states/voxel-light-fields.edn");
  const registry = createRegistry();
  const profile = normalizeLightingProfile();

  assert.equal(profile.id, state.profile.id);
  assert.equal(profile.maxLevel, state.profile.maximum);
  assert.equal(profile.sunlightAttenuation, state.profile["sunlight-attenuation"]);
  assert.equal(profile.emittedAttenuation, state.profile["emitted-attenuation"]);
  assert.equal(profile.missingNeighborPolicy, state.profile["missing-neighbour-policy"]);

  const single = airChunk(registry, [0, 0, 0]);
  const sunlight = buildVoxelLightFields({ registry, chunks: [single] });
  const field = sunlight.getField([0, 0, 0]);
  assert.equal(field.sunlightAt([0, 3, 0]), state.sunlight["loaded-sky-top"]);
  assert.equal(field.sunlightAt([0, 0, 0]), state.sunlight["loaded-sky-lower"]);

  const separated = airChunk(registry, [0, 2, 0]);
  const opaqueGap = buildVoxelLightFields({ registry, chunks: [single, separated] });
  const openGap = buildVoxelLightFields({
    registry,
    chunks: [single, separated],
    profile: { missingNeighborPolicy: "open" },
  });
  assert.equal(
    opaqueGap.getField([0, 0, 0]).sunlightAt([0, 3, 0]),
    state.sunlight["opaque-gap-lower-top"],
  );
  assert.equal(
    openGap.getField([0, 0, 0]).sunlightAt([0, 3, 0]),
    state.sunlight["open-gap-lower-top"],
  );

  const leftBase = airChunk(registry, [-1, 0, 0]);
  const left = patchChunk(leftBase, [{
    local: [3, 1, 1],
    value: "lighting-showcase/lamp",
  }], registry, { revision: 1 });
  const right = airChunk(registry, [0, 0, 0]);
  const first = buildVoxelLightFields({ registry, chunks: [right, left] });
  const second = buildVoxelLightFields({ registry, chunks: [left, right] });

  assert.deepEqual(first.keys(), state.emitted["ordered-field-keys"]);
  assert.equal(
    first.getField(state.emitted.lamp.chunk).emittedAt(state.emitted.lamp.local),
    state.emitted.lamp.level,
  );
  assert.equal(
    first.getField(state.emitted["across-boundary"].chunk)
      .emittedAt(state.emitted["across-boundary"].local),
    state.emitted["across-boundary"].level,
  );
  assert.equal(
    first.getField(state.emitted["next-voxel"].chunk)
      .emittedAt(state.emitted["next-voxel"].local),
    state.emitted["next-voxel"].level,
  );
  assert.equal(
    JSON.stringify([...first.getField(left.key).copyEmitted()])
      === JSON.stringify([...second.getField(left.key).copyEmitted()]),
    state.emitted["input-order-independent"],
  );
  assert.equal(
    JSON.stringify([...first.getField(right.key).copyEmitted()])
      === JSON.stringify([...second.getField(right.key).copyEmitted()]),
    state.emitted["input-order-independent"],
  );

  const copied = first.getField(left.key).copyEmitted();
  copied[0] = 255;
  assert.notEqual(first.getField(left.key).copyEmitted()[0], 255);
  assert.equal(first.getField([1, 0, 0]), null);
  assert.equal(state["field-boundary"]["dense-fields-private"], true);
  assert.equal(state["field-boundary"]["storage-selected"], false);
  assert.equal(state["field-boundary"]["renderer-selected"], false);
});

test("lighting-runtime Showcase derives bounded invalidation and stale-result fences", async () => {
  const state = await readEdn("showcase/states/lighting-runtime-fences.edn");
  const registry = createRegistry();
  const chunks = [0, 1, 2].map((x) => airChunk(registry, [x, 0, 0], [16, 16, 16]));
  const runtime = createLightingRuntime({ registry, chunks });
  const initial = runtime.rebuild();

  assert.equal(initial.installation.installed, true);
  assert.equal(runtime.evidence().status, state.initial.status);
  assert.equal(runtime.evidence().loadedChunks, state.initial["loaded-chunks"]);
  assert.equal(runtime.evidence().validFieldChunks, state.initial["valid-field-chunks"]);
  const preserved = runtime.getField(state.change["preserved-field"]);

  const firstRevision = patchChunk(chunks[0], [{
    local: [15, 1, 1],
    value: "lighting-showcase/lamp",
  }], registry, { revision: state.change.revision });
  const invalidation = runtime.updateChunk(firstRevision);
  assert.deepEqual(invalidation.affected, state.change.affected);
  assert.equal(runtime.getField(state.change["preserved-field"]), preserved);

  const staleJob = runtime.plan();
  const secondRevision = patchChunk(firstRevision, [{
    local: [1, 1, 1],
    value: "lighting-showcase/stone",
  }], registry, { revision: state["current-installation"]["target-revision"] });
  runtime.updateChunk(secondRevision);

  const staleResult = staleJob.run();
  const staleRevision = runtime.install(staleResult);
  assert.equal(staleRevision.installed, state["stale-revision"].installed);
  assert.equal(staleRevision.reason, state["stale-revision"].reason);

  const current = runtime.rebuild();
  assert.equal(current.installation.installed, state["current-installation"].installed);
  assert.equal(
    runtime.getField([0, 0, 0]).sourceRevision,
    state["current-installation"]["target-revision"],
  );
  assert.equal(
    runtime.getField([1, 0, 0]).emittedAt([0, 1, 1]),
    state["current-installation"]["neighbour-emitted-level"],
  );

  const staleGeneration = runtime.install(staleResult);
  assert.equal(staleGeneration.installed, state["stale-generation"].installed);
  assert.equal(staleGeneration.reason, state["stale-generation"].reason);
  runtime.destroy();

  const epochRuntime = createLightingRuntime({ registry, chunks });
  epochRuntime.rebuild();
  const epochJob = epochRuntime.plan();
  epochRuntime.invalidate([[2, 0, 0]]);
  const staleEpoch = epochRuntime.install(epochJob.run());
  assert.equal(staleEpoch.installed, state["stale-epoch"].installed);
  assert.equal(staleEpoch.reason, state["stale-epoch"].reason);
  epochRuntime.destroy();

  assert.equal(state["authority-boundary"]["bounded-invalidation"], true);
  assert.equal(state["authority-boundary"]["late-results-cannot-replace-current-fields"], true);
  assert.equal(state["authority-boundary"]["worker-selected"], false);
  assert.equal(state["authority-boundary"]["storage-selected"], false);
});
