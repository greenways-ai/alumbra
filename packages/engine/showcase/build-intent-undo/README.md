# Place a block and inspect undo

This complete Showcase project follows an Engine build intent before any scene
or renderer receives authority:

1. a voxel hit determines the face-adjacent placement target;
2. reach, loaded-chunk, replaceability and player-collision checks are explicit;
3. the accepted intent becomes a Core block transaction with an expected chunk
   revision; and
4. undo is an inverse transaction that can be checked and applied independently.

The story deliberately stops at the canonical transaction boundary. Rendering,
network replication and durable acceptance remain separate consumers.
