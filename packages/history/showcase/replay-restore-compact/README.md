# Replay, restore and compact world history

This complete Hara project explains the storage-neutral history law without
selecting a filesystem, browser database, remote service or renderer.

The named EDN state records four proofs exercised by the JavaScript package:

1. chunk coordinates map deterministically into four region manifests;
2. sequence `1` is the only valid next accepted transaction and affects one region;
3. the named `history/after-change` checkpoint restores the exact semantic head;
4. compaction clears the covered transaction prefix while preserving that head.

The rejected sequence is part of the evidence: a gap fails before world state,
sequence or records can change.
