# Split greedy quads by light

This complete Hara project presents the renderer-neutral AR-09 mesh-attribute
contract over one two-voxel canonical chunk.

When both voxels project the same sunlight and emitted-light pair, the ordinary
greedy reduction remains six quads. Changing only the light pairs produces ten
quads, one bounded `Uint8` sunlight value and one emitted-light value per vertex,
and a different mesh signature. Repeating the same input produces the same
attributes and quads.

The renderer owns copied mesh attributes, not the Engine lighting runtime. This
story deliberately stops before PlayCanvas vertex-colour projection and does not
claim smooth lighting, ambient occlusion, RGB light, shadows or global illumination.
