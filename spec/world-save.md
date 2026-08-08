# Alumbra local world save

`alumbra.world-save/1` is the first local, browser-owned persistence envelope for
an Alumbra world. It is an application format above Core and Engine; neither
package reads browser storage.

## Envelope

```json
{
  "format": "alumbra.world-save/1",
  "world": {
    "id": "world:alumbra/lab",
    "revision": 12,
    "digest": "sha256:...",
    "snapshotDigest": "sha256:..."
  },
  "generator": {
    "package": "hara:greenways/alumbra-lab",
    "version": "0.1.0",
    "id": "alumbra/lab-terrain",
    "seed": "alumbra-lab-2026-08"
  },
  "registry": {
    "id": "alumbra/lab-blocks",
    "version": "0.1.0",
    "digest": "sha256:..."
  },
  "player": {},
  "chunks": [],
  "journal": [],
  "undoStack": [],
  "saveSequence": 18,
  "transactionSequence": 7,
  "savedAt": "2026-08-08T00:00:00.000Z"
}
```

## Identity

Restoration is exact-world. The loader verifies:

- world identity;
- normalized generator package, version, ID and seed;
- block-registry ID, version and canonical-definition digest;
- every chunk coordinate, key, shape and revision;
- every chunk snapshot digest;
- the aggregate snapshot and content digests.

Identity mismatches fail rather than silently migrating a world to another
generator or block pack.

## Chunk evidence

Each chunk entry contains the canonical `alumbra.chunk-snapshot/1` bytes encoded
as canonical base64 and two SHA-256 digests:

- `digest` covers the exact snapshot including its monotonic chunk revision;
- `contentDigest` hashes the same canonical chunk with revision zero.

The world `snapshotDigest` commits to sorted chunk keys, revisions and exact
snapshot digests. The world `digest` commits to sorted chunk keys and
revision-neutral content digests.

This distinction allows undo to prove restoration of the exact previous voxel
content without claiming that chunk revisions move backwards.

## History

`journal` is append-only accepted transaction evidence. A normal build appends
the accepted transaction. Undo appends its accepted inverse transaction.

`undoStack` contains the original accepted transactions that remain undoable.
It is separate from the journal so the journal never loses historical evidence.
After reload, the application constructs a revision-checked inverse against the
current chunk revisions and applies it atomically through Core.

## Ordering

`saveSequence` orders browser persistence attempts. The storage adapter serializes
writes and does not let an older queued request acknowledge or overwrite a newer
request. `transactionSequence` continues deterministic caller-supplied build IDs
after reload. `world.revision` is the application-level accepted-action revision.

## Player restoration

Player state is bounded serializable Engine state. The loader tests the restored
body against canonical chunks. If it intersects a block or unloaded solid space,
the application uses a known fallback position and scans upward within a bounded
range. Per-frame movement, input handles and renderer state are never stored.

## Bounds

The first implementation limits:

- chunks to 4,096;
- journal and undo stack to 4,096 transactions each;
- decoded/canonical save data to 64 MiB;
- player, transaction, block and metadata values to their Core/Engine validators.

GPU objects, PlayCanvas entities, workers, DOM nodes, callbacks, private keys and
ambient capabilities are invalid save content.
