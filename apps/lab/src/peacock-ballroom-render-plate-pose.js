import {PEACOCK_BALLROOM_VIEWS} from "@greenways/alumbra-hara";

const body = document.body;
const canvas = document.querySelector("#peacock-ballroom-canvas");
const playerStat = document.querySelector('[data-ballroom-stat="player"]');

if (!body || !canvas || !playerStat) {
  throw new Error("Peacock Ballroom render parallax is missing its canvas or player evidence");
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const viewFor = (stateId) => PEACOCK_BALLROOM_VIEWS[stateId] ?? PEACOCK_BALLROOM_VIEWS["ballroom/day"];
const clonePose = (value) => ({
  position: [...value.position],
  yaw: Number(value.yaw),
  pitch: Number(value.pitch),
});

let activeState = body.dataset.peacockBallroomState || "ballroom/day";
let currentPose = clonePose(viewFor(activeState));
let touchLook = null;
let scheduled = false;
let disposed = false;

function parsePosition(value) {
  const values = String(value)
    .split(/[·,]/)
    .map((entry) => Number(entry.trim()));
  if (values.length !== 3 || values.some((entry) => !Number.isFinite(entry))) return null;
  return values;
}

function publish() {
  scheduled = false;
  if (disposed) return;
  const receiver = globalThis.__PEACOCK_BALLROOM_RENDER_PLATE_FRAME__;
  if (typeof receiver === "function") receiver({player: currentPose});
  body.dataset.peacockBallroomRenderPlatePose = "ready";
  body.dataset.peacockBallroomRenderPlatePosition = currentPose.position
    .map((entry) => Number(entry).toFixed(2))
    .join(",");
  body.dataset.peacockBallroomRenderPlateYaw = Number(currentPose.yaw).toFixed(2);
  body.dataset.peacockBallroomRenderPlatePitch = Number(currentPose.pitch).toFixed(2);
  globalThis.__PEACOCK_BALLROOM_RENDER_PLATE_POSE__ = Object.freeze({
    stateId: activeState,
    position: Object.freeze([...currentPose.position]),
    yaw: currentPose.yaw,
    pitch: currentPose.pitch,
  });
}

function schedule() {
  if (disposed || scheduled) return;
  scheduled = true;
  requestAnimationFrame(publish);
}

function resetForState(stateId) {
  activeState = stateId;
  currentPose = clonePose(viewFor(stateId));
  schedule();
}

const stateObserver = new MutationObserver(() => {
  const stateId = body.dataset.peacockBallroomState || "ballroom/day";
  if (stateId !== activeState) resetForState(stateId);
});
stateObserver.observe(body, {
  attributes: true,
  attributeFilter: ["data-peacock-ballroom-state"],
});

const playerObserver = new MutationObserver(() => {
  const position = parsePosition(playerStat.textContent);
  if (!position) return;
  currentPose = {...currentPose, position};
  schedule();
});
playerObserver.observe(playerStat, {
  characterData: true,
  childList: true,
  subtree: true,
});

function applyLookDelta(deltaX, deltaY, sensitivity) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
  currentPose = {
    ...currentPose,
    yaw: currentPose.yaw - deltaX * sensitivity,
    pitch: clamp(currentPose.pitch - deltaY * sensitivity, -85, 85),
  };
  schedule();
}

const pointerMove = (event) => {
  if (document.pointerLockElement !== canvas) return;
  applyLookDelta(Number(event.movementX) || 0, Number(event.movementY) || 0, 0.12);
};
window.addEventListener("pointermove", pointerMove);

const touchStart = (event) => {
  if (event.pointerType !== "touch") return;
  const rect = canvas.getBoundingClientRect();
  if (event.clientX < rect.left + rect.width / 2) return;
  touchLook = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
};
const touchMove = (event) => {
  if (!touchLook || event.pointerId !== touchLook.pointerId) return;
  const deltaX = event.clientX - touchLook.x;
  const deltaY = event.clientY - touchLook.y;
  touchLook.x = event.clientX;
  touchLook.y = event.clientY;
  applyLookDelta(deltaX, deltaY, 0.16);
};
const touchEnd = (event) => {
  if (touchLook?.pointerId === event.pointerId) touchLook = null;
};
canvas.addEventListener("pointerdown", touchStart);
canvas.addEventListener("pointermove", touchMove);
canvas.addEventListener("pointerup", touchEnd);
canvas.addEventListener("pointercancel", touchEnd);

schedule();

function destroy() {
  if (disposed) return;
  disposed = true;
  stateObserver.disconnect();
  playerObserver.disconnect();
  window.removeEventListener("pointermove", pointerMove);
  canvas.removeEventListener("pointerdown", touchStart);
  canvas.removeEventListener("pointermove", touchMove);
  canvas.removeEventListener("pointerup", touchEnd);
  canvas.removeEventListener("pointercancel", touchEnd);
  delete globalThis.__PEACOCK_BALLROOM_RENDER_PLATE_POSE__;
}
window.addEventListener("pagehide", destroy, {once: true});
