# Alumbra voxel lighting

Alumbra Engine owns renderer-neutral, reconstructible voxel light fields over an
exact loaded set of canonical Core chunks.

## Profiles

`alumbra.lighting-profile/1` is a closed value containing:

- a semantic profile identity;
- a maximum light level from `1` through `15`;
- positive sunlight and emitted-light attenuation;
- an explicit missing-neighbour policy.

The default maximum is `15`. `opaque` treats a missing vertical chunk segment as
blocking sunlight below the highest loaded segment in that chunk column. `open`
treats every loaded top face without a loaded `+Y` neighbour as exposed sky.

## Block properties

Engine resolves block lighting from canonical registry metadata:

```text
metadata.light.opacity   0–15
metadata.light.emission  0–15
```

The existing `lightOpacity` and `emittedLight` fields remain accepted aliases.
Conflicting declarations or out-of-range values fail before a field is returned.
Without an explicit opacity, empty and `render.opaque = false` blocks transmit
light; other blocks are fully opaque.

## Field construction

A build captures one uniform-shape loaded chunk set and computes two private
`Uint8Array` fields per chunk:

```text
sunlight
emitted light
```

Sunlight is seeded at loaded sky boundaries. Emitted light is seeded at block
sources. Both propagate through six-neighbour voxel adjacency and attenuate by at
least one level per step. Processing is level-ordered and coordinate-stable, so
input chunk order and queue insertion order do not alter the result.

Propagation crosses loaded chunk boundaries, including negative coordinates.
It never invents a field for an unloaded chunk.

## Public field view

`alumbra.light-field/1` exposes only:

- chunk identity, shape and source revision;
- profile and job generation identity;
- point sampling;
- explicit copies of the dense sunlight or emitted-light bytes;
- bounded aggregate evidence.

The internal typed arrays remain hot Engine state. They are not Hara values,
Hodos component models, history manifests, content-addressed archive cells or
renderer resources.

## Revision fencing

A lighting job captures:

```text
requested generation
runtime epoch
sorted chunk keys and exact revisions
```

Installation succeeds only when the result belongs to the newest requested
generation and the profile, epoch, loaded chunk set and every chunk revision are
unchanged. A stale worker completion cannot replace current fields.

## Invalidation

Updating one canonical chunk invalidates loaded chunks whose nearest voxel is
within the profile's maximum propagation radius. This is a conservative bounded
set based on Manhattan voxel distance; unrelated distant fields remain readable
until a replacement field set is installed.

Destroying the runtime releases its chunk map, fields and invalidation state and
reports an exact zero-resource baseline.
