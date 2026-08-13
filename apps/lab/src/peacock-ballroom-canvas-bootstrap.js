const root = document.documentElement;
const body = document.body;
const shell = document.querySelector(".ballroom-shell");
const canvas = document.querySelector("#peacock-ballroom-canvas");
const parameters = new URLSearchParams(location.search);
const embeddedHost = parameters.get("embed") === "catalog";

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
  const width = Math.max(shellSize.width, viewport.width);
  const height = Math.max(shellSize.height, viewport.height);

  // A newly exposed Catalog iframe can report a valid child viewport while its
  // percentage-sized canvas repeatedly collapses after inline fallback removal.
  // Keep the fallback responsive to observed host size for that embedded
  // boundary instead of alternating between a drawable and zero-sized canvas.
  if (fallbackApplied && embeddedHost) {
    const embeddedWidth = width > 1 ? width : canvasSize.width;
    const embeddedHeight = height > 1 ? height : canvasSize.height;
    if (embeddedWidth > 1 && embeddedHeight > 1) {
      canvas.style.width = `${embeddedWidth}px`;
      canvas.style.height = `${embeddedHeight}px`;
      return publish("viewport-fallback", embeddedWidth, embeddedHeight);
    }
  }

  if (canvasSize.width > 1 && canvasSize.height > 1) {
    if (fallbackApplied && shellSize.width > 1 && shellSize.height > 1) {
      canvas.style.removeProperty("width");
      canvas.style.removeProperty("height");
      fallbackApplied = false;
    }
    return publish("layout", canvasSize.width, canvasSize.height);
  }

  if (width > 1 && height > 1) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    fallbackApplied = true;
    return publish("viewport-fallback", width, height);
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
