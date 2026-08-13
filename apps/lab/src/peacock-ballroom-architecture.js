import {
  PEACOCK_BALLROOM_ARCHITECTURE_FORMAT,
  createPeacockBallroomArchitectureDescriptor,
} from "@greenways/alumbra-hara";

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
};

const point = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain three coordinates`);
  return value.map((entry, axis) => finite(entry, `${label}[${axis}]`));
};

const freezeEvidence = (value) => Object.freeze({
  format: "alumbra.peacock-ballroom-architecture-evidence/1",
  profile: value.profile,
  status: value.status,
  entities: value.entities,
  materials: value.materials,
  columns: value.columns,
  arches: value.arches,
  stairRamps: value.stairRamps,
  domeRibs: value.domeRibs,
  chandeliers: value.chandeliers,
  mosaicElements: value.mosaicElements,
  planters: value.planters,
  windows: value.windows,
  lights: value.lights,
  suspended: value.suspended,
  baseline: value.baseline,
});

function createMaterial(pc, specification) {
  const material = new pc.StandardMaterial();
  material.name = specification.id;
  material.diffuse = new pc.Color(...specification.color);
  material.gloss = specification.gloss;
  material.useMetalness = true;
  material.metalness = specification.metalness;
  if (Array.isArray(specification.emissive)) {
    material.emissive = new pc.Color(...specification.emissive);
    material.emissiveIntensity = Number(specification.emissiveIntensity ?? 1);
  }
  if (Number(specification.opacity ?? 1) < 1) {
    material.opacity = Number(specification.opacity);
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

function createEntity(pc, app, root, {
  name,
  type,
  material,
  position = [0, 0, 0],
  scale = [1, 1, 1],
  euler = null,
  rotation = null,
  castShadows = true,
  receiveShadows = true,
}) {
  const entity = new pc.Entity(name, app);
  entity.addComponent("render", {
    type,
    material,
    castShadows,
    receiveShadows,
  });
  entity.setLocalPosition(...position);
  entity.setLocalScale(...scale);
  if (rotation) entity.setLocalRotation(rotation);
  else if (euler) entity.setLocalEulerAngles(...euler);
  root.addChild(entity);
  return entity;
}

function addSegment(pc, app, root, {
  name,
  start,
  end,
  radius,
  material,
  type = "cylinder",
  castShadows = true,
}) {
  const from = point(start, `${name} start`);
  const to = point(end, `${name} end`);
  const direction = new pc.Vec3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = direction.length();
  if (!(length > 0)) throw new RangeError(`${name} must have positive length`);
  direction.mulScalar(1 / length);
  const rotation = new pc.Quat().setFromDirections(new pc.Vec3(0, 1, 0), direction);
  return createEntity(pc, app, root, {
    name,
    type,
    material,
    position: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    scale: [radius * 2, length, radius * 2],
    rotation,
    castShadows,
  });
}

function archPoints({x, centerZ, span, springY, rise, segments, side}) {
  const output = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    output.push([
      x,
      springY + rise * Math.pow(t, 0.72),
      centerZ + side * (span / 2) * (1 - t),
    ]);
  }
  return output;
}

function addArch(pc, app, root, options) {
  const {
    x, centerZ, span, springY, rise, radius, segments,
    ivory, gold, shadows,
  } = options;
  let entities = 0;
  for (const side of [-1, 1]) {
    const outer = archPoints({x, centerZ, span, springY, rise, segments, side});
    const trimX = x - Math.sign(x || 1) * 0.5;
    const trim = archPoints({x: trimX, centerZ, span: span - 0.45, springY: springY + 0.18, rise: rise - 0.24, segments, side});
    for (let index = 0; index < segments; index += 1) {
      addSegment(pc, app, root, {
        name: `Ivory pointed arch ${x}/${centerZ}/${side}/${index}`,
        start: outer[index],
        end: outer[index + 1],
        radius,
        material: ivory,
        type: "capsule",
        castShadows: shadows,
      });
      addSegment(pc, app, root, {
        name: `Gold arch trim ${x}/${centerZ}/${side}/${index}`,
        start: trim[index],
        end: trim[index + 1],
        radius: 0.105,
        material: gold,
        castShadows: shadows,
      });
      entities += 2;
    }
  }
  return entities;
}

function addColumn(pc, app, root, options) {
  const {x, z, floorY, radius, height, baseHeight, capitalHeight, detail, ivory, marble, gold} = options;
  const shadows = detail.shadows;
  const centerY = floorY + height / 2;
  let entities = 0;
  createEntity(pc, app, root, {
    name: `Marble column ${x}/${z}`,
    type: "cylinder",
    material: ivory,
    position: [x, centerY, z],
    scale: [radius * 2, height, radius * 2],
    castShadows: shadows,
  });
  entities += 1;
  createEntity(pc, app, root, {
    name: `Column base ${x}/${z}`,
    type: "cylinder",
    material: marble,
    position: [x, floorY + baseHeight / 2, z],
    scale: [radius * 2.55, baseHeight, radius * 2.55],
    castShadows: shadows,
  });
  createEntity(pc, app, root, {
    name: `Column capital ${x}/${z}`,
    type: "cone",
    material: marble,
    position: [x, floorY + height - capitalHeight / 2, z],
    scale: [radius * 2.75, capitalHeight, radius * 2.75],
    euler: [180, 0, 0],
    castShadows: shadows,
  });
  createEntity(pc, app, root, {
    name: `Column gold collar ${x}/${z}`,
    type: "torus",
    material: gold,
    position: [x, floorY + height - capitalHeight - 0.12, z],
    scale: [radius * 2.25, 0.20, radius * 2.25],
    castShadows: shadows,
  });
  entities += 3;

  const fluteCount = detail.archSegments;
  for (let index = 0; index < fluteCount; index += 1) {
    const angle = (index / fluteCount) * Math.PI * 2;
    const fluteRadius = radius * 0.78;
    createEntity(pc, app, root, {
      name: `Column flute ${x}/${z}/${index}`,
      type: "cylinder",
      material: marble,
      position: [
        x + Math.cos(angle) * fluteRadius,
        centerY,
        z + Math.sin(angle) * fluteRadius,
      ],
      scale: [0.10, height - 1.1, 0.10],
      castShadows: false,
    });
    entities += 1;
  }
  return entities;
}

function addDome(pc, app, root, options) {
  const {layout, detail, gold, glass} = options;
  const [centerX, baseY, centerZ] = layout.center;
  let entities = 0;
  for (const azimuth of layout.azimuths) {
    const radians = azimuth * Math.PI / 180;
    for (const side of [-1, 1]) {
      let previous = null;
      for (let index = 0; index <= detail.domeSegments; index += 1) {
        const theta = (index / detail.domeSegments) * Math.PI / 2;
        const horizontal = layout.radius * Math.cos(theta) * side;
        const next = [
          centerX + horizontal * Math.cos(radians),
          baseY + layout.height * Math.sin(theta),
          centerZ + horizontal * Math.sin(radians),
        ];
        if (previous) {
          addSegment(pc, app, root, {
            name: `Dome rib ${azimuth}/${side}/${index}`,
            start: previous,
            end: next,
            radius: 0.13,
            material: gold,
            castShadows: detail.shadows,
          });
          entities += 1;
        }
        previous = next;
      }
    }
  }
  for (const factor of layout.rings) {
    const ringY = baseY + layout.height * factor;
    const radius = layout.radius * Math.cos(factor * Math.PI / 2);
    createEntity(pc, app, root, {
      name: `Dome glass ring ${factor}`,
      type: "torus",
      material: glass,
      position: [centerX, ringY, centerZ],
      scale: [radius * 2, 0.22, radius * 2],
      castShadows: false,
    });
    createEntity(pc, app, root, {
      name: `Dome gold ring ${factor}`,
      type: "torus",
      material: gold,
      position: [centerX, ringY + 0.04, centerZ],
      scale: [radius * 2.01, 0.08, radius * 2.01],
      castShadows: detail.shadows,
    });
    entities += 2;
  }
  createEntity(pc, app, root, {
    name: "Dome finial",
    type: "sphere",
    material: gold,
    position: [centerX, baseY + layout.height + 0.28, centerZ],
    scale: [0.72, 0.72, 0.72],
    castShadows: detail.shadows,
  });
  return entities + 1;
}

function addChandelier(pc, app, root, options) {
  const {z, layout, detail, gold, amber, wood} = options;
  const ringY = layout.ringY;
  const radius = layout.radius;
  addSegment(pc, app, root, {
    name: `Chandelier chain ${z}`,
    start: [0, layout.ceilingY, z],
    end: [0, ringY + 0.7, z],
    radius: 0.09,
    material: wood,
    castShadows: detail.shadows,
  });
  createEntity(pc, app, root, {
    name: `Chandelier ring ${z}`,
    type: "torus",
    material: gold,
    position: [0, ringY, z],
    scale: [radius * 2, 0.18, radius * 2],
    castShadows: detail.shadows,
  });
  let entities = 2;
  const bulbs = Math.min(layout.bulbs, detail.chandelierBulbs);
  for (let index = 0; index < bulbs; index += 1) {
    const angle = index / bulbs * Math.PI * 2;
    const position = [Math.cos(angle) * radius, ringY - 0.15, z + Math.sin(angle) * radius];
    addSegment(pc, app, root, {
      name: `Chandelier spoke ${z}/${index}`,
      start: [0, ringY + 0.08, z],
      end: position,
      radius: 0.06,
      material: gold,
      castShadows: false,
    });
    createEntity(pc, app, root, {
      name: `Chandelier bulb ${z}/${index}`,
      type: "sphere",
      material: amber,
      position: [position[0], position[1] - 0.32, position[2]],
      scale: [0.34, 0.46, 0.34],
      castShadows: false,
    });
    entities += 2;
  }
  const light = new pc.Entity(`Chandelier light ${z}`, app);
  light.addComponent("light", {
    type: "omni",
    color: new pc.Color(1, 0.56, 0.22),
    intensity: 2.4,
    range: 13,
    castShadows: detail.shadows,
  });
  light.setLocalPosition(0, ringY - 0.1, z);
  root.addChild(light);
  return {entities: entities + 1, lights: 1};
}

function addMosaic(pc, app, root, options) {
  const {layout, detail, gold, teal, emerald, lapis, sheen} = options;
  const [centerX, y, centerZ] = layout.center;
  createEntity(pc, app, root, {
    name: "Polished ballroom floor sheen",
    type: "box",
    material: sheen,
    position: [0, y - 0.025, 0],
    scale: [33, 0.025, 47],
    castShadows: false,
    receiveShadows: true,
  });
  let entities = 1;
  const ringMaterials = [gold, teal, gold, lapis];
  layout.ringRadii.forEach((radius, index) => {
    createEntity(pc, app, root, {
      name: `Smooth mosaic ring ${index}`,
      type: "torus",
      material: ringMaterials[index % ringMaterials.length],
      position: [centerX, y, centerZ],
      scale: [radius * 2, 0.055, radius * 2],
      castShadows: false,
    });
    entities += 1;
  });
  const feathers = detail.archSegments <= 4 ? 8 : layout.feathers;
  for (let index = 0; index < feathers; index += 1) {
    const angle = index / feathers * Math.PI * 2;
    const degrees = -angle * 180 / Math.PI;
    const position = [
      centerX + Math.sin(angle) * layout.featherRadius,
      y + 0.035,
      centerZ + Math.cos(angle) * layout.featherRadius,
    ];
    createEntity(pc, app, root, {
      name: `Peacock floor feather ${index}`,
      type: "sphere",
      material: index % 2 ? emerald : lapis,
      position,
      scale: [1.35, 0.075, 3.6],
      euler: [0, degrees, 0],
      castShadows: false,
    });
    createEntity(pc, app, root, {
      name: `Peacock floor eye ${index}`,
      type: "sphere",
      material: gold,
      position: [
        centerX + Math.sin(angle) * (layout.featherRadius + 1.0),
        y + 0.075,
        centerZ + Math.cos(angle) * (layout.featherRadius + 1.0),
      ],
      scale: [0.55, 0.09, 0.9],
      euler: [0, degrees, 0],
      castShadows: false,
    });
    entities += 2;
  }
  return entities;
}

function addPlanter(pc, app, root, options) {
  const {position, detail, wood, foliage, gold} = options;
  const [x, floorY, z] = position;
  createEntity(pc, app, root, {
    name: `Planter ${x}/${z}`,
    type: "cylinder",
    material: wood,
    position: [x, floorY + 0.72, z],
    scale: [2.6, 1.42, 2.6],
    castShadows: detail.shadows,
  });
  createEntity(pc, app, root, {
    name: `Planter collar ${x}/${z}`,
    type: "torus",
    material: gold,
    position: [x, floorY + 1.45, z],
    scale: [2.65, 0.16, 2.65],
    castShadows: detail.shadows,
  });
  let entities = 2;
  for (let index = 0; index < detail.foliageLeaves; index += 1) {
    const angle = index / detail.foliageLeaves * Math.PI * 2;
    const radial = 0.45 + (index % 2) * 0.3;
    createEntity(pc, app, root, {
      name: `Planter leaf ${x}/${z}/${index}`,
      type: "sphere",
      material: foliage,
      position: [
        x + Math.cos(angle) * radial,
        floorY + 2.2 + (index % 3) * 0.42,
        z + Math.sin(angle) * radial,
      ],
      scale: [0.48, 2.5 - (index % 2) * 0.45, 0.88],
      euler: [22 + (index % 3) * 9, -angle * 180 / Math.PI, 28 - (index % 2) * 56],
      castShadows: detail.shadows,
    });
    entities += 1;
  }
  return entities;
}

export function createPeacockBallroomArchitecturalProjection({
  pc,
  app,
  profile = "desktop",
  descriptor = createPeacockBallroomArchitectureDescriptor(profile),
} = {}) {
  if (!pc?.Entity || !pc?.StandardMaterial || !pc?.Color || !pc?.Vec3 || !pc?.Quat) {
    throw new TypeError("Peacock Ballroom architecture requires the PlayCanvas entity, material and math APIs");
  }
  if (!app?.root?.addChild) throw new TypeError("Peacock Ballroom architecture requires a PlayCanvas application root");
  if (descriptor?.format !== PEACOCK_BALLROOM_ARCHITECTURE_FORMAT) {
    throw new Error(`Unsupported Peacock Ballroom architecture format: ${descriptor?.format}`);
  }

  const root = new pc.Entity(`Peacock Ballroom architecture ${descriptor.profile}`, app);
  app.root.addChild(root);
  const materials = new Map(descriptor.materials.map((specification) => [
    specification.id,
    createMaterial(pc, specification),
  ]));
  const material = (id) => {
    const output = materials.get(id);
    if (!output) throw new Error(`Unknown Peacock Ballroom architectural material: ${id}`);
    return output;
  };
  const layout = descriptor.layout;
  const detail = descriptor.detail;
  const counters = {
    profile: descriptor.profile,
    status: "ready",
    entities: 0,
    materials: materials.size,
    columns: 0,
    arches: 0,
    stairRamps: 0,
    domeRibs: 0,
    chandeliers: 0,
    mosaicElements: 0,
    planters: 0,
    windows: 0,
    lights: 0,
    suspended: false,
    baseline: false,
  };

  const ivory = material("architecture/ivory");
  const marble = material("architecture/marble");
  const gold = material("architecture/gold");
  const glass = material("architecture/teal-glass");
  const emerald = material("architecture/emerald");
  const lapis = material("architecture/lapis");
  const amber = material("architecture/amber");
  const wood = material("architecture/wood");
  const foliage = material("architecture/foliage");
  const sheen = material("architecture/floor-sheen");

  const {
    radius: columnRadius,
    height: columnHeight,
    baseHeight: columnBaseHeight,
    capitalHeight: columnCapitalHeight,
  } = layout.columns;
  for (const x of layout.columns.x) {
    for (const z of layout.columns.z) {
      counters.entities += addColumn(pc, app, root, {
        x,
        z,
        floorY: layout.floorY,
        radius: columnRadius,
        height: columnHeight,
        baseHeight: columnBaseHeight,
        capitalHeight: columnCapitalHeight,
        detail,
        ivory,
        marble,
        gold,
      });
      counters.columns += 1;
    }
  }

  const {
    span: archSpan,
    springY: archSpringY,
    rise: archRise,
    radius: archRadius,
  } = layout.arches;
  for (const x of layout.arches.sideX) {
    for (const centerZ of layout.arches.centerZ) {
      counters.entities += addArch(pc, app, root, {
        x,
        centerZ,
        span: archSpan,
        springY: archSpringY,
        rise: archRise,
        radius: archRadius,
        segments: detail.archSegments,
        ivory,
        gold,
        shadows: detail.shadows,
      });
      counters.arches += 1;
    }
  }

  for (const x of layout.gallery.sideX) {
    addSegment(pc, app, root, {
      name: `Gallery handrail ${x}`,
      start: [x, layout.gallery.y, layout.gallery.minimumZ],
      end: [x, layout.gallery.y, layout.gallery.maximumZ],
      radius: 0.11,
      material: gold,
      castShadows: detail.shadows,
    });
    counters.entities += 1;
    for (let z = layout.gallery.minimumZ; z <= layout.gallery.maximumZ; z += layout.gallery.postStep) {
      addSegment(pc, app, root, {
        name: `Gallery post ${x}/${z}`,
        start: [x, layout.gallery.y - 1.2, z],
        end: [x, layout.gallery.y, z],
        radius: 0.075,
        material: gold,
        castShadows: detail.shadows,
      });
      counters.entities += 1;
    }
  }

  for (const x of layout.stairs.centerX) {
    createEntity(pc, app, root, {
      name: `Smooth grand stair ramp ${x}`,
      type: "box",
      material: marble,
      position: [x, layout.stairs.centerY, layout.stairs.centerZ],
      scale: [layout.stairs.width, layout.stairs.thickness, layout.stairs.length],
      euler: [layout.stairs.angle, 0, 0],
      castShadows: detail.shadows,
    });
    for (const edge of [-1, 1]) {
      addSegment(pc, app, root, {
        name: `Grand stair balustrade ${x}/${edge}`,
        start: [x + edge * layout.stairs.width / 2, 11.5, 15],
        end: [x + edge * layout.stairs.width / 2, 2.65, 24],
        radius: 0.11,
        material: gold,
        castShadows: detail.shadows,
      });
      counters.entities += 1;
    }
    counters.entities += 1;
    counters.stairRamps += 1;
  }

  const domeEntities = addDome(pc, app, root, {
    layout: layout.dome,
    detail,
    gold,
    glass,
  });
  counters.entities += domeEntities;
  counters.domeRibs = layout.dome.azimuths.length * 2;

  for (const z of layout.chandeliers.z) {
    const chandelier = addChandelier(pc, app, root, {
      z,
      layout: layout.chandeliers,
      detail,
      gold,
      amber,
      wood,
    });
    counters.entities += chandelier.entities;
    counters.lights += chandelier.lights;
    counters.chandeliers += 1;
  }

  const mosaicElements = addMosaic(pc, app, root, {
    layout: layout.mosaic,
    detail,
    gold,
    teal: glass,
    emerald,
    lapis,
    sheen,
  });
  counters.entities += mosaicElements;
  counters.mosaicElements = mosaicElements;

  const planterPositions = descriptor.profile === "mobile"
    ? layout.planters.positions.slice(0, 2)
    : layout.planters.positions;
  for (const position of planterPositions) {
    counters.entities += addPlanter(pc, app, root, {
      position,
      detail,
      wood,
      foliage,
      gold,
    });
    counters.planters += 1;
  }

  for (const x of layout.windows.sideX) {
    for (const z of layout.windows.centerZ) {
      createEntity(pc, app, root, {
        name: `Smooth teal window ${x}/${z}`,
        type: "box",
        material: glass,
        position: [x, layout.windows.centerY, z],
        scale: [0.12, layout.windows.height, layout.windows.width],
        castShadows: false,
        receiveShadows: false,
      });
      addSegment(pc, app, root, {
        name: `Window mullion ${x}/${z}`,
        start: [x - Math.sign(x) * 0.07, layout.windows.centerY - layout.windows.height / 2, z],
        end: [x - Math.sign(x) * 0.07, layout.windows.centerY + layout.windows.height / 2, z],
        radius: 0.075,
        material: gold,
        castShadows: false,
      });
      counters.entities += 2;
      counters.windows += 1;
    }
  }

  if ("renderNextFrame" in app) app.renderNextFrame = true;
  let destroyed = false;

  return Object.freeze({
    root,
    descriptor,
    evidence() {
      return freezeEvidence(counters);
    },
    suspend() {
      if (destroyed || counters.suspended) return false;
      counters.suspended = true;
      root.enabled = false;
      return true;
    },
    resume() {
      if (destroyed || !counters.suspended) return false;
      counters.suspended = false;
      root.enabled = true;
      if ("renderNextFrame" in app) app.renderNextFrame = true;
      return true;
    },
    destroy() {
      if (destroyed) return freezeEvidence(counters);
      destroyed = true;
      root.destroy();
      for (const value of materials.values()) value.destroy?.();
      materials.clear();
      counters.status = "disposed";
      counters.entities = 0;
      counters.materials = 0;
      counters.lights = 0;
      counters.suspended = false;
      counters.baseline = true;
      return freezeEvidence(counters);
    },
  });
}
