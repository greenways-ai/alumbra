import assert from "node:assert/strict";
import test from "node:test";
import {
  digestChunkSnapshot,
} from "@greenways/alumbra-core";
import {
  FIXTURE_PACKAGE,
  FIXTURE_VERSION,
  HARA_RESULT_FORMAT,
  HaraRuleRuntimeError,
  createFixtureBlockPack,
  createHaraRulesSession,
  createHeightFieldFixtureGenerator,
  createHeightFieldFixturePlan,
  materializeBlockRegistry,
  materializeGeneratedChunk,
  normalizeHaraActivation,
} from "../src/index.js";

const PROJECT_DIGEST = `sha256:${"1".repeat(64)}`;
const LOCK_DIGEST = `sha256:${"2".repeat(64)}`;

const ACTIVATION = {
  format:"alumbra.hara-activation/1",
  project:{
    id:"greenways/alumbra-hara",
    version:FIXTURE_VERSION,
    digest:PROJECT_DIGEST,
  },
  lock:{format:1, digest:LOCK_DIGEST},
  packages:[
    {package:FIXTURE_PACKAGE, version:FIXTURE_VERSION},
    {package:"hara:greenways/alumbra-core", version:"0.1.0"},
  ],
  capabilities:[],
};

const BLOCK_PACK_REFERENCE = {
  package:FIXTURE_PACKAGE,
  version:FIXTURE_VERSION,
  id:"alumbra/fixture-blocks",
  entry:{module:"gw.alumbra.fixture", function:"fixture-block-pack"},
};

function result(request, value) {
  return {
    format:HARA_RESULT_FORMAT,
    id:request.id,
    status:"ok",
    value,
  };
}

function routeKey(request) {
  return `${request.entry.module}/${request.entry.function}`;
}

function createProvider(routes = {}, {activation = null} = {}) {
  const state = {
    activations:[],
    requests:[],
    cancellations:[],
    disposals:0,
  };
  return {
    state,
    async activate(requestedActivation) {
      state.activations.push(requestedActivation);
      return {
        activation:activation ?? requestedActivation,
        async invoke(request, options) {
          state.requests.push({request, options});
          const route = routes[routeKey(request)];
          if (!route) throw new Error(`missing fake route ${routeKey(request)}`);
          return route(request, options);
        },
        async cancel(id, reason) {
          state.cancellations.push({id, reason});
        },
        async dispose() {
          state.disposals += 1;
        },
      };
    },
  };
}

test("activation evidence is canonical, lock-pinned and capability-free", () => {
  const normalized = normalizeHaraActivation({
    ...ACTIVATION,
    packages:[...ACTIVATION.packages].reverse(),
  });
  assert.deepEqual(normalized.packages, [
    {package:"hara:greenways/alumbra-core", version:"0.1.0"},
    {package:FIXTURE_PACKAGE, version:FIXTURE_VERSION},
  ]);
  assert(Object.isFrozen(normalized));
  assert.throws(
    () => normalizeHaraActivation({...ACTIVATION, capabilities:["network/read"]}),
    (error) => error.code === "hara/activation-capabilities",
  );
  assert.throws(
    () => normalizeHaraActivation({
      ...ACTIVATION,
      packages:[
        ...ACTIVATION.packages,
        {package:FIXTURE_PACKAGE, version:"0.2.0"},
      ],
    }),
    (error) => error.code === "hara/activation-package-duplicate",
  );
});

test("runtime block packs are invoked only through their pinned identity", async () => {
  const provider = createProvider({
    "gw.alumbra.fixture/fixture-block-pack":(request) => result(request, createFixtureBlockPack()),
  });
  const session = await createHaraRulesSession({provider, activation:ACTIVATION});
  const pack = await session.invokeBlockPack(BLOCK_PACK_REFERENCE);
  assert.equal(pack.id, "alumbra/fixture-blocks");
  assert.equal(provider.state.requests.length, 1);
  assert.deepEqual(provider.state.requests[0].request.arguments, []);
  assert.equal(provider.state.requests[0].request.package, FIXTURE_PACKAGE);

  await assert.rejects(
    session.invoke({
      package:FIXTURE_PACKAGE,
      version:"0.2.0",
      entry:{module:"gw.alumbra.fixture", function:"fixture-block-pack"},
    }),
    (error) => error.code === "hara/package-version-mismatch",
  );
  assert.equal(provider.state.requests.length, 1, "version mismatch must fail before provider invocation");
  await session.dispose();
  assert.equal(provider.state.disposals, 1);
});

