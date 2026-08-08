# Alumbra voxel laboratory

The laboratory is a deliberately small browser consumer of the headless Core and
the PlayCanvas renderer package. It loads a deterministic 4 × 4 chunk terrain,
free-flight controls, view-distance culling and DDA block selection.

From the repository root:

```sh
npm run lab:serve
```

Open `http://127.0.0.1:4173/apps/lab/` and click the viewport to capture the
pointer. Use WASD to move, Space/Control to move vertically and Shift to move
faster. The lab does not mutate blocks or implement inventory, physics or game
rules.

The page pins the browser-only PlayCanvas ESM build through an import map. The
published renderer package keeps PlayCanvas as an optional peer so its pure
geometry and traversal tests remain headless.
