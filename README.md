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

Architecture and implementation are tracked in #1. Core, renderer, Hodos
integration, the headless player/build engine and the persistent playable lab
are established under #2, #3, #4 and #5. Portable package-driven Hara rules are
tracked under #6 and #17.

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

### `@greenways/alumbra-hara`

The portable rules and host-validation boundary for:

- package-pinned block packs with material, physics, drops and bounded state;
- deterministic generator descriptors and bounded generated-chunk plans;
- Alumbra-owned `world.edn` extensions;
- validated interaction results carrying Core transactions, effects and feedback;
- matching flat and integer height-field fixtures in JavaScript and HAL.

Hara programs exchange declarations and plans rather than dense typed arrays or
host objects. The trusted host validates those values and materializes canonical
Core registries, chunks and transactions. Runtime activation is injected and
tracked separately so the package does not bind Alumbra to Hodos or one Hara VM.

## Playable voxel laboratory

The checked-in browser lab composes the packages into a deterministic local
build loop:

```sh
npm run lab:serve
```

Open `http://127.0.0.1:4173/apps/lab/` and click the viewport. The lab supports
WASD movement, gravity, collision, jumping, break/place, an eight-block hotbar,
inverse undo and exact-world local save/reload.

Browser-owned `alumbra.world-save/1` envelopes pin the world, generator and block
registry; validate every canonical chunk snapshot; preserve append-only
transaction evidence; continue deterministic transaction IDs; and recover the
player through a bounded safe-spawn check. Renderer and input objects are never
persisted.

Inventory quantities, crafting, creatures, health, survival progression and
public realms remain later game packages.

## Repository map

```text
packages/core/                    headless voxel values, codecs and transactions
packages/engine/                  fixed-step player, collision and build intents
packages/renderer-playcanvas/     pure meshing plus the PlayCanvas host adapter
packages/hodos/                   trusted Hodos Workspace component adapter
packages/hara/                    portable Hara rules and Core materialization
apps/lab/                         persistent local playable renderer consumer
spec/                             chunk, transaction, save and rules formats
scripts/                          syntax, boundary and lab-server checks
src/                              Hara distribution metadata
```

## Development

```sh
npm ci
npm run check
npm run pack:check
npm run lab:serve
```

The repository requires Node.js 20 or newer for development and testing.
