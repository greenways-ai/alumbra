# Alumbra playable voxel laboratory

The laboratory is the integrated Renderer Catalog host. It composes Alumbra
Core, Engine, `@greenways/alumbra-viewport-playcanvas` and the package-pinned
Hara world boundary into persistent, multi-session and exact-package stories:

- deterministic `4 × 4` generated chunks for the persistent local world;
- fixed-step player movement, gravity, jumping and voxel collision;
- DDA block selection with a six-block reach;
- left-click break and right-click place intents;
- app-owned append-only transaction history and inverse undo;
- canonical chunk snapshots and exact-world local restoration;
- ordered persistence that prevents stale saves from overwriting newer ones;
- one reusable viewport that suspends and resumes the same canonical world;
- two independently owned worlds, players, frame clocks and renderer sessions;
- a package-pinned Hara block pack and height-field generator materialized into
  Core chunks and a separate PlayCanvas viewport;
- default-seed, negative-coordinate and descriptive package-mismatch states;
- bounded Catalog evidence for package identity, generator identity, snapshot
  digests, negative-coordinate parity and renderer disposal.

From the repository root:

```sh
npm run lab:serve
```

Open `http://127.0.0.1:4173/apps/lab/`, select an installed activity in the
Renderer Catalog, and click a viewport to capture the pointer.

```text
WASD       move
Space      jump
Left       break selected block
Right      place selected hotbar block
1–8        select block
Wheel      cycle block
Z/Ctrl-Z   undo latest accepted build
```

The page pins the browser-only PlayCanvas ESM build through an import map. Core
and Engine remain headless. The viewport package owns PlayCanvas projection,
input sampling, picking, suspension, resumption and disposal. The lab keeps
`localStorage`, save timing, hotbar DOM and status UI as application services.
The packaged Hara story is not written into the persistent local-world save.

The browser Showcase provider uses the deterministic JavaScript mirror of the
packaged Hara fixture through the same `loadPackagedHaraWorld` composition API.
The real-Hara CI job invokes the actual pinned Hara CLI and proves that the block
pack, generator plans and Core snapshot digests are identical. The mismatch
story is normal descriptive data and does not execute an adversarial fixture.

Catalog events select installed semantic identities only. The visible Catalog
never receives the project path, canonical chunks, Hara sessions, PlayCanvas
objects, player runtime or renderer resources.

The lab does not yet implement inventory quantities, crafting, health, creatures,
public multiplayer or survival progression.
