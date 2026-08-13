# Peacock Ballroom render plates

The Peacock Ballroom uses a **hybrid navigable shell** rather than asking the voxel renderer to reproduce every detail of the original artwork.

```text
portable Hara render-plate descriptor
                ↓
trusted Alumbra asset resolver
                ↓
pointer-transparent DOM render plate
                ↓
canonical navigable canvas and collision shell
```

The original rendering is presentation only. Canonical world state, collisions, movement, block edits, lighting evidence and disposal remain owned by the existing Alumbra world and PlayCanvas viewport.

## Exact source assets

The portable descriptor identifies the two rights-clean visual-language masters by repository path and Git object identity:

| Appearance | Master path | Git blob |
| --- | --- | --- |
| Day | `artwork/masters/greenways/peacock-ballroom-day.png` | `ceeb1917f99142f39f06e6de7424333e9d2df360` |
| Night | `artwork/masters/greenways/peacock-ballroom-night.png` | `fad7dff0d4bd7f21af0af6aa73508caeb4c177de` |

The portable value deliberately contains no delivery URL. The trusted browser host resolves those exact identities to the installed visual-language delivery paths under `https://oss.greenways.ai/visual-language/`.

## Portable contract

`@greenways/alumbra-hara` owns:

```text
alumbra.render-plate-set/1
```

The contract contains:

- exact asset identities;
- the existing named Peacock Ballroom states;
- camera anchors matching the canonical state position, yaw and pitch;
- crop focus and zoom;
- plate and geometry blend values;
- bounded desktop and mobile parallax/fade profiles.

It contains no DOM nodes, image objects, canvas handles, PlayCanvas entities, callbacks, shaders, URLs or renderer resources.

The authoritative Hara source is:

```text
packages/hara/src/gw/alumbra/peacock_ballroom_render_plates.hal
```

The validated JavaScript mirror is:

```text
packages/hara/src/peacock-ballroom-render-plates.js
```

## Named-state calibration

Every existing provider state has an explicit render calibration:

```text
ballroom/day
ballroom/gallery-overlook
ballroom/mosaic-floor
```

Each state keeps its canonical Hara player position, yaw and pitch. The plate begins at maximum fidelity at that anchor.

As the player moves or looks away, the host computes bounded distance, yaw and pitch fidelity:

```text
near calibrated view
  → original plate dominates
  → structural geometry remains faintly visible

far from calibrated view
  → plate fades toward its minimum opacity
  → structural geometry becomes dominant
```

This prevents a single source image from pretending to be correct from arbitrary viewpoints.

## Browser host

The browser host lives at:

```text
apps/lab/src/peacock-ballroom-render-plate.js
```

It creates one DOM-backed image layer with these properties:

- pointer-transparent;
- outside the WebGL canvas;
- no canvas drawing or texture upload;
- exact installed-origin asset resolution;
- eager image loading and optional decode;
- superseded-load cancellation;
- explicit suspend, resume and destroy;
- structural fallback if loading fails.

The host publishes:

```text
alumbra.render-plate-evidence/1
```

Evidence includes the selected state, appearance, asset ID, source blob, load state, opacity, structural geometry opacity, fidelity, crop, translation, scale and lifecycle counters.

## Page integration

The standalone provider document installs the plate above the existing canvas:

```text
apps/lab/peacock-ballroom.html
apps/lab/src/peacock-ballroom-render-plate-entry.js
```

The image layer does not replace the world document, progress rail, controls or canvas. If the plate cannot load, the canvas returns to full opacity and the world remains usable.

## Navigation-driven parallax

`peacock-ballroom-render-plate-pose.js` observes only existing presentation signals:

- named-state changes;
- the player position already published by the viewport HUD;
- desktop pointer-lock look deltas;
- right-side touch look deltas.

It does not stop, replace or synthesize navigation events. It cannot move the player, mutate chunks or dispatch world actions.

Pose updates are coalesced to animation frames and delivered through the bounded render-plate frame seam.

## Visible controls

The page exposes two independent choices:

```text
Rendered  ↔ Structure
Day       ↔ Night
```

`Rendered` is the default. `Structure` suspends the image plate and restores the canonical canvas to full opacity. Appearance switching is disabled while structural mode is active.

These choices use `history.replaceState`; they do not reload the page or rewrite provider/world/state identity.

## Progress

The original artwork is the sixth honest assembly stage:

```text
Renderer surface
Canonical chunks
Ornamental projection
Original rendering
Lighting & evidence
Player controls
```

The world can reach canonical readiness while the image is still loading, but the overall rail remains at 96% until the selected plate completes. Structural mode is an explicit bypass. Image failure is reported as a structural fallback rather than a world failure.

The render-progress evidence format is:

```text
alumbra.peacock-ballroom-render-progress/1
```

## Security and authority boundary

The render plate must never receive:

- canonical chunks or mutation authority;
- collision or player authority;
- Hodos provider credentials;
- arbitrary network URLs;
- canvas or WebGL contexts;
- shaders, mesh instances or texture handles;
- event cancellation or navigation ownership.

The trusted resolver accepts only the two installed Peacock Ballroom identities and verifies the fixed `oss.greenways.ai/visual-language` origin and path family.

## Browser release evidence

The Chromium review train should verify:

- all three named daytime states;
- the nighttime master;
- structural fallback presentation;
- touch/mobile layout;
- exact asset and Git-blob identities;
- positive matte-plate opacity in rendered mode;
- subordinate geometry opacity in rendered mode;
- zero plate opacity and full geometry opacity in structural mode;
- six progress stages and completed render progress;
- no page errors;
- a screenshot for every reviewed presentation.

## Current limitation

A single render master cannot provide correct parallax from every location. The bounded fade policy is therefore intentional. Additional authored views can be added later as new exact assets and named-state calibrations without changing the canonical world or provider contract.
