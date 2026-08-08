import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCK_PACK_FORMAT,
  blockDeclarationToCore,
  createFixtureBlockPack,
  materializeBlockRegistry,
  normalizeBlockPack,
} from "../src/index.js";

test("fixture block pack covers portable render, physics, state and interaction declarations", () => {
  const pack = createFixtureBlockPack();
  assert.equal(pack.format, BLOCK_PACK_FORMAT);
  assert.equal(pack.blocks.length, 7);
  const air = pack.blocks.find((block) => block.id === "alumbra/air");
  const glass = pack.blocks.find((block) => block.id === "alumbra/fixture-glass");
  const fern = pack.blocks.find((block) => block.id === "alumbra/fixture-fern");
  const lamp = pack.blocks.find((block) => block.id === "alumbra/fixture-lamp");
  assert.equal(air.empty, true);
  assert.equal(air.material.visible, false);
  assert.equal(glass.material.opaque, false);
  assert.equal(fern.physics.solid, false);
  assert.equal(lamp.states.lit.default, false);
  assert.equal(lamp.emittedLight, 12);
  assert.deepEqual(lamp.onUse, {module:"gw.alumbra.game", function:"toggle-fixture-lamp"});
});

test("materialized packs become one canonical Core registry with source evidence", () => {
  const pack = createFixtureBlockPack();
  const result = materializeBlockRegistry([pack], {
    id:"alumbra/test-registry",
    version:"7.0.0",
  });
  assert.equal(result.registry.id, "alumbra/test-registry");
  assert.equal(result.registry.version, "7.0.0");
  assert.equal(result.registry.emptyBlock, "alumbra/air");
  const lamp = result.registry.get("alumbra/fixture-lamp");
  assert.equal(lamp.metadata.render.emissive[0], 0.4);
  assert.equal(lamp.metadata.physics.solid, true);
  assert.equal(lamp.metadata.onUse.module, "gw.alumbra.game");
  assert.equal(result.sources.find((entry) => entry.block === lamp.id).pack, pack.id);
});

test("block pack validation rejects duplicate IDs and unsafe empty definitions", () => {
  const pack = createFixtureBlockPack();
  assert.throws(() => normalizeBlockPack({...pack, blocks:[pack.blocks[0], pack.blocks[0]]}), /duplicate block/i);
  assert.throws(() => normalizeBlockPack({
    format:BLOCK_PACK_FORMAT,
    package:"hara:greenways/test",
    version:"0.1.0",
    id:"test/invalid",
    blocks:[{
      id:"test/air",
      empty:true,
      material:{visible:true, opaque:false},
      physics:{solid:false},
    }],
  }), /empty blocks must be invisible/i);
});

test("block metadata cannot override normalized engine-facing fields", () => {
  const value = blockDeclarationToCore({
    id:"test/stone",
    material:{color:[0.1, 0.2, 0.3]},
    physics:{solid:true},
    metadata:{render:{color:[1, 0, 0]}, physics:{solid:false}},
  });
  assert.deepEqual(value.metadata.render.color, [0.1, 0.2, 0.3]);
  assert.equal(value.metadata.physics.solid, true);
});
