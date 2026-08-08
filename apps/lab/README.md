# Alumbra playable voxel laboratory

The laboratory composes Alumbra Core, Engine and the PlayCanvas renderer into the
first persistent build loop:

- deterministic `4 × 4` generated chunks;
- fixed-step player movement, gravity, jumping and voxel collision;
- DDA block selection with a six-block reach;
- left-click break and right-click place intents;
- eight original selectable blocks;
- app-owned append-only transaction history and inverse undo;
- canonical chunk snapshots and exact-world local restoration;
- ordered persistence that prevents stale saves from overwriting newer ones.

From the repository root:

```sh
npm run lab:serve
```

Open `http://127.0.0.1:4173/apps/lab/` and click the viewport to capture the
pointer.

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
and Engine remain headless packages. Browser pointer lock, hotbar state,
`localStorage`, save timing and status UI remain application services.

The lab does not yet implement inventory quantities, crafting, health, creatures,
public multiplayer or survival progression.
