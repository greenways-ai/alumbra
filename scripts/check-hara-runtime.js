import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digestChunkSnapshot } from "@greenways/alumbra-core";
import {
  FIXTURE_PACKAGE,
  FIXTURE_VERSION,
  FIXTURE_WORLD_RULE,
  createFixtureBlockPack,
  createFlatFixtureGenerator,
  createFlatFixturePlan,
  createHaraRulesSession,
  createHeightFieldFixtureGenerator,
  createHeightFieldFixturePlan,
  materializeBlockRegistry,
  materializeGeneratedChunk,
} from "@greenways/alumbra-hara";
import {
  createHaraCliProvider,
  sha256Evidence,
} from "./hara-cli-provider.js";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const projectRoot = path.join(root, "packages/hara");
const sourceRoot = path.join(projectRoot, "src");
const binary = process.env.HARA_BIN || "hara";

async function activationEvidence() {
  const [projectBytes, lockBytes] = await Promise.all([
    readFile(path.join(projectRoot, "project.edn")),
    readFile(path.join(projectRoot, "project.lock.edn")),
  ]);
  return {
    format:"alumbra.hara-activation/1",
    project:{
      id:"greenways/alumbra-hara",
      version:FIXTURE_VERSION,
      digest:sha256Evidence(projectBytes),
    },
    lock:{
      format:1,
      digest:sha256Evidence(lockBytes),
    },
    packages:[
      {package:FIXTURE_PACKAGE, version:FIXTURE_VERSION},
      {package:"hara:greenways/alumbra-core", version:"0.1.0"},
    ],
    capabilities:[],
  };
}

async function rejectsCode(value, code) {
  await assert.rejects(value, (error) => {
    assert.equal(error?.code, code, error?.stack ?? String(error));
    return true;
  });
}

function reference(functionName) {
  return {
    package:FIXTURE_PACKAGE,
    version:FIXTURE_VERSION,
    entry:{module:"gw.alumbra.fixture", function:functionName},
  };
}

async function provePlanParity({
  session,
  registry,
  generator,
  coordinates,
  shape,
  argumentsFor,
  directPlan,
  kind,
}) {
  const evidence = [];
  for (const coord of coordinates) {
    const runtimePlan = await session.invokeGenerator(
      generator,
      argumentsFor(coord),
      {registry, expectedCoord:coord, expectedShape:shape},
    );
    const expectedPlan = directPlan(coord);
    const runtimeChunk = materializeGeneratedChunk(runtimePlan, registry, {
      expectedGenerator:generator,
      expectedCoord:coord,
      expectedShape:shape,
    });
    const expectedChunk = materializeGeneratedChunk(expectedPlan, registry, {
      expectedGenerator:generator,
      expectedCoord:coord,
      expectedShape:shape,
    });
    const [runtimeDigest, expectedDigest] = await Promise.all([
      digestChunkSnapshot(runtimeChunk),
      digestChunkSnapshot(expectedChunk),
    ]);
    assert.equal(runtimeDigest, expectedDigest, `${kind} digest mismatch at ${coord.join(",")}`);
    evidence.push({kind, coord, shape, digest:runtimeDigest});
  }
  return evidence;
}

