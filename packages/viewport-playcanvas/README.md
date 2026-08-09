# @greenways/alumbra-viewport-playcanvas

A reusable lifecycle boundary that composes an Alumbra world, player, build
controller, deterministic lighting pipeline and PlayCanvas renderer without
moving canonical world or light-field authority into the browser scene graph.

## Standard viewport

```js
import * as pc from "playcanvas";
import {createPlayCanvasViewportSession} from "@greenways/alumbra-viewport-playcanvas";

const viewport = createPlayCanvasViewportSession({
  pc,
  canvas,
  world,
  player,
  controller,
  blockIds: ["alumbra/basalt", "alumbra/glass"],
  playerBody: {radius: 0.34, height: 1.8, eyeHeight: 1.62},
});
```

## Lit viewport

```js
import {
  createLitPlayCanvasViewportSession,
} from "@greenways/alumbra-viewport-playcanvas/lit-session";

const viewport = createLitPlayCanvasViewportSession({
  pc,
  canvas,
  world,
  player,
  controller,
});

await viewport.drain();
console.log(viewport.snapshot().lighting);

viewport.suspend("surface-hidden");
viewport.resume("surface-visible");
await viewport.destroy();
```

The lit session composes four independently owned boundaries:

```text
canonical Core chunks
        ↓
Engine lighting runtime
        ↓
renderer-owned light snapshots and greedy meshes
        ↓
PlayCanvas prebuilt mesh projection
```

`createViewportLightingCoordinator` accepts injected lighting, meshing and
renderer execution boundaries. It performs full initial projection, bounded
invalidation, deterministic target ordering, stale lighting and mesh fencing,
loaded-chunk removal, suspension, resume and idempotent disposal. The companion
`createViewportLitRenderer` presents that coordinator through the renderer shape
already consumed by world controllers and viewport sessions.

Public evidence contains semantic identities, revisions, counters, affected
chunk keys and resource counts only. Dense light fields, chunk payloads, mesh
buffers, callbacks, PlayCanvas objects and capabilities remain private to their
owning runtime.

The caller continues to own canonical chunks, package activation, persistence,
UI, save timing and public authority. `createViewportSessionGroup` tracks several
independent sessions without sharing worlds, players, renderer resources or
lifecycle state.


## Accepted block transactions

`routeAcceptedLightingTransaction` verifies a Core world-runtime acceptance receipt,
loads the exact post-transaction chunks and routes them through the existing lighting
coordinator. Revision, changed-key and affected-key mismatches fail before coordinator
mutation; duplicate delivery of the exact current post-state is idempotent.

The live lit-world Showcase exercises four installed states: `lighting/live`,
`lighting/lamp-removed`, `lighting/lamp-restored`, and
`lighting/stale-generation-rejected`.

### Ordinary accepted edits

A lit renderer exposes a synchronous `routeAcceptedTransaction(acceptance, getChunk)` boundary. `createPlayableWorldController` uses it when present, so ordinary player break/place and undo operations reuse the accepted Core receipt, bounded lighting invalidation and stale-generation fences established by AR-12. Non-lit renderers retain the existing direct `setChunk` fallback.

### Exact projection retention

Before rebuilding an affected candidate, the coordinator compares the candidate's canonical revision, full target light bytes, sampled cardinal-neighbour light bytes, and sampled face-touching block values with the installed projection input. Equal inputs retain the installed renderer handle and resources; only candidates whose exact geometry or sampled light input changed are meshed and installed again.
