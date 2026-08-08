import { deepFreeze } from "@greenways/alumbra-core";
import { normalizeBlockPack } from "./block-pack.js";
import { normalizeGeneratorDescriptor } from "./generator-plan.js";

export const FIXTURE_PACKAGE = "hara:greenways/alumbra-hara";
export const FIXTURE_VERSION = "0.1.0";

export function createFixtureBlockPack() {
  return normalizeBlockPack({
    format:"alumbra.block-pack/1",
    package:FIXTURE_PACKAGE,
    version:FIXTURE_VERSION,
    id:"alumbra/fixture-blocks",
    blocks:[
      {
        id:"alumbra/air",
        label:"Air",
        empty:true,
        material:{visible:false, opaque:false, opacity:0},
        physics:{solid:false, breakable:false, replaceable:true, hardness:0},
      },
      {
        id:"alumbra/fixture-stone",
        label:"Fixture Stone",
        material:{color:[0.42, 0.44, 0.47], gloss:0.12},
        physics:{solid:true, breakable:true, replaceable:false, hardness:3},
        drops:[{item:"alumbra/fixture-stone", count:1}],
      },
      {
        id:"alumbra/fixture-soil",
        label:"Fixture Soil",
        material:{color:[0.36, 0.25, 0.16], gloss:0.04},
        physics:{solid:true, breakable:true, replaceable:false, hardness:1},
        drops:[{item:"alumbra/fixture-soil", count:1}],
      },
      {
        id:"alumbra/fixture-grass",
        label:"Fixture Grass",
        material:{color:[0.31, 0.52, 0.28], gloss:0.08},
        physics:{solid:true, breakable:true, replaceable:false, hardness:1},
        drops:[{item:"alumbra/fixture-soil", count:1}],
      },
      {
        id:"alumbra/fixture-glass",
        label:"Fixture Glass",
        material:{opaque:false, opacity:0.4, color:[0.58, 0.82, 0.9], gloss:0.72},
        physics:{solid:true, breakable:true, replaceable:false, hardness:0.5},
      },
      {
        id:"alumbra/fixture-fern",
        label:"Fixture Fern",
        material:{opaque:false, opacity:1, color:[0.25, 0.58, 0.22], gloss:0},
        physics:{solid:false, breakable:true, replaceable:true, hardness:0},
        drops:[{item:"alumbra/fixture-fern", min:0, max:1, chance:0.35}],
      },
      {
        id:"alumbra/fixture-lamp",
        label:"Fixture Lamp",
        states:{lit:{type:"boolean", default:false}},
        material:{color:[0.78, 0.63, 0.32], emissive:[0.4, 0.24, 0.08], gloss:0.35},
        physics:{solid:true, breakable:true, replaceable:false, hardness:2},
        emittedLight:12,
        onUse:{module:"gw.alumbra.game", function:"toggle-fixture-lamp"},
      },
    ],
    metadata:{purpose:"cross-runtime deterministic fixtures"},
  });
}

export function createFlatFixtureGenerator({seed = 0} = {}) {
  return normalizeGeneratorDescriptor({
    format:"alumbra.generator/1",
    package:FIXTURE_PACKAGE,
    version:FIXTURE_VERSION,
    id:"alumbra/fixture-flat",
    seed,
    entry:{module:"gw.alumbra.generator", function:"flat-fixture-plan"},
    parameters:{surface:3},
  });
}

export function createHeightFieldFixtureGenerator({seed = 0} = {}) {
  return normalizeGeneratorDescriptor({
    format:"alumbra.generator/1",
    package:FIXTURE_PACKAGE,
    version:FIXTURE_VERSION,
    id:"alumbra/fixture-height-field",
    seed,
    entry:{module:"gw.alumbra.generator", function:"height-field-fixture-plan"},
    parameters:{minimum:2, span:5},
  });
}

export const FIXTURE_WORLD_RULE = deepFreeze({
  package:FIXTURE_PACKAGE,
  version:FIXTURE_VERSION,
  id:"alumbra/fixture-rules",
  entry:{module:"gw.alumbra.game", function:"handle-fixture-interaction"},
});
