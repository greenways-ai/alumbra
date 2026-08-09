# @greenways/alumbra-history-store

Content-addressed archive storage for verified Alumbra world history.

The package takes storage-neutral checkpoints and transaction records from
`@greenways/alumbra-history`, stores canonical chunk snapshot bytes once by
SHA-256 digest, then publishes one canonical archive manifest **last**.

```text
verified checkpoint bundle
  + ordered history records
  + named checkpoint bundles
        ↓
unique snapshot blobs by sha256
        ↓
canonical alumbra.history-archive/1 manifest
        ↓
manifest digest returned as the published archive identity
```

A failed final manifest write cannot invalidate an earlier archive digest. The
caller updates any mutable “current archive” pointer only after `saveHistoryArchive`
returns successfully.

## Injected store

```js
const store = {
  has(digest),
  put(digest, bytes),
  get(digest),
  delete(digest), // optional
};
```

The package verifies every write and read against the requested digest. The
included `createMemoryHistoryBlobStore` is a deterministic test/reference
adapter, not a browser or production persistence policy.

## Save and load

```js
import {
  createMemoryHistoryBlobStore,
  loadHistoryArchive,
  saveHistoryArchive,
} from "@greenways/alumbra-history-store";

const store = createMemoryHistoryBlobStore();
const saved = await saveHistoryArchive({
  id: "history/archive-frontier",
  base: baseCheckpointBundle,
  records: historySession.records(),
  named: [{ name: "history/start", bundle: baseCheckpointBundle }],
  registry,
  store,
});

const loaded = await loadHistoryArchive({
  digest: saved.digest,
  store,
  registry,
});
```

Loading verifies the archive digest and canonical JSON form, every checkpoint
and region root, every referenced snapshot blob, the complete ordered
transaction replay and the final semantic world head before returning chunks.

## Authority boundary

The package depends only on Alumbra Core and History. It owns archive
serialization, content-addressed blob references and the injected store
contract. It imports no DOM, OPFS, filesystem, network, Hodos, Hestia, Ignatius
or Tahto implementation.

Those systems may implement the store interface or retain an archive digest, but
they do not own history reconstruction, transaction order or semantic-head
verification.
