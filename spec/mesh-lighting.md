# Alumbra mesh lighting handoff

The renderer consumes copied light fields without importing or owning the Engine
lighting runtime.

## Snapshot

`alumbra.mesh-light-snapshot/1` is a closed, cloneable worker input containing:

- profile identity, generation and epoch;
- maximum level from `1` through `15`;
- exact chunk key, coordinate, shape and source revision;
- one `Uint8Array` sunlight value per voxel;
- one `Uint8Array` emitted-light value per voxel.

A target mesh may receive at most seven snapshots: its own exact revision and up
to six cardinal neighbours. All snapshots must share one profile, generation,
epoch, level bound and shape. The mesher copies every array before use.

## Face sampling

For each rendered face, the mesher samples the adjacent exposed voxel. If that
snapshot is not loaded, it falls back to the current target voxel. The initial
projection is one sunlight/emitted pair per face, repeated across the quad's four
vertices.

Greedy meshing requires equal material/block identity and an equal projected
light pair. Different face light splits quads deterministically. Smooth corner
lighting and ambient occlusion are outside this version.

## Mesh attributes

A light-aware `alumbra.chunk-mesh/1` adds:

```text
mesh.lighting
mesh.groups[*].sunlight  Uint8Array(vertexCount)
mesh.groups[*].emitted   Uint8Array(vertexCount)
```

Unlit meshing omits all three additions and retains the previous geometry and
signature path. Light-aware mesh signatures include both byte arrays, so changed
lighting cannot reuse a stale geometry resource.

## Worker fence

`alumbra.mesh-lighting/1` records the target, profile, generation, epoch, shape
and sorted source chunk revisions. A local mesh worker reconstructs its sampler
from copied snapshots and requires the returned mesh evidence and light arrays
to match the submitted job. Substituted or stale evidence fails before the
result leaves the worker boundary.

The worker envelope contains no Engine object, callback, Hodos component,
PlayCanvas object, storage handle or service capability.

## PlayCanvas projection

`alumbra.mesh-light-color-profile/1` maps bounded sunlight and emitted values to
deterministic grayscale RGBA vertex colors. The default mapping has a small
ambient floor and independently bounded sunlight and emitted scales. Values are
clamped to one byte per channel and alpha is always opaque.

The prebuilt adapter validates all mesh lighting evidence and attributes before
allocating a PlayCanvas resource. It resolves every material profile and
completes every color projection in the same pre-allocation pass, so an unknown
profile or malformed light payload cannot leave a partial mesh, material or
entity. Lit geometry receives packed vertex colors, and its material enables the
diffuse vertex-color channel with gamma conversion disabled. Lit and unlit
material resources remain separate.

The mesh resource key contains the original lighting-sensitive mesh signature
and the color-profile key. Identical geometry, light bytes and color profiles
share GPU resources. A light change replaces the mesh resource even when voxel
geometry is unchanged. Public render evidence contains only profile identities,
vertex counts and bounded byte ranges.