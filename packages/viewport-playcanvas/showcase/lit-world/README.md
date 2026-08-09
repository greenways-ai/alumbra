# Live lit-world viewport

This complete Showcase project proves dynamic, revision-fenced lighting across a
negative-to-zero chunk boundary.

The browser host owns one deterministic two-chunk cave fixture spanning
`-1,0,0` and `0,0,0`. A boundary lamp propagates emitted light into the adjacent
chunk through Engine fields, renderer-owned copied snapshots, light-aware greedy
meshes and PlayCanvas vertex colours.

Four named states exercise the same installed activity:

- `lighting/live` — initial cross-boundary light;
- `lighting/lamp-removed` — a revision-checked Core transaction removes the lamp;
- `lighting/lamp-restored` — the accepted inverse restores the current light;
- `lighting/stale-generation-rejected` — an older delayed generation completes
  after a newer canonical revision and is discarded before installation.

The Hara source and state values remain descriptive. They contain semantic
identities, revisions, bounded counters and expected outcomes only—never chunks,
dense light fields, vertex channels, callbacks, PlayCanvas objects, project paths
or storage capabilities.
