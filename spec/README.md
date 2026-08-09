# Alumbra formats

Alumbra owns voxel and game-engine formats above Hodos.

The current implementation contracts are:

- [Chunk format](chunk-format.md) — canonical Core chunk snapshots;
- [Block transactions](transactions.md) — conflict-checked reversible mutations;
- [Voxel lighting](lighting.md) — deterministic hot sunlight and emitted-light
  fields with bounded invalidation and revision-fenced installation;
- [Mesh lighting handoff](mesh-lighting.md) — cloneable field snapshots,
  light-aware greedy mesh attributes and worker evidence fencing;
- [Viewport lighting coordination](viewport-lighting.md) — loaded-world
  orchestration, bounded remeshing and stale asynchronous result fencing;
- [World history](history.md) — region manifests, checkpoint roots, ordered
  transaction replay and semantic-head verification;
- [History store](history-store.md) — content-addressed snapshot archives and
  write-last manifest publication;
- [Local world save](world-save.md) — browser-owned exact-world persistence,
  history and safe player restoration;
- [Hara rules](hara-rules.md) — portable block packs, generator plans, world
  extensions and interaction results.

Chunk and transaction formats belong to the headless Core boundary. Engine
lighting is deterministic but deliberately hot and reconstructible: dense light
arrays stay outside durable history, Hara values and Hodos models. The renderer
accepts copied target/cardinal light snapshots and owns only derived mesh
attributes and bounded source evidence; it never imports the Engine runtime. The
viewport owns only orchestration across current chunks, fields, meshes and
renderer resources, with request-version fencing and bounded lifecycle evidence.
World history is a storage-neutral package over Core values: it defines region
addressing, checkpoint/replay semantics and content verification without
choosing OPFS, Hestia, Ignatius, Tahto or another store. History Store owns the
canonical archive envelope and injected content-addressed byte protocol, while
remaining independent of any concrete browser, private or remote store. The
first save envelope is an application format above Core and Engine; it
deliberately does not move browser storage into either package. Hara rule formats
describe bounded portable values that a trusted host validates and materializes
through Core; they do not contain dense chunks or host objects.

These are early `0.x` formats. They are deterministic and tested but are not
promised stable until explicitly marked so.
