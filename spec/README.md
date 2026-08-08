# Alumbra formats

Alumbra owns voxel and game-engine formats above Hodos.

The current implementation contracts are:

- [Chunk format](chunk-format.md) — canonical Core chunk snapshots;
- [Block transactions](transactions.md) — conflict-checked reversible mutations;
- [Local world save](world-save.md) — browser-owned exact-world persistence,
  history and safe player restoration.

Chunk and transaction formats belong to the headless Core boundary. The first
save envelope is an application format above Core and Engine; it deliberately
does not move browser storage into either package.

These are early `0.x` formats. They are deterministic and tested but are not
promised stable until explicitly marked so.
