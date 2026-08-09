# @greenways/alumbra-renderer-playcanvas

The first browser projection for Alumbra voxel worlds.

The package separates pure voxel geometry from host-owned PlayCanvas resources:

- deterministic exposed-face and greedy-quad meshing;
- optional light-aware merge keys and typed sunlight/emitted mesh attributes;
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
  MESH_LIGHT_SNAPSHOT_FORMAT,
  buildChunkMesh,
  createPlayCanvasEnvironmentController,
  createPlayCanvasPrebuiltMeshRenderer,
  raycastVoxels,
} from "@greenways/alumbra-renderer-playcanvas";

const lightSnapshot = {
  format: MESH_LIGHT_SNAPSHOT_FORMAT,
  profileId: lightField.profileId,
  generation: lightField.generation,
  epoch: lightFieldSet.epoch,
  maxLevel: 15,
  key: lightField.key,
  coord: lightField.coord,
  shape: lightField.shape,
  sourceRevision: lightField.sourceRevision,
  sunlight: lightField.copySunlight(),
  emitted: lightField.copyEmitted(),
};
const mesh = buildChunkMesh({
  chunk,
  registry,
  lightSnapshots: [lightSnapshot],
});

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

Mesh lighting snapshots are closed, cloneable values containing exact target or
cardinal-neighbour field bytes. The mesher copies and validates at most seven
snapshots, samples the exposed side of each rendered face and duplicates one
sunlight/emitted pair onto the quad's four vertices. Different light pairs do not
greedy-merge. The mesh worker captures the exact profile, generation, epoch and
source revisions and rejects substituted output evidence.

Dense field authority remains in Engine. The renderer imports only Core and
receives bounded snapshot copies; it never receives an Engine runtime, Hodos
component, storage capability or PlayCanvas object through the worker envelope.
PlayCanvas vertex-colour projection is a separate adapter slice.

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
