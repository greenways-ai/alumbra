const DIGIT_KEYS = new Map([
  ["Digit1", 0], ["Digit2", 1], ["Digit3", 2], ["Digit4", 3],
  ["Digit5", 4], ["Digit6", 5], ["Digit7", 6], ["Digit8", 7],
]);

export function createPlayableInput({
  canvas,
  eventTarget = globalThis.window,
  documentTarget = globalThis.document,
  lookSensitivity = 0.12,
  slotCount = 8,
  initialSlot = 0,
  requirePointerLock = false,
  onSelectionChange = () => {},
} = {}) {
  if (!canvas?.addEventListener || !eventTarget?.addEventListener || !documentTarget?.addEventListener) {
    throw new TypeError("Playable input requires canvas, eventTarget and documentTarget event sources");
  }
  if (!Number.isFinite(lookSensitivity) || lookSensitivity <= 0) {
    throw new RangeError("lookSensitivity must be positive and finite");
  }
  if (!Number.isSafeInteger(slotCount) || slotCount < 1 || slotCount > 32) {
    throw new RangeError("slotCount must be an integer between 1 and 32");
  }
  if (typeof requirePointerLock !== "boolean") {
    throw new TypeError("requirePointerLock must be a boolean");
  }

  let selectedSlot = Math.max(0, Math.min(slotCount - 1, Number(initialSlot) || 0));
  const pressed = new Set();
  const actions = [];
  let lookX = 0;
  let lookY = 0;
  let jumpQueued = false;
  let enabled = true;
  let disposed = false;

  const locked = () => documentTarget.pointerLockElement === canvas;
  const active = () => enabled && (!requirePointerLock || locked());
  const select = (slot) => {
    if (!Number.isFinite(Number(slot))) return;
    const next = ((Math.trunc(Number(slot)) % slotCount) + slotCount) % slotCount;
    if (next === selectedSlot) return;
    selectedSlot = next;
    onSelectionChange(next);
  };
  const queue = (type) => actions.push(Object.freeze({type}));
  const clearTransient = () => {
    lookX = 0;
    lookY = 0;
    jumpQueued = false;
    actions.length = 0;
  };
  const clearAll = () => {
    pressed.clear();
    clearTransient();
  };

  const onKeyDown = (event) => {
    if (!active()) return;
    if (DIGIT_KEYS.has(event.code)) {
      if (!event.repeat) select(DIGIT_KEYS.get(event.code));
      event.preventDefault?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
      if (!event.repeat) queue("undo");
      event.preventDefault?.();
      return;
    }
    if (event.code === "KeyZ") {
      if (!event.repeat) queue("undo");
      event.preventDefault?.();
      return;
    }
    if (event.code === "Space" && !pressed.has(event.code)) jumpQueued = true;
    pressed.add(event.code);
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code)) event.preventDefault?.();
  };
  const onKeyUp = (event) => {
    pressed.delete(event.code);
  };
  const onMouseMove = (event) => {
    if (!active()) return;
    lookX -= Number(event.movementX || 0) * lookSensitivity;
    lookY -= Number(event.movementY || 0) * lookSensitivity;
  };
  const onPointerDown = (event) => {
    if (!enabled) return;
    if (!locked()) {
      canvas.requestPointerLock?.();
      event.preventDefault?.();
      return;
    }
    if (event.button === 0) queue("break");
    else if (event.button === 2) queue("place");
    event.preventDefault?.();
  };
  const onContextMenu = (event) => event.preventDefault?.();
  const onWheel = (event) => {
    if (!active() || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    select(selectedSlot + (event.deltaY > 0 ? 1 : -1));
    event.preventDefault?.();
  };
  const onBlur = () => clearAll();

  eventTarget.addEventListener("keydown", onKeyDown);
  eventTarget.addEventListener("keyup", onKeyUp);
  eventTarget.addEventListener("mousemove", onMouseMove);
  eventTarget.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, {passive: false});

  onSelectionChange(selectedSlot);

  return Object.freeze({
    get selectedSlot() { return selectedSlot; },
    get enabled() { return enabled; },
    sample() {
      if (disposed) throw new Error("Playable input has been destroyed");
      if (!active()) {
        clearTransient();
        return Object.freeze({
          move: Object.freeze([0, 0]),
          look: Object.freeze([0, 0]),
          jump: false,
          actions: Object.freeze([]),
          selectedSlot,
        });
      }
      const move = [
        (pressed.has("KeyD") ? 1 : 0) - (pressed.has("KeyA") ? 1 : 0),
        (pressed.has("KeyW") ? 1 : 0) - (pressed.has("KeyS") ? 1 : 0),
      ];
      const frame = Object.freeze({
        move: Object.freeze(move),
        look: Object.freeze([lookX, lookY]),
        jump: jumpQueued,
        actions: Object.freeze(actions.splice(0)),
        selectedSlot,
      });
      lookX = 0;
      lookY = 0;
      jumpQueued = false;
      return frame;
    },
    select,
    suspend() {
      if (disposed || !enabled) return false;
      enabled = false;
      clearAll();
      if (documentTarget.pointerLockElement === canvas) documentTarget.exitPointerLock?.();
      return true;
    },
    resume() {
      if (disposed || enabled) return false;
      enabled = true;
      return true;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      clearAll();
      eventTarget.removeEventListener("keydown", onKeyDown);
      eventTarget.removeEventListener("keyup", onKeyUp);
      eventTarget.removeEventListener("mousemove", onMouseMove);
      eventTarget.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("wheel", onWheel);
      if (documentTarget.pointerLockElement === canvas) documentTarget.exitPointerLock?.();
    },
  });
}
