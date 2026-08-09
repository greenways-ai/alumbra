# @greenways/alumbra-renderer-playcanvas

The first browser projection for Alumbra voxel worlds.

The package separates pure voxel geometry from host-owned PlayCanvas resources:

- deterministic exposed-face and greedy-quad meshing;
- loaded-neighbor boundary suppression;
- three-dimensional DDA block picking;
- view-distance chunk selection and bounded residency scheduling;
- revision-fenced local mesh-worker execution;
- validated prebuilt-mesh installation;
- reference-counted mesh and material resources;
- closed opaque, cutout, transparent, emissive and selection-overlay profiles;
- closed daylight, fog and emissive-night environment profiles;
- injected PlayCanvas chunk renderers;
- disposable free-flight and residency hosts for the laboratory.

```js
import {
  ENVIRONMENT_PROFILE_IDS,
  createPlayCanvasEnvironmentController,
  createPlayCanvasPrebuiltMeshRenderer,
  raycastVoxels,
} from "@greenways/alumbra-renderer-playcanvas";

const renderer = createPlayCanvasPrebuiltMeshRenderer({
  pc,
  app,
  registry,
});
const environment = createPlayCanvasEnvironmentController({
  pc,
  app,
  camera,
  sun,
});

environment.apply(ENVIRONMENT_PROFILE_IDS.daylight);
renderer.installChunkMesh({ chunk, mesh: workerMesh });

const hit = raycastVoxels({
  origin: [0, 12, 20],
  direction: [0, -0.2, -1],
  getBlock,
  isSolid,
});
```

Material identities are resolved through installed, closed profiles before any
PlayCanvas mesh, material or entity is allocated. An unknown profile therefore
fails without partial GPU state. Repeated geometry and material descriptors are
shared through independent reference pools, while public evidence contains only
profile identities, pass counts and resource counts.

`playcanvas` is an optional peer. The pure mesher, profiles, ray traversal,
visibility, scheduling and resource-lifecycle modules run under Node without a
browser or GPU. Applications inject the PlayCanvas module and a started
`Application` only when creating a browser adapter.

This package has no Hodos dependency and owns no game rules or canonical world
mutations. Dense chunks come from `@greenways/alumbra-core`; renderer and
environment resources can be destroyed and reconstructed from canonical chunks
and bounded profile identities.
