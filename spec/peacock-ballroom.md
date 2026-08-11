# Peacock Ballroom world foundation

The Peacock Ballroom is Alumbra's first substantial Greenways architectural
world benchmark. Its portable source of truth is the Hara namespace:

```text
gw.alumbra.peacock-ballroom
```

The initial package identity is:

```text
hara:greenways/alumbra-peacock-ballroom@0.1.0
```

## First bounded envelope

The world reserves a deterministic `4 × 3 × 4` chunk envelope with
`16 × 16 × 16` voxels per chunk:

```text
minimum chunk  [-2, 0, -2]
maximum chunk  [ 1, 2,  1]
chunk count    48
world envelope 64 × 48 × 64 voxels
```

This foundation declares the complete coordinate set, palette, landmarks and
named views, but does not yet materialize the architecture. The generator and
live viewport are tracked separately so the package contract can be reviewed
without coupling it to a large geometry change.

## Hodos Worlds handoff

Alumbra publishes one closed descriptive provider value:

```clojure
{:provider/id "alumbra/world"
 :provider/activity "alumbra-hara/peacock-ballroom"
 :provider/package "hara:greenways/alumbra-peacock-ballroom@0.1.0"
 :provider/default-state "ballroom/day"
 :provider/states ["ballroom/day"
                   "ballroom/gallery-overlook"
                   "ballroom/mosaic-floor"]}
```

The value names an installed provider and semantic activity. It contains no
chunks, source paths, callbacks, capabilities, renderer objects, workers, mesh
buffers or executable factories. Hodos remains independent of Alumbra; an
Alumbra-owned adapter will satisfy the installed provider identity.

## Palette and provenance

The first palette uses only existing portable material fields: colour, gloss,
opacity, transparency, emissive colour and bounded emitted light. It introduces
no shader or renderer authority.

The Greenways Peacock Ballroom artwork is recorded as visual inspiration. All
world geometry, voxel patterns and future assets must be original; the source
artwork is not embedded or copied into the world package.
