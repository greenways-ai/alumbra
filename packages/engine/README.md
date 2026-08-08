# @greenways/alumbra-engine

Headless fixed-step player, voxel collision and semantic build transactions for
Alumbra.

The engine consumes canonical values from `@greenways/alumbra-core`. It owns hot
player/world runtime state but no DOM, input devices, renderer, storage, Hodos or
game economy.

```js
import {
  createPlayerRuntime,
  createWorldRuntime,
  applyBuildIntent,
} from "@greenways/alumbra-engine";

const world = createWorldRuntime({registry, chunks, missingChunkPolicy: "solid"});
const player = createPlayerRuntime({
  state: {position: [0.5, 3, 0.5]},
  getBlock: world.getBlock,
  isSolid: world.isSolidBlock,
});

player.advance(1 / 60, {move: [0, 1], jump: false});
applyBuildIntent(world, {
  type: "break",
  id: "build/break-1",
  hit,
  origin: eyePosition,
});
```

Input is semantic and caller-supplied transaction identity is mandatory. One
accepted build gesture yields one conflict-checked Core transaction. Rendering
can update only the returned affected chunk keys. `world.undo(...)` applies a
revision-checked Core inverse transaction.

The first collision profile is a bounded upright AABB, accepted by the playable
tracking issue as the initial voxel-equivalent body. It uses deterministic
substeps and axis resolution and can later be replaced by a capsule provider
without changing the build transaction boundary.
