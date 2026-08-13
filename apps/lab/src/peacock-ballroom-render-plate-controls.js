const body = document.body;
const presentationButton = document.querySelector("[data-ballroom-presentation-toggle]");
const appearanceButton = document.querySelector("[data-ballroom-appearance-toggle]");

if (!body || !presentationButton || !appearanceButton) {
  throw new Error("Peacock Ballroom render controls are missing their buttons");
}

let busy = false;
let disposed = false;

function currentPresentation() {
  return body.dataset.peacockBallroomRenderPlatePresentation === "structural"
    ? "structural"
    : "rendered";
}

function currentAppearance() {
  return body.dataset.peacockBallroomRenderPlateAppearance === "night"
    ? "night"
    : "day";
}

function sync() {
  const presentation = currentPresentation();
  const appearance = currentAppearance();
  presentationButton.setAttribute("aria-pressed", presentation === "rendered" ? "true" : "false");
  presentationButton.dataset.activeValue = presentation;
  presentationButton.textContent = presentation === "rendered" ? "Rendered" : "Structure";
  presentationButton.title = presentation === "rendered"
    ? "Show the structural world without the original render"
    : "Show the original render over the navigable world";
  appearanceButton.setAttribute("aria-pressed", appearance === "night" ? "true" : "false");
  appearanceButton.dataset.activeValue = appearance;
  appearanceButton.textContent = appearance === "night" ? "Night" : "Day";
  appearanceButton.title = appearance === "night"
    ? "Switch to the original daytime rendering"
    : "Switch to the original nighttime rendering";
  presentationButton.disabled = busy;
  appearanceButton.disabled = busy || currentPresentation() !== "rendered";
  body.dataset.peacockBallroomRenderControls = busy ? "busy" : "ready";
}

const presentationClick = () => {
  if (busy || disposed) return;
  const setter = globalThis.__PEACOCK_BALLROOM_SET_PRESENTATION__;
  if (typeof setter !== "function") return;
  const next = currentPresentation() === "rendered" ? "structural" : "rendered";
  try {
    setter(next);
  } finally {
    sync();
  }
};

const appearanceClick = async () => {
  if (busy || disposed || currentPresentation() !== "rendered") return;
  const setter = globalThis.__PEACOCK_BALLROOM_SET_RENDER_APPEARANCE__;
  if (typeof setter !== "function") return;
  busy = true;
  sync();
  const next = currentAppearance() === "night" ? "day" : "night";
  try {
    await setter(next);
  } catch (error) {
    console.warn("Peacock Ballroom appearance switch fell back to the current render", error);
  } finally {
    busy = false;
    sync();
  }
};

presentationButton.addEventListener("click", presentationClick);
appearanceButton.addEventListener("click", appearanceClick);

const observer = new MutationObserver(sync);
observer.observe(body, {
  attributes: true,
  attributeFilter: [
    "data-peacock-ballroom-render-plate-appearance",
    "data-peacock-ballroom-render-plate-presentation",
    "data-peacock-ballroom-render-plate",
  ],
});

sync();

function destroy() {
  if (disposed) return;
  disposed = true;
  observer.disconnect();
  presentationButton.removeEventListener("click", presentationClick);
  appearanceButton.removeEventListener("click", appearanceClick);
}
window.addEventListener("pagehide", destroy, {once: true});
