# @greenways/alumbra-hodos

The Alumbra-owned adapter for mounting a voxel engine viewport as a trusted Hodos
Workspace component.

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

The package keeps Hodos as optional peers and imports no Hodos implementation
code. Remote Workspace values may select installed component IDs but cannot
supply factories or executable renderer code.
