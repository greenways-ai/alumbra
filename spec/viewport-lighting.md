# Alumbra viewport lighting coordination

The viewport package owns orchestration between canonical world updates, Engine
light fields, renderer-owned mesh sidecars and disposable PlayCanvas resources.
It does not become the authority for any of those values.

## Pipeline

```text
canonical loaded chunk set
        ↓
revision-pinned Engine lighting job
        ↓
current light-field set installation
        ↓
target plus cardinal copied light snapshots
        ↓
deterministic light-aware greedy mesh
        ↓
validated lit prebuilt renderer installation
```

## Coordinator

`alumbra.viewport-lighting-coordinator/1` keeps one canonical loaded chunk map
and one Engine lighting runtime. A projection cycle captures a request version,
the exact Engine job generation and the sorted dirty chunk set.

A result may install only while all of the following remain current:

- coordinator request version;
- Engine generation and epoch;
- target chunk key, coordinate, shape and revision;
- target light-field revision;
- copied cardinal-neighbour light evidence;
- renderer mesh lighting evidence.

A canonical update, removal, manual invalidation, suspension or destruction
increments the coordinator fence. A late lighting or mesh completion is counted
and discarded without reaching PlayCanvas.

## Bounded invalidation and residency

Engine determines the affected lighting set. The coordinator remeshes only those
loaded keys, in canonical coordinate order. Unrelated installed chunks and GPU
resources remain resident.

The renderer-compatible adapter exposes:

```text
setChunk(chunk)
removeChunk(coord-or-key)
getBlock(world)
setView(view)
setSelection(hit)
suspend(reason)
resume(reason)
destroy()
```

World-controller updates therefore enter through `setChunk`, while a residency
host releases an evicted field and mesh through `removeChunk`.

## Lit viewport session

`alumbra.lit-viewport-session/1` creates the normal PlayCanvas viewport with a
prebuilt renderer wrapped by the lighting coordinator. It forwards suspension
and resume to both the viewport graph/input lifecycle and the projection fence.
Destruction owns the complete renderer/lighting teardown exactly once.

## Evidence

`alumbra.viewport-lighting-evidence/1` contains only bounded data:

- status, profile and lifecycle counters;
- loaded, dirty and installed chunk counts;
- canonical affected chunk keys;
- maximum sunlight and emitted levels;
- lighting generation and stale-result counters;
- mesh group, vertex and triangle counts;
- renderer mesh/material resource counts;
- final zero-resource baseline.

It contains no canonical chunk payloads, typed light fields, mesh buffers,
callbacks, PlayCanvas objects, storage handles, Hodos models or capabilities.
