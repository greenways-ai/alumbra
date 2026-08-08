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

Architecture and implementation are tracked in #1. The first headless Core slice
is tracked in #2.

## Current slice

This repository currently contains `@greenways/alumbra-core`, a runtime-neutral
foundation for:

- namespaced block definitions and bounded block-state schemas;
- mathematical world/chunk/local coordinate conversion;
- palette-backed chunks;
- deterministic canonical binary snapshots and SHA-256 digests;
- versioned generator identities;
- conflict-checked, reversible multi-chunk block transactions.

Core has no DOM, Hodos, PlayCanvas, storage, network, inventory or game-content
dependency.

## Repository map

```text
packages/core/     headless voxel values, codecs and transactions
spec/              Alumbra format and transaction notes
scripts/           package-boundary checks
src/               Hara distribution metadata
```

Planned packages for the renderer, Hodos adapter, playable loop and game remain
separate issues and PRs.

## Development

```sh
npm ci
npm run check
npm run pack:check
```

The package requires Node.js 20 or newer for the development and test toolchain.
The public APIs themselves use standard ECMAScript, typed arrays, `TextEncoder`,
`TextDecoder`, and Web Crypto.