test("typed generator invocation materializes the same canonical Core digest", async () => {
  const blockPack = createFixtureBlockPack();
  const {registry} = materializeBlockRegistry([blockPack], {
    id:"alumbra/runtime-fixture-blocks",
    version:FIXTURE_VERSION,
  });
  const generator = createHeightFieldFixtureGenerator({seed:17});
  const provider = createProvider({
    "gw.alumbra.generator/height-field-fixture-plan":(request) => {
      const [runtimeGenerator, coord, shape, base, fill, surfaceBlock, seed, minimum, span] = request.arguments;
      return result(request, createHeightFieldFixturePlan({
        generator:runtimeGenerator,
        coord,
        shape,
        base,
        fill,
        surfaceBlock,
        seed,
        minimum,
        span,
      }, registry));
    },
  });
  const session = await createHaraRulesSession({provider, activation:ACTIVATION});

  for (const coord of [[0, 0, 0], [-2, 0, 3], [4, -1, -5]]) {
    const shape = [8, 8, 8];
    const argumentsValue = [
      generator,
      coord,
      shape,
      "alumbra/air",
      "alumbra/fixture-soil",
      "alumbra/fixture-grass",
      17,
      2,
      5,
    ];
    const runtimePlan = await session.invokeGenerator(generator, argumentsValue, {
      registry,
      expectedCoord:coord,
      expectedShape:shape,
    });
    const directPlan = createHeightFieldFixturePlan({
      generator,
      coord,
      shape,
      base:"alumbra/air",
      fill:"alumbra/fixture-soil",
      surfaceBlock:"alumbra/fixture-grass",
      seed:17,
      minimum:2,
      span:5,
    }, registry);
    const runtimeChunk = materializeGeneratedChunk(runtimePlan, registry, {
      expectedGenerator:generator,
      expectedCoord:coord,
      expectedShape:shape,
    });
    const directChunk = materializeGeneratedChunk(directPlan, registry, {
      expectedGenerator:generator,
      expectedCoord:coord,
      expectedShape:shape,
    });
    assert.equal(
      await digestChunkSnapshot(runtimeChunk),
      await digestChunkSnapshot(directChunk),
      `digest mismatch at ${coord.join(",")}`,
    );
  }
  await session.dispose();
});

test("runtime result envelopes fail closed for authority, shape and size", async () => {
  const providers = [
    createProvider({
      "gw.alumbra.fixture/authority":(request) => ({
        ...result(request, {}),
        capabilities:["network/read"],
      }),
    }),
    createProvider({
      "gw.alumbra.fixture/nonserializable":(request) => result(request, new Date()),
    }),
    createProvider({
      "gw.alumbra.fixture/oversized":(request) => result(request, "x".repeat(512)),
    }),
  ];
  const references = ["authority", "nonserializable", "oversized"];
  const expectedCodes = [
    "hara/result-capability-request",
    "canonical/type",
    "canonical/size",
  ];

  for (let index = 0; index < providers.length; index += 1) {
    const session = await createHaraRulesSession({provider:providers[index], activation:ACTIVATION});
    await assert.rejects(
      session.invoke({
        package:FIXTURE_PACKAGE,
        version:FIXTURE_VERSION,
        entry:{module:"gw.alumbra.fixture", function:references[index]},
      }, [], {maximumBytes:index === 2 ? 64 : undefined}),
      (error) => error.code === expectedCodes[index],
    );
    await session.dispose();
  }
});

test("bounded provider error envelopes preserve only portable error evidence", async () => {
  const provider = createProvider({
    "gw.alumbra.fixture/fail":(request) => ({
      format:HARA_RESULT_FORMAT,
      id:request.id,
      status:"error",
      error:{
        code:"alumbra/fixture-failure",
        message:"fixture failed",
        data:{coordinate:[-1, 0, 2]},
      },
    }),
  });
  const session = await createHaraRulesSession({provider, activation:ACTIVATION});
  await assert.rejects(
    session.invoke({
      package:FIXTURE_PACKAGE,
      version:FIXTURE_VERSION,
      entry:{module:"gw.alumbra.fixture", function:"fail"},
    }),
    (error) => {
      assert(error instanceof HaraRuleRuntimeError);
      assert.equal(error.code, "alumbra/fixture-failure");
      assert.deepEqual(error.details.data, {coordinate:[-1, 0, 2]});
      return true;
    },
  );
  await session.dispose();
});

test("abort and disposal cancel active invocations and release the provider once", async () => {
  const provider = createProvider({
    "gw.alumbra.fixture/wait":() => new Promise(() => {}),
  });
  const session = await createHaraRulesSession({provider, activation:ACTIVATION});
  const controller = new AbortController();
  const first = session.invoke({
    package:FIXTURE_PACKAGE,
    version:FIXTURE_VERSION,
    entry:{module:"gw.alumbra.fixture", function:"wait"},
  }, [], {id:"fixture/abort", signal:controller.signal});
  controller.abort("test abort");
  await assert.rejects(first, (error) => error.code === "hara/cancelled");
  assert.deepEqual(provider.state.cancellations.map((entry) => entry.id), ["fixture/abort"]);

  const second = session.invoke({
    package:FIXTURE_PACKAGE,
    version:FIXTURE_VERSION,
    entry:{module:"gw.alumbra.fixture", function:"wait"},
  }, [], {id:"fixture/dispose"});
  await session.dispose();
  await assert.rejects(second, (error) => error.code === "hara/cancelled");
  assert.deepEqual(
    provider.state.cancellations.map((entry) => entry.id),
    ["fixture/abort", "fixture/dispose"],
  );
  assert.equal(provider.state.disposals, 1);
  await session.dispose();
  assert.equal(provider.state.disposals, 1);
  await assert.rejects(
    session.invoke({
      package:FIXTURE_PACKAGE,
      version:FIXTURE_VERSION,
      entry:{module:"gw.alumbra.fixture", function:"wait"},
    }),
    (error) => error.code === "hara/session-disposed",
  );
});

test("provider activation mismatch is rejected before any invocation", async () => {
  const mismatched = normalizeHaraActivation({
    ...ACTIVATION,
    lock:{format:1, digest:`sha256:${"9".repeat(64)}`},
  });
  const provider = createProvider({}, {activation:mismatched});
  await assert.rejects(
    createHaraRulesSession({provider, activation:ACTIVATION}),
    (error) => error.code === "hara/session-activation-mismatch",
  );
  assert.equal(provider.state.requests.length, 0);
  assert.equal(provider.state.disposals, 1);
});
