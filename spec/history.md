# Alumbra world history

Alumbra history records durable world boundaries without turning individual
blocks or transient engine frames into durable objects.

## Formats

```text
alumbra.chunk-snapshot-record/1
alumbra.region-manifest/1
alumbra.world-checkpoint/1
alumbra.history-transaction/1
alumbra.semantic-world-head/1
```

## Region addressing

A fixed region shape is expressed in chunks. Each chunk coordinate maps through
mathematical floor division:

```text
region[axis] = floor(chunk[axis] / region-shape[axis])
local[axis]  = positive-mod(chunk[axis], region-shape[axis])
```

This rule applies equally to positive and negative coordinates. For a region
shape of `[8 4 8]`, chunk `[-1 -1 -1]` belongs to region `[-1 -1 -1]` at local
coordinate `[7 3 7]`.

## Checkpoint graph

```text
world checkpoint root
  → ordered region references
      → region manifest root
          → ordered chunk snapshot records
              → canonical alumbra.chunk-snapshot/1 bytes
```

A chunk snapshot record carries:

- exact chunk coordinate, shape and revision;
- canonical snapshot digest and byte length;
- revision-neutral content digest;
- local coordinate within its region.

The region root is the SHA-256 digest of its canonical manifest body. The
checkpoint root covers world identity, sequence, installed registry evidence,
generator/rule pins, ordered region references, metadata and semantic head.

## Semantic world head

The semantic head is independent of checkpoint identity, label, metadata,
transaction-log compaction and chunk revision counters. It covers:

- world identity and version;
- exact block-registry identity/version/digest;
- generator and rule pins;
- ordered chunk coordinates and revision-neutral content digests.

Therefore a compaction may replace a transaction prefix with fresh canonical
snapshots only when the semantic head remains identical.

## Ordered transaction history

Each accepted history record contains:

- a contiguous caller-supplied sequence;
- one validated `alumbra.block-transaction/1`;
- the exact affected region coordinates;
- the resulting semantic head digest.

Replay starts from a verified checkpoint, applies every record through Alumbra
Core and checks both affected-region evidence and the resulting semantic head.
A stale sequence, Core conflict or mismatched head fails before the record is
accepted.

## Restoration

Restoration verifies, in order:

1. installed block-registry evidence;
2. checkpoint root;
3. exact region count and each region root;
4. every referenced snapshot digest;
5. chunk coordinate, shape, revision and encoded length;
6. revision-neutral content digests;
7. reconstructed semantic world head.

No partially reconstructed world is returned after a failed verification.

## Authority

Alumbra History owns addressing, manifest formats, ordering, replay,
reconstruction and compaction semantics.

Alumbra Core owns canonical chunks, snapshot bytes and transaction application.

Blob stores, OPFS, Hestia, Ignatius and Tahto may supply or persist bytes through
later adapters. Hodos may project bounded status and errors. None of those
services owns history semantics.
