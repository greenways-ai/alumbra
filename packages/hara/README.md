# @greenways/alumbra-hara

Portable Hara rule formats and a runtime-neutral host adapter for Alumbra.

The package defines and validates:

- `alumbra.block-pack/1` — package-pinned block declarations;
- `alumbra.generator/1` — deterministic generator identity and Hara entry points;
- `alumbra.generated-chunk/1` — bounded base/region/override chunk plans;
- `alumbra.world-extension/1` — the Alumbra-owned `world.edn` extension;
- `alumbra.interaction/1` — Core transactions, capability effects and feedback.

Hara carries portable values and plans. The host validates them and materializes
canonical `@greenways/alumbra-core` registries, chunks and transactions. Hara
programs never receive typed voxel arrays, renderer entities, browser handles,
keys or ambient network/storage authority.

```js
import {
  createFixtureBlockPack,
  createHeightFieldFixturePlan,
  createHeightFieldFixtureGenerator,
  materializeBlockRegistry,
  materializeGeneratedChunk,
} from "@greenways/alumbra-hara";

const { registry } = materializeBlockRegistry([
  createFixtureBlockPack(),
], {
  id: "alumbra/example-blocks",
  version: "0.1.0",
});

const generator = createHeightFieldFixtureGenerator({ seed: 17 });
const plan = createHeightFieldFixturePlan({
  generator,
  coord: [-1, 0, 1],
  shape: [16, 16, 16],
  base: "alumbra/air",
  fill: "alumbra/fixture-soil",
  surfaceBlock: "alumbra/fixture-grass",
  seed: 17,
}, registry);

const chunk = materializeGeneratedChunk(plan, registry, {
  expectedGenerator: generator,
  expectedCoord: [-1, 0, 1],
});
```

The included flat and integer height-field fixtures are mirrored by HAL entry
points under `gw.alumbra.generator`. Actual runtime activation and cross-runtime
digest parity are tracked separately so this package does not bind itself to one
Hara VM implementation.
