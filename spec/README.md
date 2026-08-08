# Alumbra formats

Alumbra owns voxel and game-engine formats above Hodos.

The current implementation contracts are:

- [Chunk format](chunk-format.md) — canonical Core chunk snapshots;
- [Block transactions](transactions.md) — conflict-checked reversible mutations;
- [Local world save](world-save.md) — browser-owned exact-world persistence,
  history and safe player restoration;
- [Hara rules](hara-rules.md) — portable block packs, generator plans, world
  extensions and interaction results.

Chunk and transaction formats belong to the headless Core boundary. The first
save envelope is an application format above Core and Engine; it deliberately
does not move browser storage into either package. Hara rule formats describe
bounded portable values that a trusted host validates and materializes through
Core; they do not contain dense chunks or host objects.

These are early `0.x` formats. They are deterministic and tested but are not
promised stable until explicitly marked so.
