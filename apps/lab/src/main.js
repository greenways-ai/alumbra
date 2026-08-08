import * as pc from "playcanvas";
import {
  createBlockRegistry,
  createChunk,
  patchChunk,
} from "../../../packages/core/src/index.js";
import {
  createFirstPersonController,
  createPlayCanvasVoxelRenderer,
  raycastVoxels,
} from "../../../packages/renderer-playcanvas/src/index.js";

const canvas = document.querySelector("#alumbra-canvas");
const status = document.querySelector("[data-status]");
const stats = Object.fromEntries(
  [...document.querySelectorAll("[data-stat]")].map((node) => [node.dataset.stat, node]),
);

const registry = createBlockRegistry([
  {
    id: "alumbra/air",
    empty: true,
    metadata: {
      physics: { solid: false },
      render: { visible: false },
    },
  },
  {
    id: "alumbra/basalt",
    metadata: {
      physics: { solid: true },
      render: { color: [0.23, 0.27, 0.31], gloss: 0.16 },
    },
  },
  {
    id: "alumbra/loam",
    metadata: {
      physics: { solid: true },
      render: { color: [0.39, 0.29, 0.2], gloss: 0.08 },
    },
  },
  {
    id: "alumbra/moss",
    metadata: {
      physics: { solid: true },
      render: { color: [0.34, 0.48, 0.31], gloss: 0.12 },
    },
  },
  {
    id: "alumbra/ochre",
    metadata: {
      physics: { solid: true },
      render: { color: [0.67, 0.47, 0.22], gloss: 0.2 },
    },
  },
  {
    id: "alumbra/crystal-glass",
    metadata: {
      physics: { solid: true },
      render: { color: [0.55, 0.78, 0.83], opaque: false, opacity: 0.38, gloss: 0.72 },
    },
  },
], {
  id: "alumbra/lab-blocks",
  version: "0.1.0",
});

const CHUNK_SHAPE = Object.freeze([16, 16, 16]);
const terrainHeight = (worldX, worldZ) => Math.max(2, Math.min(
  8,
  4 + Math.floor(
    Math.sin(worldX * 0.13) * 1.15
    + Math.cos(worldZ * 0.11) * 1.05
    + Math.sin((worldX + worldZ) * 0.047) * 0.8,
  ),
));

function generatedChunk(coord) {
  const chunk = createChunk({ registry, coord, shape: CHUNK_SHAPE });
  const updates = [];
  for (let z = 0; z < CHUNK_SHAPE[2]; z += 1) {
    for (let x = 0; x < CHUNK_SHAPE[0]; x += 1) {
      const worldX = coord[0] * CHUNK_SHAPE[0] + x;
      const worldZ = coord[2] * CHUNK_SHAPE[2] + z;
      const height = terrainHeight(worldX, worldZ);
      for (let y = 0; y <= height; y += 1) {
        const id = y === height
          ? (height <= 3 ? "alumbra/ochre" : "alumbra/moss")
          : y >= height - 2
            ? "alumbra/loam"
            : "alumbra/basalt";
        updates.push({ local: [x, y, z], value: id });
      }
    }
  }

  // A small translucent landmark verifies material grouping and transparent faces.
  if (coord[0] === 0 && coord[2] === 0) {
    for (let y = 9; y < 14; y += 1) {
      updates.push({ local: [8, y, 8], value: "alumbra/crystal-glass" });
    }
  }
  return patchChunk(chunk, updates, registry, { revision: 1 });
}

const app = new pc.Application(canvas, {
  keyboard: new pc.Keyboard(window),
  mouse: new pc.Mouse(canvas),
  graphicsDeviceOptions: {
    alpha: false,
    antialias: true,
    powerPreference: "high-performance",
  },
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.34, 0.38, 0.46);
app.start();

const worldRoot = new pc.Entity("Alumbra voxel world", app);
app.root.addChild(worldRoot);
const renderer = createPlayCanvasVoxelRenderer({
  pc,
  app,
  registry,
  root: worldRoot,
});

for (let z = -2; z < 2; z += 1) {
  for (let x = -2; x < 2; x += 1) renderer.setChunk(generatedChunk([x, 0, z]));
}

const camera = new pc.Entity("Alumbra lab camera", app);
camera.addComponent("camera", {
  clearColor: new pc.Color(0.36, 0.53, 0.68),
  fov: 66,
  nearClip: 0.05,
  farClip: 300,
});
camera.setLocalPosition(3, 14, 22);
app.root.addChild(camera);

const sun = new pc.Entity("Alumbra lab sun", app);
sun.addComponent("light", {
  type: "directional",
  color: new pc.Color(1, 0.91, 0.73),
  intensity: 1.45,
  castShadows: true,
  shadowDistance: 90,
});
sun.setLocalEulerAngles(48, 28, 0);
app.root.addChild(sun);

const controller = createFirstPersonController({
  pc,
  app,
  camera,
  canvas,
  speed: 8,
  initialYaw: 8,
  initialPitch: -18,
});

const isPickable = (block) => {
  const definition = registry.get(block.id);
  return !definition.empty && definition.metadata?.render?.visible !== false;
};

let visible = 0;
let lastHud = 0;
const update = () => {
  const position = camera.getPosition();
  const view = renderer.setView({
    position: [position.x, position.y, position.z],
    horizontalDistance: 3,
    verticalDistance: 1,
  });
  visible = view.visible;

  const forward = camera.forward;
  const hit = raycastVoxels({
    origin: [position.x, position.y, position.z],
    direction: [forward.x, forward.y, forward.z],
    maxDistance: 12,
    getBlock: renderer.getBlock,
    isSolid: isPickable,
  });
  renderer.setSelection(hit);

  const now = performance.now();
  if (now - lastHud > 100) {
    const projection = renderer.stats();
    stats.chunks.textContent = String(projection.chunks);
    stats.visible.textContent = String(visible);
    stats.quads.textContent = projection.quads.toLocaleString();
    stats.target.textContent = hit ? `${hit.voxel.join(",")} · ${hit.face ?? "inside"}` : "none";
    lastHud = now;
  }
};
app.on("update", update);

const resize = () => app.resizeCanvas();
window.addEventListener("resize", resize);
status.textContent = "Ready · the renderer is reconstructible from 16 canonical chunk values";

let disposed = false;
function destroy() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("resize", resize);
  app.off("update", update);
  controller.destroy();
  renderer.destroy();
  app.destroy();
}
window.addEventListener("pagehide", destroy, { once: true });
