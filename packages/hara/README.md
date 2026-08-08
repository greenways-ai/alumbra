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

## Real-runtime conformance

The repository includes an executable fixture namespace at
`gw.alumbra.fixture`, a HAL `std.lib.test` suite and a Node reference provider in
`scripts/hara-cli-provider.js`. The provider runs a pinned Hara CLI without
network, process or key authority, checks exact `project.edn` and
`project.lock.edn` digests, and transports only JSON-compatible values through
the public session contract.

CI builds Hara from the reviewed commit pinned in `.github/workflows/ci.yml`,
executes the packaged HAL tests, then compares Core snapshot digests for flat and
integer height-field plans across positive and negative chunk coordinates. It
also proves fail-closed behavior for lock mismatch, capability requests,
malformed plans, non-JSON values and oversized results.

```sh
hara --project packages/hara --no-color --no-splash test
HARA_BIN=/path/to/hara npm run check:hara-runtime
```

The CLI provider is conformance evidence rather than a dependency of the
published package. Browser workers, embedded runtimes and future Hodos hosts can
implement the same injected provider contract without changing portable Alumbra
rules or Core materialization.
