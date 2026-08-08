# @greenways/alumbra-hara

Portable Hara rule formats and a runtime-neutral host adapter for Alumbra.

The package defines and validates:

- `alumbra.block-pack/1` — package-pinned block declarations;
- `alumbra.generator/1` — deterministic generator identity and Hara entry points;
- `alumbra.generated-chunk/1` — bounded base/region/override chunk plans;
- `alumbra.world-extension/1` — the Alumbra-owned `world.edn` extension;
- `alumbra.interaction/1` — Core transactions, capability effects and feedback;
- `alumbra.hara-activation/1` — exact project, lock and package evidence for a runtime session;
- `alumbra.hara-invocation/1` and `alumbra.hara-result/1` — bounded host/runtime transport.

Hara carries portable values and plans. The host validates them and materializes
canonical `@greenways/alumbra-core` registries, chunks and transactions. Hara
programs never receive typed voxel arrays, renderer entities, browser handles,
keys or ambient network/storage authority.

## Direct portable materialization

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

## Injected runtime sessions

`createHaraRulesSession` accepts a provider rather than importing one VM. The
provider owns source loading, compilation, workers and runtime handles. Alumbra
owns the activation evidence, invocation envelope, bounded values and typed
post-validation.

```js
import { createHaraRulesSession } from "@greenways/alumbra-hara/runtime";

const session = await createHaraRulesSession({
  provider: haraRuntimeProvider,
  activation: {
    format: "alumbra.hara-activation/1",
    project: {
      id: "greenways/alumbra-hara",
      version: "0.1.0",
      digest: projectDigest,
    },
    lock: { format: 1, digest: lockDigest },
    packages: [
      { package: "hara:greenways/alumbra-hara", version: "0.1.0" },
      { package: "hara:greenways/alumbra-core", version: "0.1.0" },
    ],
    capabilities: [],
  },
});

const plan = await session.invokeGenerator(generator, [
  generator,
  [-1, 0, 1],
  [16, 16, 16],
  "alumbra/air",
  "alumbra/fixture-soil",
  "alumbra/fixture-grass",
  17,
  2,
  5,
], {
  registry,
  expectedCoord: [-1, 0, 1],
  expectedShape: [16, 16, 16],
});

await session.dispose();
```

A provider activation must return the exact normalized project, lock and package
evidence it accepted. Version mismatches fail before invocation. Results use a
closed success/error envelope, are canonicalized under byte limits, and cannot
request ambient capabilities. Abort and disposal propagate to provider-owned
sessions without allowing runtime objects into manifests, chunks or transactions.

The included flat and integer height-field fixtures are mirrored by HAL entry
points under `gw.alumbra.generator`. The next conformance layer supplies a real
Hara provider and runs the HAL contract suite and cross-runtime digest matrix in
CI while preserving this provider-neutral package boundary.
