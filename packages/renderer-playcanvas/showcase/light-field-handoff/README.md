# Verify the light-field handoff

This complete Hara project presents the closed snapshot and worker-evidence
boundary between Alumbra Engine light fields and renderer-owned mesh attributes.

A solid chunk at `[-1 0 0]` samples the loaded empty neighbour at `[0 0 0]` for
its exposed east face, while its west face falls back to the target field. The
snapshot set is ordered and fenced by target revision, cardinal adjacency, profile,
generation, epoch and maximum level.

Stale target fields, non-cardinal neighbours, identity drift and substituted
worker evidence fail before a mesh result leaves the worker boundary. An unlit
job retains the previous request and result shape. No Engine object, callback,
PlayCanvas object, Hodos component or storage capability enters the portable
envelope.