async function main() {
  const activation = await activationEvidence();
  const provider = createHaraCliProvider({
    binary,
    projectRoot,
    sourceRoot,
    timeoutMs:30_000,
    maximumOutputBytes:4 * 1024 * 1024,
  });

  await rejectsCode(
    createHaraRulesSession({
      provider,
      activation:{
        ...activation,
        lock:{...activation.lock, digest:`sha256:${"9".repeat(64)}`},
      },
    }),
    "hara/activation-lock",
  );

  const session = await createHaraRulesSession({provider, activation});
  const evidence = [];
  try {
    const runtimePack = await session.invokeBlockPack({
      package:FIXTURE_PACKAGE,
      version:FIXTURE_VERSION,
      id:"alumbra/fixture-blocks",
      entry:{module:"gw.alumbra.fixture", function:"fixture-block-pack"},
    });
    assert.deepEqual(runtimePack, createFixtureBlockPack());

    const {registry} = materializeBlockRegistry([runtimePack], {
      id:"alumbra/hara-runtime-fixture-blocks",
      version:FIXTURE_VERSION,
    });
    const shape = [8, 8, 8];

    const flatGenerator = createFlatFixtureGenerator({seed:0});
    evidence.push(...await provePlanParity({
      session,
      registry,
      generator:flatGenerator,
      coordinates:[[0, 0, 0], [-1, 0, 1], [2, -1, -2]],
      shape,
      kind:"flat",
      argumentsFor:(coord) => [
        flatGenerator,
        coord,
        shape,
        "alumbra/air",
        "alumbra/fixture-stone",
        3,
      ],
      directPlan:(coord) => createFlatFixturePlan({
        generator:flatGenerator,
        coord,
        shape,
        base:"alumbra/air",
        block:"alumbra/fixture-stone",
        surface:3,
      }, registry),
    }));

    const heightGenerator = createHeightFieldFixtureGenerator({seed:17});
    evidence.push(...await provePlanParity({
      session,
      registry,
      generator:heightGenerator,
      coordinates:[[0, 0, 0], [-2, 0, 3], [4, -1, -5]],
      shape,
      kind:"height-field",
      argumentsFor:(coord) => [
        heightGenerator,
        coord,
        shape,
        "alumbra/air",
        "alumbra/fixture-soil",
        "alumbra/fixture-grass",
        17,
        2,
        5,
      ],
      directPlan:(coord) => createHeightFieldFixturePlan({
        generator:heightGenerator,
        coord,
        shape,
        base:"alumbra/air",
        fill:"alumbra/fixture-soil",
        surfaceBlock:"alumbra/fixture-grass",
        seed:17,
        minimum:2,
        span:5,
      }, registry),
    }));

    const interaction = await session.invokeInteraction(
      FIXTURE_WORLD_RULE,
      [
        {"event/type":"use"},
        {id:"alumbra/fixture-lamp", state:{lit:false}},
      ],
      {registry},
    );
    assert.equal(interaction.id, "alumbra/toggle-fixture-lamp");
    assert.equal(interaction.transactions.length, 0);
    assert.equal(interaction.feedback[0].kind, "programmatic");
    assert.deepEqual(interaction.feedback[0].data, {event:"use", lit:true});

    await rejectsCode(
      session.invoke(reference("capability-request")),
      "hara/result-capability-request",
    );

    const malformedGenerator = {
      format:"alumbra.generator/1",
      package:FIXTURE_PACKAGE,
      version:FIXTURE_VERSION,
      id:"alumbra/fixture-malformed",
      seed:0,
      entry:{module:"gw.alumbra.fixture", function:"malformed-generator"},
      parameters:{},
    };
    await rejectsCode(
      session.invokeGenerator(
        malformedGenerator,
        [malformedGenerator, [0, 0, 0], shape],
        {registry, expectedCoord:[0, 0, 0], expectedShape:shape},
      ),
      "hara/generated-format",
    );

    await rejectsCode(
      session.invoke(reference("non-json-result")),
      "hara/runtime-evaluation",
    );

    await rejectsCode(
      session.invoke(reference("echo-value"), ["x".repeat(512)], {maximumBytes:64}),
      "canonical/size",
    );
  } finally {
    await session.dispose();
  }

  process.stdout.write(`${JSON.stringify({
    format:"alumbra.hara-conformance/1",
    runtime:"hara-cli",
    binary,
    project:activation.project,
    lock:activation.lock,
    snapshots:evidence,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  console.error(JSON.stringify({
    name:error?.name ?? null,
    code:error?.code ?? null,
    message:error?.message ?? String(error),
    details:error?.details ?? null,
  }, null, 2));
  process.exitCode = 1;
});
