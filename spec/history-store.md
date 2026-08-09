# Alumbra history archives

`alumbra.history-archive/1` is the content-addressed persistence envelope for
storage-neutral Alumbra history.

## Archive body

The canonical archive contains:

- archive identity;
- one base checkpoint root;
- verified checkpoint and region manifests;
- optional caller-named checkpoint references;
- ordered accepted history transaction records after the base;
- a sorted unique snapshot-digest index;
- exact head sequence and semantic world-head digest;
- bounded descriptive metadata.

The archive itself is encoded as canonical UTF-8 JSON and addressed by its
SHA-256 digest.

## Blob ordering

Saving follows write-last publication:

1. verify every checkpoint bundle and replay the transaction suffix;
2. collect the unique referenced canonical chunk snapshot digests;
3. write missing snapshot bytes by digest;
4. encode and digest the canonical archive manifest;
5. write the manifest blob last;
6. return its digest to the caller.

The package does not mutate a current-head pointer. Therefore a failed step 5
cannot replace or corrupt a previously readable archive identity.

## Loading

Loading verifies:

1. requested archive blob digest;
2. canonical UTF-8 JSON encoding and closed archive fields;
3. base and named checkpoint roots;
4. region manifests and snapshot index;
5. every snapshot blob digest;
6. Core reconstruction and ordered transaction replay;
7. final head sequence and semantic world-head digest.

No partial world is returned after a failed check.

## Deduplication

Snapshot bytes are stored once per SHA-256 digest, even when several named
checkpoints reference the same canonical chunk snapshot. Archive manifests are
also content-addressed, so identical archive values share one identity.

## Store boundary

The injected store exposes only:

```text
has(digest)
put(digest, bytes)
get(digest)
delete?(digest)
```

OPFS, Hestia, Ignatius, Tahto and remote object stores remain separate adapters.
