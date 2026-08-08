# @greenways/alumbra-renderer-playcanvas

The first browser projection for Alumbra voxel worlds.

The package separates pure voxel geometry from host-owned PlayCanvas resources:

- deterministic exposed-face and greedy-quad meshing;
- loaded-neighbor boundary suppression;
- three-dimensional DDA block picking;
- view-distance chunk selection;
- reference-counted mesh and material resources;
- an injected PlayCanvas chunk renderer;
- a disposable free-flight first-person controller for the laboratory.

```js
import {
  createPlayCanvasVoxelRenderer,
  raycastVoxels,
} from "@greenways/alumbra-renderer-playcanvas";

const renderer = createPlayCanvasVoxelRenderer({
  pc,
  app,
  registry,
});

for (const chunk of chunks) renderer.setChunk(chunk);

const hit = raycastVoxels({
  origin: [0, 12, 20],
  direction: [0, -0.2, -1],
  getBlock: renderer.getBlock,
  isSolid: (block) => !registry.get(block.id).empty,
});
renderer.setSelection(hit);
```

`playcanvas` is an optional peer. The pure mesher, ray traversal, visibility and
resource-lifecycle modules run under Node without a browser or GPU. Applications
inject the PlayCanvas module and a started `Application` only when creating the
browser adapter.

This package has no Hodos dependency and owns no game rules or canonical world
mutations. Dense chunks come from `@greenways/alumbra-core`; the renderer can be
destroyed and reconstructed from chunk snapshots and camera state.
