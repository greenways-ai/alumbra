export const PEACOCK_BALLROOM_ARCHITECTURE_FORMAT = "alumbra.architectural-scene/1";
export const PEACOCK_BALLROOM_ARCHITECTURE_ID = "ballroom/hybrid-ornamental-architecture";

const PROFILE_IDS = new Set(["desktop", "mobile"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

export const PEACOCK_BALLROOM_ARCHITECTURE = deepFreeze({
  format: PEACOCK_BALLROOM_ARCHITECTURE_FORMAT,
  id: PEACOCK_BALLROOM_ARCHITECTURE_ID,
  package: "hara:greenways/alumbra-peacock-ballroom@0.1.0",
  materials: [
    {id: "architecture/ivory", color: [0.92, 0.87, 0.75], gloss: 0.52, metalness: 0},
    {id: "architecture/marble", color: [0.96, 0.96, 0.92], gloss: 0.84, metalness: 0.02},
    {id: "architecture/gold", color: [0.78, 0.55, 0.17], gloss: 0.82, metalness: 0.88},
    {id: "architecture/teal-glass", color: [0.03, 0.26, 0.28], gloss: 0.90, metalness: 0.05},
    {id: "architecture/emerald", color: [0.02, 0.28, 0.16], gloss: 0.78, metalness: 0.18},
    {id: "architecture/lapis", color: [0.03, 0.11, 0.42], gloss: 0.72, metalness: 0.12},
    {id: "architecture/amber", color: [0.95, 0.45, 0.08], gloss: 0.74, metalness: 0.16, emissive: [1, 0.28, 0.03], emissiveIntensity: 3.5},
    {id: "architecture/wood", color: [0.13, 0.055, 0.025], gloss: 0.34, metalness: 0},
    {id: "architecture/foliage", color: [0.035, 0.30, 0.13], gloss: 0.20, metalness: 0},
    {id: "architecture/floor-sheen", color: [0.23, 0.40, 0.38], gloss: 0.96, metalness: 0.08},
  ],
  layout: {
    floorY: 2.02,
    columns: {
      x: [-18, 18],
      z: [-20.5, -12.5, -4.5, 4.5, 12.5, 20.5],
      radius: 1.18,
      height: 14.4,
      baseHeight: 0.56,
      capitalHeight: 0.72,
    },
    arches: {
      sideX: [-18, 18],
      centerZ: [-16.5, -8.5, 0, 8.5, 16.5],
      span: 7.25,
      springY: 15.15,
      rise: 5.55,
      radius: 0.42,
    },
    gallery: {
      sideX: [-17.15, 17.15],
      y: 12.72,
      minimumZ: -22,
      maximumZ: 22,
      postStep: 4,
    },
    stairs: {
      centerX: [-14, 14],
      centerZ: 19.5,
      centerY: 6.55,
      width: 7.3,
      length: 12.72,
      thickness: 0.34,
      angle: 45,
    },
    dome: {
      center: [0, 21.15, 0],
      radius: 12.2,
      height: 9.2,
      rings: [0.18, 0.48, 0.72],
      azimuths: [0, 45, 90, 135],
    },
    chandeliers: {
      z: [-12, 0, 12],
      ceilingY: 20.6,
      ringY: 16.15,
      radius: 2.35,
      bulbs: 10,
    },
    mosaic: {
      center: [0, 2.07, 0],
      ringRadii: [3.1, 6.2, 9.4, 12.2],
      feathers: 12,
      featherRadius: 7.3,
    },
    planters: {
      positions: [[-22, 2.02, -20], [22, 2.02, -20], [-22, 2.02, 20], [22, 2.02, 20]],
    },
    windows: {
      sideX: [-24.55, 24.55],
      centerZ: [-20, -12, -4, 4, 12, 20],
      centerY: 10.5,
      width: 5.45,
      height: 10.4,
    },
  },
  profiles: {
    // The canonical voxel world owns lighting and shadow maps. The smooth
    // projection uses opaque ornamental materials so embedded and SwiftShader
    // contexts never allocate competing translucent or shadow render targets.
    desktop: {archSegments: 6, domeSegments: 7, foliageLeaves: 9, chandelierBulbs: 10, shadows: false},
    mobile: {archSegments: 4, domeSegments: 5, foliageLeaves: 5, chandelierBulbs: 6, shadows: false},
  },
});

export function createPeacockBallroomArchitectureDescriptor(profile = "desktop") {
  const profileId = String(profile);
  if (!PROFILE_IDS.has(profileId)) throw new Error(`Unsupported Peacock Ballroom architecture profile: ${profileId}`);
  return deepFreeze({
    format: PEACOCK_BALLROOM_ARCHITECTURE.format,
    id: PEACOCK_BALLROOM_ARCHITECTURE.id,
    package: PEACOCK_BALLROOM_ARCHITECTURE.package,
    profile: profileId,
    materials: PEACOCK_BALLROOM_ARCHITECTURE.materials,
    layout: PEACOCK_BALLROOM_ARCHITECTURE.layout,
    detail: PEACOCK_BALLROOM_ARCHITECTURE.profiles[profileId],
  });
}
