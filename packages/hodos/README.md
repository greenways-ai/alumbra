# @greenways/alumbra-hodos

The Alumbra-owned adapter for mounting voxel engine viewports and the renderer
Workspace as trusted Hodos components.

```text
Alumbra → Hodos
Hodos   ✕ Alumbra
```

The package registers `alumbra.world/viewport`. It carries only bounded,
serializable projection state: world/session identity, revision, an opaque engine
handle, camera, block selection, mode, status, capabilities, errors and metadata.
Dense chunks, typed arrays, workers, PlayCanvas objects and game authority remain
inside the injected Alumbra host.

```js
import { createHodosComponentRegistry } from "@greenways/hodos-web";
import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
import { createAlumbraViewportArea, registerAlumbraHodos } from "@greenways/alumbra-hodos";

const registry = createHodosComponentRegistry();
registerAlumbraHodos(registry, {
  createViewportHost: ({ container, dispatch }) =>
    alumbraEngine.mount({ container, dispatch }),
});

const area = createWorkspaceAreaHost({ root, registry, dispatch });
area.open(createAlumbraViewportArea({
  model: {
    "world/id": "world:alumbra/frontier",
    "session/id": "session:main",
    "world/revision": 42,
    "engine/handle": "handle:alumbra/world/42",
    camera: { position: [3, 14, 22], rotation: [-18, 8, 0] },
    status: "active",
    capabilities: { move: true, look: true, jump: true },
  },
}));
```

The injected host must implement `update(model)`. It may implement either
`destroy()` or `dispose()`; the adapter releases it exactly once. Ordinary model
updates preserve the host and therefore preserve engine, worker and GPU state.

## Renderer Workspace lifecycle

`createRendererWorkspaceSession` coordinates installed semantic activities across
six separate authorities:

```text
Catalog · World · Code · Execution · Problems · REPL
```

```js
import { createRendererWorkspaceSession } from "@greenways/alumbra-hodos/workspace";

const workspace = createRendererWorkspaceSession({
  installedActivityIds: [
    "alumbra-renderer-playcanvas/material-matrix",
    "alumbra-renderer-playcanvas/chunk-residency",
  ],
  createViewportHost: ({ activityId, model }) =>
    localRendererHosts.open({ activityId, model }),
});

await workspace.openActivity(activityId, viewportModel);
await workspace.updateModel({ ...viewportModel, "world/revision": 43 });
await workspace.selectSurface("code"); // suspends the viewport
await workspace.selectSurface("world"); // resumes the same engine and world
```

Switching semantic activities destroys the previous injected viewport before a
new host is created. Model-only updates cannot replace world, session or engine
identity. Hiding the World surface suspends rendering; returning resumes the
same injected host. The wide layout exposes all six authorities, while the
compact layout exposes Catalog, World, Code, Execution and Problems as tabs.

Workspace evidence contains identities, lifecycle status and bounded counters
only. It never contains installed project paths, factories, source expressions,
shader source, chunks, meshes, PlayCanvas objects or capability grants.

The package keeps Hodos as optional peers and imports no Hodos implementation
code. Remote Workspace values may select installed component and activity IDs but
cannot supply factories or executable renderer code.
