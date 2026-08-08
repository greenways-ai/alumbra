import {
  createFixtureBlockPack,
  createFlatFixtureGenerator,
  createHeightFieldFixtureGenerator,
  materializeBlockRegistry,
} from "../src/index.js";

export function fixtureRegistry() {
  return materializeBlockRegistry([createFixtureBlockPack()], {
    id:"alumbra/fixture-registry",
    version:"0.1.0",
  }).registry;
}

export const flatGenerator = () => createFlatFixtureGenerator({seed:17});
export const heightGenerator = () => createHeightFieldFixtureGenerator({seed:17});
