# @greenways/alumbra-viewport-playcanvas

A reusable lifecycle boundary that composes an Alumbra world, player, build
controller and PlayCanvas renderer without moving canonical world authority into
the browser scene graph.

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

viewport.suspend("surface-hidden");
viewport.resume("surface-visible");
viewport.destroy();
```

The session owns projection, input sampling, camera/light entities, picking,
frame evidence and deterministic disposal. The caller continues to own canonical
chunks, package activation, persistence, UI, save timing and public authority.

`createViewportSessionGroup` tracks several independent sessions without sharing
worlds, players, renderer resources or lifecycle state. A group does not merge
their authority; it only provides explicit creation, lookup, suspension and
disposal.
