const root = document.documentElement;
const body = document.body;
const shell = document.querySelector(".ballroom-shell");
const canvas = document.querySelector("#peacock-ballroom-canvas");

if (!root || !body || !shell || !canvas) {
  throw new Error("Peacock Ballroom canvas bootstrap is missing its shell or canvas");
}

let disposed = false;
let scheduled = false;
let fallbackApplied = false;
let observations = 0;

function viewportSize() {
  const visual = globalThis.visualViewport;
  const width = Math.floor(Math.max(
    0,
    Number(visual?.width) || 0,
    Number(root.clientWidth) || 0,
    Number(body.clientWidth) || 0,
    Number(globalThis.innerWidth) || 0,
  ));
  const height = Math.floor(Math.max(
    0,
    Number(visual?.height) || 0,
    Number(root.clientHeight) || 0,
    Number(body.clientHeight) || 0,
    Number(globalThis.innerHeight) || 0,
  ));
  return Object.freeze({width, height});
}

function elementSize(element) {
  const rect = element.getBoundingClientRect();
  return Object.freeze({
    width: Math.floor(Math.max(0, Number(rect.width) || 0, Number(element.clientWidth) || 0)),
    height: Math.floor(Math.max(0, Number(rect.height) || 0, Number(element.clientHeight) || 0)),
  });
}

function publish(mode, width, height) {
  observations += 1;
  body.dataset.peacockBallroomCanvasBootstrap = mode;
  body.dataset.peacockBallroomCanvasBootstrapSize = `${width}x${height}`;
  globalThis.__PEACOCK_BALLROOM_CANVAS_BOOTSTRAP__ = Object.freeze({
    format: "alumbra.peacock-ballroom-canvas-bootstrap/1",
    mode,
    width,
    height,
    fallbackApplied,
    observations,
  });
  return globalThis.__PEACOCK_BALLROOM_CANVAS_BOOTSTRAP__;
}

function measure() {
  scheduled = false;
  if (disposed) return null;

  const canvasSize = elementSize(canvas);
  const shellSize = elementSize(shell);
  const viewport = viewportSize();
  const hostWidth = Math.max(shellSize.width, viewport.width);
  const hostHeight = Math.max(shellSize.height, viewport.height);
  const width = hostWidth > 1 ? hostWidth : canvasSize.width;
  const height = hostHeight > 1 ? hostHeight : canvasSize.height;

  // The entry requires two consecutive drawable frames. A percentage-sized
  // canvas can be measurable for one frame and collapse on the next while an
  // iframe, mobile viewport or headless host is settling. Pin every observed
  // host size immediately, then keep the pixels responsive through the same
  // resize observations until disposal.
  if (width > 1 && height > 1) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    fallbackApplied = true;
    const mode = canvasSize.width > 1 && canvasSize.height > 1
      ? "layout-pinned"
      : "viewport-fallback";
    return publish(mode, width, height);
  }
  return publish("waiting", width, height);
}

function schedule() {
  if (disposed || scheduled) return;
  scheduled = true;
  requestAnimationFrame(measure);
}

const resizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(schedule)
  : null;
resizeObserver?.observe(shell);
resizeObserver?.observe(canvas);
globalThis.visualViewport?.addEventListener?.("resize", schedule);
globalThis.addEventListener("resize", schedule);

document.addEventListener("visibilitychange", schedule);
measure();
schedule();

function destroy() {
  if (disposed) return;
  disposed = true;
  resizeObserver?.disconnect();
  globalThis.visualViewport?.removeEventListener?.("resize", schedule);
  globalThis.removeEventListener("resize", schedule);
  document.removeEventListener("visibilitychange", schedule);
  canvas.style.removeProperty("width");
  canvas.style.removeProperty("height");
  delete globalThis.__PEACOCK_BALLROOM_CANVAS_BOOTSTRAP__;
}
globalThis.addEventListener("pagehide", destroy, {once: true});
