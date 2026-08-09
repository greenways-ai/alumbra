# Save and verify a content-addressed history archive

This complete Hara project presents the archive law without selecting a concrete
filesystem, browser store, network service or mutable “current archive” pointer.

The package writes three unique canonical chunk snapshots by SHA-256 identity,
then publishes one canonical archive manifest last. Repeating the same save
reuses every snapshot and returns the same archive identity without rewriting the
manifest.

Loading verifies the manifest identity, every snapshot, checkpoint reconstruction,
ordered transaction replay and the final semantic world head before returning
chunks. Missing or modified bytes fail closed. An injected final-manifest failure
leaves the previously published archive readable.
