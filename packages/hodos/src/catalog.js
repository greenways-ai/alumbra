import {
  ALUMBRA_RENDERER_CATALOG as GENERATED_CATALOG,
  ALUMBRA_RENDERER_INSTALLED_DEMOS as GENERATED_INSTALLED_DEMOS,
} from "../generated/renderer-catalog.js";

export const PEACOCK_BALLROOM_ACTIVITY_ID = "alumbra-hara/peacock-ballroom";
export const PEACOCK_BALLROOM_PROVIDER_ID = "alumbra/world";
export const PEACOCK_BALLROOM_PACKAGE = "hara:greenways/alumbra-peacock-ballroom@0.1.0";
export const PEACOCK_BALLROOM_STATE_IDS = Object.freeze([
  "ballroom/day",
  "ballroom/gallery-overlook",
  "ballroom/mosaic-floor",
]);
export const PEACOCK_BALLROOM_DEFAULT_STATE = PEACOCK_BALLROOM_STATE_IDS[0];

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
};

export const PEACOCK_BALLROOM_CATALOG_ACTIVITY = deepFreeze({
  id: PEACOCK_BALLROOM_ACTIVITY_ID,
  toolsetId: "alumbra-hara",
  title: "Peacock Ballroom",
  level: "Integration",
  summary: "Enter a Hara-authored architectural world through the installed Alumbra world provider.",
  instructions: Object.freeze([
    "Open the provider-backed Peacock Ballroom and move between its entrance, gallery and mosaic-floor states.",
  ]),
  path: null,
  checkCount: 10,
  metadata: Object.freeze({
    package: "@greenways/alumbra-hara",
    demo: "peacock-ballroom",
    surface: "viewport",
    providerId: PEACOCK_BALLROOM_PROVIDER_ID,
    providerPackage: PEACOCK_BALLROOM_PACKAGE,
    states: PEACOCK_BALLROOM_STATE_IDS,
    tags: Object.freeze([
      "rules",
      "architecture",
      "provider-world",
      "playable-lab",
    ]),
    theme: "dark",
    viewport: Object.freeze({width: 1180, height: 760}),
  }),
});

function insertPeacockBallroom(activities) {
  const output = [];
  for (const activity of activities) {
    output.push(activity);
    if (activity.id === "alumbra-hara/packaged-height-field") {
      output.push(PEACOCK_BALLROOM_CATALOG_ACTIVITY);
    }
  }
  if (!output.some((activity) => activity.id === PEACOCK_BALLROOM_ACTIVITY_ID)) {
    output.unshift(PEACOCK_BALLROOM_CATALOG_ACTIVITY);
  }
  return Object.freeze(output);
}

export const ALUMBRA_RENDERER_CATALOG = deepFreeze({
  ...GENERATED_CATALOG,
  activities: insertPeacockBallroom(GENERATED_CATALOG.activities),
});

export const ALUMBRA_RENDERER_INSTALLED_DEMOS = deepFreeze({
  ...GENERATED_INSTALLED_DEMOS,
  [PEACOCK_BALLROOM_ACTIVITY_ID]: Object.freeze({
    package: "@greenways/alumbra-hara",
    demo: "peacock-ballroom",
    project: "packages/hara/showcase/peacock-ballroom",
    surface: "viewport",
    host: "peacock-ballroom",
    provider: Object.freeze({
      id: PEACOCK_BALLROOM_PROVIDER_ID,
      activity: PEACOCK_BALLROOM_ACTIVITY_ID,
      package: PEACOCK_BALLROOM_PACKAGE,
      defaultState: PEACOCK_BALLROOM_DEFAULT_STATE,
      states: PEACOCK_BALLROOM_STATE_IDS,
    }),
  }),
});

const CATALOG_OVERRIDE_KEYS = new Set([
  "id", "title", "selectedToolsetId", "selectedActivityId", "selectedToolId",
  "run", "metadata", "events",
]);

export function createAlumbraRendererCatalogArea(createCatalogArea, overrides = {}) {
  if (typeof createCatalogArea !== "function") {
    throw new TypeError("createAlumbraRendererCatalogArea requires Hodos createCatalogArea");
  }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new TypeError("Alumbra Renderer Catalog overrides must be an object");
  }
  for (const key of Object.keys(overrides)) {
    if (!CATALOG_OVERRIDE_KEYS.has(key)) {
      throw new Error(`Unsupported Alumbra Renderer Catalog override: ${key}`);
    }
  }
  return createCatalogArea({
    id: "catalog/alumbra-renderer",
    title: "Renderer Catalog",
    catalogId: ALUMBRA_RENDERER_CATALOG.id,
    catalogTitle: ALUMBRA_RENDERER_CATALOG.title,
    version: ALUMBRA_RENDERER_CATALOG.version,
    source: ALUMBRA_RENDERER_CATALOG.source,
    surface: ALUMBRA_RENDERER_CATALOG.surface,
    toolsets: ALUMBRA_RENDERER_CATALOG.toolsets,
    activities: ALUMBRA_RENDERER_CATALOG.activities,
    selectedToolsetId: ALUMBRA_RENDERER_CATALOG.selectedToolsetId,
    selectedActivityId: ALUMBRA_RENDERER_CATALOG.selectedActivityId,
    capabilities: ALUMBRA_RENDERER_CATALOG.capabilities,
    ...overrides,
  });
}
