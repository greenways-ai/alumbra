# @greenways/alumbra-engine

Headless fixed-step player, voxel collision, semantic build transactions and
renderer-neutral voxel lighting for Alumbra.

The engine consumes canonical values from `@greenways/alumbra-core`. It owns hot
player, world and light-field runtime state but no DOM, input devices, renderer,
storage, Hodos or game economy.

```js
import {
  createPlayerRuntime,
  createWorldRuntime,
  createLightingRuntime,
  applyBuildIntent,
} from "@greenways/alumbra-engine";

const world = createWorldRuntime({registry, chunks, missingChunkPolicy: "solid"});
const player = createPlayerRuntime({
  state: {position: [0.5, 3, 0.5]},
  getBlock: world.getBlock,
  isSolid: world.isSolidBlock,
});
const lighting = createLightingRuntime({registry, chunks});

player.advance(1 / 60, {move: [0, 1], jump: false});
applyBuildIntent(world, {
  type: "break",
  id: "build/break-1",
  hit,
  origin: eyePosition,
});
const rebuilt = lighting.rebuild();
const light = lighting.getField([0, 0, 0]);
```

Lighting reads block opacity and emission from closed block metadata, computes
bounded sunlight and emitted-light values from `0` through `15`, propagates
across the exact loaded chunk set and keeps dense arrays private behind immutable
field views. Missing vertical neighbours are either opaque gaps or explicit open
sky according to the selected profile.

A lighting job captures exact chunk revisions and a runtime epoch. Installation
succeeds only for the newest requested generation with an unchanged revision
set. Updating one chunk invalidates only loaded chunks inside the maximum light
propagation radius; unaffected fields remain readable until the replacement set
is installed.

Input is semantic and caller-supplied transaction identity is mandatory. One
accepted build gesture yields one conflict-checked Core transaction. Rendering
can update only the returned affected chunk keys. `world.undo(...)` applies a
revision-checked Core inverse transaction.

The first collision profile is a bounded upright AABB, accepted by the playable
tracking issue as the initial voxel-equivalent body. It uses deterministic
substeps and axis resolution and can later be replaced by a capsule provider
without changing the build transaction boundary.
