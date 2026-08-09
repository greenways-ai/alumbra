# @greenways/alumbra-history

Storage-neutral region history, checkpoints and ordered transaction replay for
canonical Alumbra worlds.

The package defines durable boundaries over existing Core values:

```text
world checkpoint
  → deterministic region manifests
    → canonical chunk snapshot digests
  + ordered accepted Core transactions
```

It does not persist individual blocks or transient engine state. Player frames,
worker jobs, mesh buffers, PlayCanvas resources, browser handles and Hodos
components remain outside the package.

## Checkpoints

```js
import {
  createWorldCheckpoint,
  restoreWorldCheckpoint,
} from "@greenways/alumbra-history";

const bundle = await createWorldCheckpoint({
  id: "history/frontier-001",
  world: { id: "world:frontier", version: "0.1.0" },
  sequence: 42,
  chunks,
  registry,
  regionShape: [8, 4, 8],
  pins: {
    generator: {
      package: "hara:greenways/alumbra-hara",
      version: "0.1.0",
      id: "alumbra/fixture-height-field",
      seed: "17",
    },
  },
});

const restored = await restoreWorldCheckpoint({
  checkpoint: bundle.checkpoint,
  regions: bundle.regions,
  getSnapshot: bundle.getSnapshot,
  registry,
});
```

A checkpoint contains plain, bounded manifests only. Snapshot bytes are exposed
through an injected reader boundary so a later store may deduplicate them by
digest without changing history semantics.

## History sessions

```js
import { createHistorySession } from "@greenways/alumbra-history";

const history = createHistorySession({
  world,
  registry,
  chunks,
  regionShape: [8, 4, 8],
  pins,
});

await history.checkpoint({
  id: "history/start",
  name: "history/start",
  setBase: true,
});

await history.append({
  sequence: 1,
  transaction: acceptedCoreTransaction,
});

await history.restore("history/start");
```

The session requires contiguous caller-supplied sequence numbers. Rejected or
stale transactions do not change chunks, sequence or history records. Replay
calls Core for every transaction and verifies the recorded semantic world head.

Compaction captures the current chunks into a new base checkpoint, clears the
covered transaction prefix and proves that the revision-neutral semantic head
did not change.

## Authority boundary

`@greenways/alumbra-history` depends only on `@greenways/alumbra-core`.

It imports no DOM, PlayCanvas, Hodos, Hestia, Ignatius, Tahto, OPFS, filesystem,
network or storage implementation. Service adapters may store checkpoint
manifests and snapshot bytes, but they do not own region addressing,
reconstruction, transaction ordering or semantic-head verification.
