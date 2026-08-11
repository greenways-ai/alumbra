const DIGIT_KEYS = new Map([
  ["Digit1", 0], ["Digit2", 1], ["Digit3", 2], ["Digit4", 3],
  ["Digit5", 4], ["Digit6", 5], ["Digit7", 6], ["Digit8", 7],
]);

const VIRTUAL_ACTIONS = new Set(["break", "place", "undo"]);

export const PLAYABLE_VIRTUAL_INPUT_EVENT = "alumbra-playable-input";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function boundedStick(x, y) {
  const acceptedX = Number.isFinite(Number(x)) ? Number(x) : 0;
  const acceptedY = Number.isFinite(Number(y)) ? Number(y) : 0;
  const length = Math.hypot(acceptedX, acceptedY);
  if (length <= 1) return [acceptedX, acceptedY];
  return [acceptedX / length, acceptedY / length];
}

function pair(value, label) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    throw new TypeError(`${label} must be a two-entry array`);
  }
  if (value.length !== 2 || !value.every((entry) => Number.isFinite(Number(entry)))) {
    throw new TypeError(`${label} must contain two finite numbers`);
  }
  return [Number(value[0]), Number(value[1])];
}

const touchPointer = (event) => event?.pointerType === "touch" || event?.pointerType === "pen";

