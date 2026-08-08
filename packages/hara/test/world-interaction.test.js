import assert from "node:assert/strict";
import test from "node:test";
import {
  ALUMBRA_WORLD_EXTENSION_KEY,
  FIXTURE_WORLD_RULE,
  createFixtureBlockPack,
  createFlatFixtureGenerator,
  normalizeInteractionResult,
  normalizeWorldExtension,
  readAlumbraWorldExtension,
  withAlumbraWorldExtension,
} from "../src/index.js";
import { fixtureRegistry } from "./fixtures.js";

test("world extension pins block packs, generator and rule entry identities", () => {
  const pack = createFixtureBlockPack();
  const extension = normalizeWorldExtension({
    format:"alumbra.world-extension/1",
    blockPacks:[{package:pack.package, version:pack.version, id:pack.id}],
    generator:createFlatFixtureGenerator({seed:9}),
    rules:[FIXTURE_WORLD_RULE],
    mode:"creative",
    state:{day:0},
  });
  const world = withAlumbraWorldExtension({
    "hodos/type":"world",
    "world/id":"world:test/alumbra",
  }, extension);
  assert.equal(world[ALUMBRA_WORLD_EXTENSION_KEY].generator.seed, "9");
  assert.equal(readAlumbraWorldExtension(world).rules[0].entry.function, "handle-fixture-interaction");
  assert.throws(() => withAlumbraWorldExtension(world, extension), /already contains/i);
});

test("world extension rejects executable or duplicate package content", () => {
  const pack = createFixtureBlockPack();
  const generator = createFlatFixtureGenerator();
  const ref = {package:pack.package, version:pack.version, id:pack.id};
  assert.throws(() => normalizeWorldExtension({
    blockPacks:[ref, ref],
    generator,
    rules:[],
  }), /duplicate package/i);
  assert.throws(() => normalizeWorldExtension({
    blockPacks:[ref],
    generator,
    rules:[],
    state:{run() {}},
  }), /unsupported/i);
});

test("interaction results validate Core transactions, effects and feedback", () => {
  const registry = fixtureRegistry();
  const interaction = normalizeInteractionResult({
    format:"alumbra.interaction/1",
    id:"alumbra/use-fixture",
    transactions:[{
      id:"alumbra/place-fixture",
      expectedRevisions:[{chunk:[0, 0, 0], revision:0}],
      changes:[{
        chunk:[0, 0, 0],
        local:[1, 2, 3],
        before:"alumbra/air",
        after:"alumbra/fixture-stone",
      }],
      metadata:{source:"fixture"},
    }],
    effects:[{
      capability:"audio/output",
      operation:"audio/play",
      requestId:"alumbra/fixture-sound",
      arguments:{resource:"resource:alumbra/stone"},
    }],
    feedback:[{
      kind:"text",
      code:"alumbra/block-placed",
      message:"Placed fixture stone",
      data:{position:[1, 2, 3]},
    }],
  }, registry);
  assert.equal(interaction.transactions[0].format, "alumbra.block-transaction/1");
  assert.equal(interaction.effects[0].operation, "audio/play");
  assert.equal(interaction.feedback[0].kind, "text");
  assert(Object.isFrozen(interaction));
});

test("interaction results fail closed for empty or host-owned values", () => {
  const registry = fixtureRegistry();
  assert.throws(() => normalizeInteractionResult({id:"alumbra/empty"}, registry), /must contain/i);
  assert.throws(() => normalizeInteractionResult({
    id:"alumbra/bad",
    effects:[{
      capability:"audio/output",
      operation:"audio/play",
      arguments:{callback() {}},
    }],
  }, registry), /unsupported/i);
  assert.throws(() => normalizeInteractionResult({
    id:"alumbra/bad-feedback",
    feedback:[{kind:"telepathy", data:{}}],
  }, registry), /unsupported interaction feedback/i);
});
