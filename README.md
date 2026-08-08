# Alumbra

**Alumbra is the voxel-first engine and game layer for Greenways.**

It owns dense voxel state, deterministic world generation, simulation,
engine-specific rendering and game behavior. Hodos remains the generic
Workspace, projection, capability and semantic-interaction boundary.

```text
Hara language/runtime and browser services
                    ↓
                  Hodos
                    ↓
         @greenways/alumbra-hodos
                    ↓
             Alumbra engine
                    ↓
              Alumbra game
```

The dependency direction is one-way:

```text
Alumbra → Hodos
Hodos   ✕ Alumbra
```

Architecture and implementation are tracked in #1. The headless Core slice is
tracked in #2, the first renderer laboratory in #3, the Workspace integration in
#4 and the playable sequence in #5, #13 and #14.

## Current packages

### `@greenways/alumbra-core`

A runtime-neutral foundation for:

- namespaced block definitions and bounded block-state schemas;
- mathematical world/chunk/local coordinate conversion;
- palette-backed chunks;
- deterministic canonical binary snapshots and SHA-256 digests;
- versioned generator identities;
- conflict-checked, reversible multi-chunk block transactions.

Core has no DOM, Hodos, PlayCanvas, storage, network, inventory or game-content
dependency.

### `@greenways/alumbra-engine`

A headless hot-state engine over canonical Core chunks:

- bounded fixed-step accumulation;
- upright player-body collision with deterministic substeps;
- gravity, grounding, jumping and yaw-relative movement;
- explicit loaded/missing-chunk collision policy;
- reach- and occupancy-checked break/place intents;
- accepted Core transactions, affected-chunk evidence and inverse undo history.

The engine receives semantic input and caller-supplied transaction IDs. It has no
DOM, input-device, renderer, storage, Hodos or game-economy dependency.

### `@greenways/alumbra-renderer-playcanvas`

A browser projection package containing:

- deterministic exposed-face and greedy-quad meshing;
- cross-chunk boundary-face removal;
- three-dimensional DDA voxel picking;
- view-distance chunk selection;
- reference-counted PlayCanvas mesh and material resources;
- an injected PlayCanvas adapter and disposable laboratory controls.

PlayCanvas is an optional peer. Pure geometry, traversal, visibility and
resource-lifecycle tests run without a browser or GPU. The package owns no game
rules and has no Hodos dependency.

### `@greenways/alumbra-hodos`

The Alumbra-owned integration boundary for registering `alumbra.world/viewport`
as a trusted Hodos Workspace component. It validates a bounded serializable
viewport model and adapts an injected engine/renderer host without moving chunks,
workers, GPU resources or block authority into Hodos.

Hodos Web and Workspace UI remain optional peers. The adapter contains no Hodos
implementation code and preserves the one-way dependency `Alumbra → Hodos`.

## Voxel laboratory

The checked-in browser lab projects a deterministic 4 × 4 chunk terrain with
free-flight controls and block-face selection:

```sh
npm run lab:serve
```

Then open `http://127.0.0.1:4173/apps/lab/`. The lab pins its browser-only
PlayCanvas ESM import. The headless collision and build engine is packaged, but
the current lab has not yet connected movement, block mutations or persistence;
that integration is tracked by #14.

## Repository map

```text
packages/core/                    headless voxel values, codecs and transactions
packages/engine/                  fixed-step player, collision and build intents
packages/renderer-playcanvas/     pure meshing plus the PlayCanvas host adapter
packages/hodos/                   trusted Hodos Workspace component adapter
apps/lab/                         first interactive renderer consumer
spec/                             Alumbra format and transaction notes
scripts/                          syntax, boundary and lab-server checks
src/                              Hara distribution metadata
```

The engine, renderer and Hodos integration are independently packaged. The
persistent playable loop and game packages remain separate issues and PRs.

## Development

```sh
npm ci
npm run check
npm run pack:check
npm run lab:serve
```

The repository requires Node.js 20 or newer for development and testing.