export function createPlayableInput({
  canvas,
  eventTarget = globalThis.window,
  documentTarget = globalThis.document,
  lookSensitivity = 0.12,
  touchLookSensitivity = 0.18,
  touchMoveRadius = 72,
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
  if (!Number.isFinite(touchLookSensitivity) || touchLookSensitivity <= 0) {
    throw new RangeError("touchLookSensitivity must be positive and finite");
  }
  if (!Number.isFinite(touchMoveRadius) || touchMoveRadius <= 0) {
    throw new RangeError("touchMoveRadius must be positive and finite");
  }
  if (!Number.isSafeInteger(slotCount) || slotCount < 1 || slotCount > 32) {
    throw new RangeError("slotCount must be an integer between 1 and 32");
  }
  if (typeof requirePointerLock !== "boolean") {
    throw new TypeError("requirePointerLock must be a boolean");
  }

  let selectedSlot = Math.max(0, Math.min(slotCount - 1, Number(initialSlot) || 0));
  const pressed = new Set();
  const desktopActions = [];
  const virtualActions = [];
  let lookX = 0;
  let lookY = 0;
  let virtualLookX = 0;
  let virtualLookY = 0;
  let virtualMoveX = 0;
  let virtualMoveY = 0;
  let jumpQueued = false;
  let virtualJumpQueued = false;
  let movePointer = null;
  let lookPointer = null;
  let enabled = true;
  let disposed = false;

  const ensureLive = () => {
    if (disposed) throw new Error("Playable input has been destroyed");
  };
  const locked = () => documentTarget.pointerLockElement === canvas;
  const desktopActive = () => enabled && (!requirePointerLock || locked());
  const select = (slot) => {
    if (!Number.isFinite(Number(slot))) return;
    const next = ((Math.trunc(Number(slot)) % slotCount) + slotCount) % slotCount;
    if (next === selectedSlot) return;
    selectedSlot = next;
    onSelectionChange(next);
  };
  const queueDesktop = (type) => desktopActions.push(Object.freeze({type}));
  const releasePointer = (value) => {
    if (!value) return;
    try {
      canvas.releasePointerCapture?.(value.id);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  };
  const clearTransient = () => {
    lookX = 0;
    lookY = 0;
    virtualLookX = 0;
    virtualLookY = 0;
    jumpQueued = false;
    virtualJumpQueued = false;
    desktopActions.length = 0;
    virtualActions.length = 0;
  };
  const resetVirtual = () => {
    releasePointer(movePointer);
    releasePointer(lookPointer);
    movePointer = null;
    lookPointer = null;
    virtualMoveX = 0;
    virtualMoveY = 0;
    virtualLookX = 0;
    virtualLookY = 0;
    virtualJumpQueued = false;
    virtualActions.length = 0;
  };
  const clearAll = () => {
    pressed.clear();
    clearTransient();
    resetVirtual();
  };

  const onKeyDown = (event) => {
    if (!desktopActive()) return;
    if (DIGIT_KEYS.has(event.code)) {
      if (!event.repeat) select(DIGIT_KEYS.get(event.code));
      event.preventDefault?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
      if (!event.repeat) queueDesktop("undo");
      event.preventDefault?.();
      return;
    }
    if (event.code === "KeyZ") {
      if (!event.repeat) queueDesktop("undo");
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
    if (!desktopActive()) return;
    lookX -= Number(event.movementX || 0) * lookSensitivity;
    lookY -= Number(event.movementY || 0) * lookSensitivity;
  };
  const touchRole = (event) => {
    const rect = canvas.getBoundingClientRect?.();
    const left = Number(rect?.left ?? 0);
    const width = Number(rect?.width ?? eventTarget?.innerWidth ?? 1);
    const preferred = Number(event.clientX || 0) < left + width / 2 ? "move" : "look";
    if (preferred === "move" && !movePointer) return "move";
    if (preferred === "look" && !lookPointer) return "look";
    if (!movePointer) return "move";
    if (!lookPointer) return "look";
    return null;
  };
  const startTouch = (event) => {
    const role = touchRole(event);
    if (!role) return;
    const pointer = {
      id: event.pointerId,
      startX: Number(event.clientX || 0),
      startY: Number(event.clientY || 0),
      lastX: Number(event.clientX || 0),
      lastY: Number(event.clientY || 0),
    };
    if (role === "move") movePointer = pointer;
    else lookPointer = pointer;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement rather than an input prerequisite.
    }
    event.preventDefault?.();
  };
  const onPointerDown = (event) => {
    if (!enabled) return;
    if (touchPointer(event)) {
      startTouch(event);
      return;
    }
    if (requirePointerLock && !locked()) {
      canvas.requestPointerLock?.();
      event.preventDefault?.();
      return;
    }
    if (!desktopActive()) return;
    if (event.button === 0) queueDesktop("break");
    else if (event.button === 2) queueDesktop("place");
    event.preventDefault?.();
  };
  const onPointerMove = (event) => {
    if (!enabled || !touchPointer(event)) return;
    if (movePointer?.id === event.pointerId) {
      const dx = Number(event.clientX || 0) - movePointer.startX;
      const dy = Number(event.clientY || 0) - movePointer.startY;
      const [x, y] = boundedStick(dx / touchMoveRadius, -dy / touchMoveRadius);
      virtualMoveX = x;
      virtualMoveY = y;
      movePointer.lastX = Number(event.clientX || 0);
      movePointer.lastY = Number(event.clientY || 0);
      event.preventDefault?.();
      return;
    }
    if (lookPointer?.id === event.pointerId) {
      const nextX = Number(event.clientX || 0);
      const nextY = Number(event.clientY || 0);
      virtualLookX -= (nextX - lookPointer.lastX) * touchLookSensitivity;
      virtualLookY -= (nextY - lookPointer.lastY) * touchLookSensitivity;
      lookPointer.lastX = nextX;
      lookPointer.lastY = nextY;
      event.preventDefault?.();
    }
  };
  const finishTouch = (event) => {
    if (movePointer?.id === event.pointerId) {
      releasePointer(movePointer);
      movePointer = null;
      virtualMoveX = 0;
      virtualMoveY = 0;
      event.preventDefault?.();
    }
    if (lookPointer?.id === event.pointerId) {
      releasePointer(lookPointer);
      lookPointer = null;
      event.preventDefault?.();
    }
  };
  const onContextMenu = (event) => event.preventDefault?.();
  const onWheel = (event) => {
    if (!desktopActive() || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    select(selectedSlot + (event.deltaY > 0 ? 1 : -1));
    event.preventDefault?.();
  };
  const onBlur = () => clearAll();
  const onVirtualInput = (event) => {
    if (!enabled) return;
    const detail = event?.detail ?? {};
    const type = String(detail.type ?? "");
    if (type === "jump") {
      virtualJumpQueued = true;
    } else if (VIRTUAL_ACTIONS.has(type)) {
      virtualActions.push(Object.freeze({type}));
    } else if (type === "move") {
      const [x, y] = pair(detail.value, "Virtual move");
      [virtualMoveX, virtualMoveY] = boundedStick(x, y);
    } else if (type === "look") {
      const [x, y] = pair(detail.value, "Virtual look");
      virtualLookX += x;
      virtualLookY += y;
    } else if (type === "clear") {
      resetVirtual();
    } else {
      return;
    }
    event.preventDefault?.();
  };

  eventTarget.addEventListener("keydown", onKeyDown);
  eventTarget.addEventListener("keyup", onKeyUp);
  eventTarget.addEventListener("mousemove", onMouseMove);
  eventTarget.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", finishTouch);
  canvas.addEventListener("pointercancel", finishTouch);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, {passive: false});
  canvas.addEventListener(PLAYABLE_VIRTUAL_INPUT_EVENT, onVirtualInput);

  onSelectionChange(selectedSlot);

  return Object.freeze({
    get selectedSlot() { return selectedSlot; },
    get enabled() { return enabled; },
    get touchActive() { return movePointer != null || lookPointer != null; },
    sample() {
      ensureLive();
      if (!enabled) {
        clearTransient();
        return Object.freeze({
          move: Object.freeze([0, 0]),
          look: Object.freeze([0, 0]),
          jump: false,
          actions: Object.freeze([]),
          selectedSlot,
        });
      }
      const useDesktop = desktopActive();
      const desktopMove = useDesktop
        ? [
          (pressed.has("KeyD") ? 1 : 0) - (pressed.has("KeyA") ? 1 : 0),
          (pressed.has("KeyW") ? 1 : 0) - (pressed.has("KeyS") ? 1 : 0),
        ]
        : [0, 0];
      if (!useDesktop) {
        lookX = 0;
        lookY = 0;
        jumpQueued = false;
        desktopActions.length = 0;
      }
      const move = [
        clamp(desktopMove[0] + virtualMoveX, -1, 1),
        clamp(desktopMove[1] + virtualMoveY, -1, 1),
      ];
      const frame = Object.freeze({
        move: Object.freeze(move),
        look: Object.freeze([lookX + virtualLookX, lookY + virtualLookY]),
        jump: Boolean(jumpQueued || virtualJumpQueued),
        actions: Object.freeze([
          ...desktopActions.splice(0),
          ...virtualActions.splice(0),
        ]),
        selectedSlot,
      });
      lookX = 0;
      lookY = 0;
      virtualLookX = 0;
      virtualLookY = 0;
      jumpQueued = false;
      virtualJumpQueued = false;
      return frame;
    },
    select,
    setVirtualMove(value) {
      ensureLive();
      const [x, y] = pair(value, "Virtual move");
      [virtualMoveX, virtualMoveY] = boundedStick(x, y);
      return Object.freeze([virtualMoveX, virtualMoveY]);
    },
    addVirtualLook(value) {
      ensureLive();
      const [x, y] = pair(value, "Virtual look");
      virtualLookX += x;
      virtualLookY += y;
      return true;
    },
    queueJump() {
      ensureLive();
      if (!enabled) return false;
      virtualJumpQueued = true;
      return true;
    },
    queueAction(type) {
      ensureLive();
      const action = String(type);
      if (!VIRTUAL_ACTIONS.has(action)) {
        throw new RangeError(`Unsupported virtual action: ${action}`);
      }
      if (!enabled) return false;
      virtualActions.push(Object.freeze({type: action}));
      return true;
    },
    clearVirtual() {
      ensureLive();
      resetVirtual();
      return true;
    },
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
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", finishTouch);
      canvas.removeEventListener("pointercancel", finishTouch);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener(PLAYABLE_VIRTUAL_INPUT_EVENT, onVirtualInput);
      if (documentTarget.pointerLockElement === canvas) documentTarget.exitPointerLock?.();
    },
  });
}
