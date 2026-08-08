const keyDown = (keyboard, key) => Boolean(keyboard?.isPressed?.(key));

export function createFirstPersonController({
  pc,
  app,
  camera,
  canvas,
  eventTarget = globalThis.window,
  documentTarget = globalThis.document,
  keyboard = app?.keyboard,
  speed = 8,
  fastMultiplier = 3,
  lookSensitivity = 0.12,
  initialYaw = 45,
  initialPitch = -20,
} = {}) {
  if (!pc || !app || !camera || !canvas) throw new TypeError("First-person controller requires pc, app, camera and canvas");
  if (!eventTarget?.addEventListener || !documentTarget?.addEventListener) {
    throw new TypeError("First-person controller requires browser event targets");
  }
  let yaw = Number(initialYaw) || 0;
  let pitch = Number(initialPitch) || 0;
  let disposed = false;

  const onPointerDown = () => canvas.requestPointerLock?.();
  const onMouseMove = (event) => {
    if (documentTarget.pointerLockElement !== canvas) return;
    yaw -= Number(event.movementX || 0) * lookSensitivity;
    pitch = Math.max(-89, Math.min(89, pitch - Number(event.movementY || 0) * lookSensitivity));
    camera.setLocalEulerAngles?.(pitch, yaw, 0);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  eventTarget.addEventListener("mousemove", onMouseMove);
  camera.setLocalEulerAngles?.(pitch, yaw, 0);

  const update = (delta) => {
    const seconds = Math.max(0, Number(delta) || 0);
    const sprinting = keyDown(keyboard, pc.KEY_SHIFT);
    const distance = speed * (sprinting ? fastMultiplier : 1) * seconds;
    const radians = yaw * Math.PI / 180;
    const forward = [Math.sin(radians), 0, -Math.cos(radians)];
    const right = [Math.cos(radians), 0, Math.sin(radians)];
    const movement = [0, 0, 0];
    if (keyDown(keyboard, pc.KEY_W)) movement.forEach((_, axis) => { movement[axis] += forward[axis]; });
    if (keyDown(keyboard, pc.KEY_S)) movement.forEach((_, axis) => { movement[axis] -= forward[axis]; });
    if (keyDown(keyboard, pc.KEY_D)) movement.forEach((_, axis) => { movement[axis] += right[axis]; });
    if (keyDown(keyboard, pc.KEY_A)) movement.forEach((_, axis) => { movement[axis] -= right[axis]; });
    if (keyDown(keyboard, pc.KEY_SPACE)) movement[1] += 1;
    if (keyDown(keyboard, pc.KEY_CONTROL)) movement[1] -= 1;
    const length = Math.hypot(...movement);
    if (length === 0) return;
    const current = camera.getLocalPosition?.() ?? camera.getPosition?.();
    if (!current) return;
    const values = [current.x, current.y, current.z];
    for (let axis = 0; axis < 3; axis += 1) values[axis] += movement[axis] / length * distance;
    camera.setLocalPosition?.(...values);
  };
  const updateHandle = app.on?.("update", update);

  return Object.freeze({
    get orientation() {
      return Object.freeze({ yaw, pitch });
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("pointerdown", onPointerDown);
      eventTarget.removeEventListener("mousemove", onMouseMove);
      updateHandle?.off?.();
      if (!updateHandle?.off) app.off?.("update", update);
      if (documentTarget.pointerLockElement === canvas) documentTarget.exitPointerLock?.();
    },
  });
}
