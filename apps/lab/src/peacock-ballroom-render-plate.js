import {
  PEACOCK_BALLROOM_RENDER_PLATE_FORMAT,
  createPeacockBallroomRenderPlateDescriptor,
} from "@greenways/alumbra-hara";

export const PEACOCK_BALLROOM_RENDER_PLATE_EVIDENCE_FORMAT = "alumbra.render-plate-evidence/1";

const DELIVERY = Object.freeze({
  "visual-language/greenways/peacock-ballroom-day": Object.freeze({
    href: "https://oss.greenways.ai/visual-language/artwork/greenways/peacock-ballroom-day.webp",
    blob: "ceeb1917f99142f39f06e6de7424333e9d2df360",
  }),
  "visual-language/greenways/peacock-ballroom-night": Object.freeze({
    href: "https://oss.greenways.ai/visual-language/artwork/greenways/peacock-ballroom-night.webp",
    blob: "fad7dff0d4bd7f21af0af6aa73508caeb4c177de",
  }),
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const clamp01 = (value) => clamp(Number(value) || 0, 0, 1);
const round = (value, precision = 4) => Number(Number(value).toFixed(precision));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function angleDelta(value, anchor) {
  let delta = (Number(value) || 0) - (Number(anchor) || 0);
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function pose(value, fallback) {
  const input = value && typeof value === "object" ? value : {};
  const position = Array.isArray(input.position) && input.position.length === 3
    ? input.position.map((entry, index) => {
      const number = Number(entry);
      return Number.isFinite(number) ? number : fallback.position[index];
    })
    : [...fallback.position];
  const yaw = Number.isFinite(Number(input.yaw)) ? Number(input.yaw) : fallback.yaw;
  const pitch = Number.isFinite(Number(input.pitch)) ? Number(input.pitch) : fallback.pitch;
  return Object.freeze({position: Object.freeze(position), yaw, pitch});
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function resolvePeacockBallroomRenderPlateAsset(assetId) {
  const delivery = DELIVERY[String(assetId)];
  if (!delivery) throw new Error(`Peacock Ballroom render asset is not installed: ${assetId}`);
  const url = new URL(delivery.href);
  if (url.protocol !== "https:"
      || url.origin !== "https://oss.greenways.ai"
      || !url.pathname.startsWith("/visual-language/artwork/greenways/peacock-ballroom-")) {
    throw new Error("Peacock Ballroom render asset resolved outside the installed visual-language origin");
  }
  return delivery.href;
}

export function peacockBallroomRenderPlateBlend(descriptor, currentPose = descriptor?.anchor) {
  if (!descriptor || descriptor.format !== PEACOCK_BALLROOM_RENDER_PLATE_FORMAT) {
    throw new TypeError("Peacock Ballroom render plate blend requires a normalized descriptor");
  }
  const anchor = descriptor.anchor;
  const current = pose(currentPose, anchor);
  const dx = current.position[0] - anchor.position[0];
  const dy = current.position[1] - anchor.position[1];
  const dz = current.position[2] - anchor.position[2];
  const distance = Math.hypot(dx, dy, dz);
  const yaw = angleDelta(current.yaw, anchor.yaw);
  const pitch = current.pitch - anchor.pitch;
  const profile = descriptor.parallax;
  const distanceFidelity = clamp01(1 - distance / profile.fadeDistance);
  const yawFidelity = clamp01(1 - Math.abs(yaw) / profile.fadeYaw);
  const pitchFidelity = clamp01(1 - Math.abs(pitch) / profile.fadePitch);
  const fidelity = Math.min(distanceFidelity, yawFidelity, pitchFidelity);
  const opacity = profile.minimumOpacity
    + (descriptor.blend.plateOpacity - profile.minimumOpacity) * fidelity;
  const geometryOpacity = clamp(
    descriptor.blend.geometryOpacity + (1 - fidelity) * 0.64,
    descriptor.blend.geometryOpacity,
    0.92,
  );
  const translateX = clamp(
    -yaw * profile.parallaxX + dx * 0.18 - dz * 0.035,
    -8,
    8,
  );
  const translateY = clamp(
    pitch * profile.parallaxY - dy * 0.18,
    -6,
    6,
  );
  const scale = descriptor.crop.zoom + (1 - fidelity) * 0.045;
  return deepFreeze({
    fidelity: round(fidelity),
    distance: round(distance),
    yawDelta: round(yaw),
    pitchDelta: round(pitch),
    opacity: round(opacity),
    geometryOpacity: round(geometryOpacity),
    translate: Object.freeze([round(translateX), round(translateY)]),
    scale: round(scale),
  });
}

export function createPeacockBallroomRenderPlateHost({
  root,
  document: documentRef = root?.ownerDocument ?? globalThis.document,
  profile = "desktop",
  appearance = "day",
  resolveAsset = resolvePeacockBallroomRenderPlateAsset,
  onEvidence = () => {},
} = {}) {
  if (!root?.append) throw new TypeError("Peacock Ballroom render plate host requires a DOM mount");
  if (!documentRef?.createElement) throw new TypeError("Peacock Ballroom render plate host requires a document");
  if (typeof resolveAsset !== "function" || typeof onEvidence !== "function") {
    throw new TypeError("Peacock Ballroom render plate host callbacks must be functions");
  }

  const layer = documentRef.createElement("div");
  const image = documentRef.createElement("img");
  const wash = documentRef.createElement("span");
  layer.className = "ballroom-render-plate-layer";
  layer.dataset.renderPlateState = "idle";
  layer.setAttribute("aria-hidden", "true");
  image.className = "ballroom-render-plate-image";
  image.alt = "";
  image.decoding = "async";
  image.loading = "eager";
  image.fetchPriority = "high";
  image.draggable = false;
  wash.className = "ballroom-render-plate-wash";
  wash.setAttribute("aria-hidden", "true");
  layer.append(image, wash);
  root.append(layer);

  let descriptor = null;
  let blend = null;
  let status = "idle";
  let loaded = false;
  let suspended = false;
  let destroyed = false;
  let generation = 0;
  let opens = 0;
  let poses = 0;
  let suspensions = 0;
  let resumes = 0;
  let failure = "";
  let pending = null;

  const evidence = () => deepFreeze({
    format: PEACOCK_BALLROOM_RENDER_PLATE_EVIDENCE_FORMAT,
    status,
    stateId: descriptor?.stateId ?? null,
    profile: descriptor?.profile ?? profile,
    appearance: descriptor?.appearance ?? appearance,
    assetId: descriptor?.asset?.id ?? null,
    sourceBlob: descriptor?.asset?.blob ?? null,
    loaded,
    suspended,
    opacity: blend?.opacity ?? 0,
    geometryOpacity: blend?.geometryOpacity ?? 1,
    fidelity: blend?.fidelity ?? 0,
    translate: blend?.translate ?? Object.freeze([0, 0]),
    scale: blend?.scale ?? 1,
    crop: descriptor?.crop?.focus ?? Object.freeze([50, 50]),
    opens,
    poses,
    suspensions,
    resumes,
    failure,
  });

  const publish = () => {
    const value = evidence();
    try {
      onEvidence(value);
    } catch {
      // Evidence observers never own the visual host.
    }
    return value;
  };

  const apply = () => {
    if (!descriptor || !blend) return publish();
    const [focusX, focusY] = descriptor.crop.focus;
    const [translateX, translateY] = blend.translate;
    layer.dataset.renderPlateState = suspended ? "suspended" : status;
    layer.dataset.renderPlateAsset = descriptor.asset.id;
    layer.style.setProperty("--ballroom-render-plate-opacity", suspended ? "0" : String(blend.opacity));
    layer.style.setProperty("--ballroom-render-plate-focus-x", `${focusX}%`);
    layer.style.setProperty("--ballroom-render-plate-focus-y", `${focusY}%`);
    layer.style.setProperty("--ballroom-render-plate-x", `${translateX}%`);
    layer.style.setProperty("--ballroom-render-plate-y", `${translateY}%`);
    layer.style.setProperty("--ballroom-render-plate-scale", String(blend.scale));
    layer.setAttribute("aria-hidden", suspended ? "true" : "false");
    return publish();
  };

  const cancelPending = (reason = "Render plate load superseded") => {
    if (!pending) return;
    const current = pending;
    pending = null;
    current.cleanup();
    current.reject(abortError(reason));
  };

  const load = (href, openGeneration) => new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const finish = async () => {
      if (destroyed || openGeneration !== generation) {
        cleanup();
        reject(abortError("Render plate load became stale"));
        return;
      }
      try {
        await image.decode?.();
      } catch {
        // A completed image remains usable when decode() is unavailable or rejects.
      }
      cleanup();
      if (pending?.generation === openGeneration) pending = null;
      loaded = true;
      status = "ready";
      failure = "";
      apply();
      resolve(evidence());
    };
    const onLoad = () => { void finish(); };
    const onError = () => {
      if (destroyed || openGeneration !== generation) {
        cleanup();
        reject(abortError("Render plate load became stale"));
        return;
      }
      cleanup();
      if (pending?.generation === openGeneration) pending = null;
      loaded = false;
      status = "failed";
      failure = "installed render plate could not be loaded";
      apply();
      reject(new Error(failure));
    };
    pending = {generation: openGeneration, cleanup, reject};
    image.addEventListener("load", onLoad, {once: true});
    image.addEventListener("error", onError, {once: true});
    image.src = href;
    if (image.complete && Number(image.naturalWidth) > 0) queueMicrotask(onLoad);
  });

  async function open(stateId, options = {}) {
    if (destroyed) throw new Error("Peacock Ballroom render plate host is destroyed");
    cancelPending();
    generation += 1;
    opens += 1;
    const openGeneration = generation;
    const nextProfile = options.profile ?? profile;
    const nextAppearance = options.appearance ?? appearance;
    descriptor = createPeacockBallroomRenderPlateDescriptor(
      stateId,
      nextProfile,
      nextAppearance,
    );
    blend = peacockBallroomRenderPlateBlend(descriptor, descriptor.anchor);
    loaded = false;
    failure = "";
    status = "loading";
    suspended = false;
    image.removeAttribute?.("src");
    apply();
    const href = resolveAsset(descriptor.asset.id, descriptor.asset);
    if (typeof href !== "string" || !href) throw new Error("Render plate resolver returned no asset URL");
    return load(href, openGeneration);
  }

  function setPose(value) {
    if (destroyed) throw new Error("Peacock Ballroom render plate host is destroyed");
    if (!descriptor) return evidence();
    poses += 1;
    blend = peacockBallroomRenderPlateBlend(descriptor, value);
    return apply();
  }

  function suspend(reason = "manual") {
    if (destroyed || suspended) return false;
    suspended = true;
    suspensions += 1;
    layer.dataset.renderPlateReason = String(reason).slice(0, 128);
    apply();
    return true;
  }

  function resume(reason = "manual") {
    if (destroyed || !suspended) return false;
    suspended = false;
    resumes += 1;
    layer.dataset.renderPlateReason = String(reason).slice(0, 128);
    apply();
    return true;
  }

  function destroy() {
    if (destroyed) return evidence();
    cancelPending("Render plate host destroyed");
    destroyed = true;
    status = "disposed";
    loaded = false;
    suspended = false;
    failure = "";
    image.removeAttribute?.("src");
    image.src = "";
    layer.remove?.();
    return evidence();
  }

  return Object.freeze({
    element: layer,
    image,
    open,
    setPose,
    suspend,
    resume,
    snapshot: evidence,
    destroy,
  });
}
