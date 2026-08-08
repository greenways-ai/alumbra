import {
  blockValuesEqual,
  canonicalStringify,
  createChunk,
  deepFreeze,
  localToIndex,
  normalizeBlockValue,
  normalizeChunkShape,
  normalizeGeneratorIdentity,
  normalizeVector3,
  patchChunk,
  positiveMod,
  validationError,
} from "@greenways/alumbra-core";
import {
  LIMITS,
  boundedArray,
  canonicalObject,
  normalizeEntryReference,
  objectValue,
  safeInteger,
  sameCanonical,
} from "./common.js";

export const GENERATOR_FORMAT = "alumbra.generator/1";
export const GENERATED_CHUNK_FORMAT = "alumbra.generated-chunk/1";

function normalizeRevision(value) {
  return safeInteger(value ?? 0, "Generated chunk revision", {minimum:0, maximum:0xffffffff});
}

export function normalizeGeneratorDescriptor(value) {
  const input = objectValue(value, "Generator descriptor");
  if (input.format != null && input.format !== GENERATOR_FORMAT) {
    validationError(`Unsupported generator format: ${input.format}`, "hara/generator-format", {
      format:input.format,
    });
  }
  const identity = normalizeGeneratorIdentity(input);
  const entry = normalizeEntryReference(input.entry, `Generator ${identity.id} entry`);
  const parameters = canonicalObject(
    input.parameters,
    `Generator ${identity.id} parameters`,
    LIMITS.generatorParametersBytes,
  );
  return deepFreeze({
    format:GENERATOR_FORMAT,
    ...identity,
    entry,
    parameters,
  });
}

function normalizeBoundaryVector(value, shape, label, {allowUpper = false} = {}) {
  const vector = normalizeVector3(value, label);
  vector.forEach((entry, axis) => {
    const upper = allowUpper ? shape[axis] : shape[axis] - 1;
    if (entry < 0 || entry > upper) {
      validationError(`${label} is outside the chunk`, "hara/generated-boundary", {
        vector,
        shape,
        axis,
        allowUpper,
      });
    }
  });
  return vector;
}

function normalizeRegion(value, index, shape, registry) {
  const input = objectValue(value, `Generated region ${index}`);
  const from = normalizeBoundaryVector(input.from, shape, `Generated region ${index} from`);
  const to = normalizeBoundaryVector(input.to, shape, `Generated region ${index} to`, {allowUpper:true});
  for (let axis = 0; axis < 3; axis += 1) {
    if (to[axis] <= from[axis]) {
      validationError(`Generated region ${index} must use a non-empty half-open box`, "hara/generated-region-empty", {
        from,
        to,
        axis,
      });
    }
  }
  return deepFreeze({from, to, block:normalizeBlockValue(registry, input.block)});
}

function normalizeOverride(value, index, shape, registry) {
  const input = objectValue(value, `Generated override ${index}`);
  return deepFreeze({
    local: normalizeBoundaryVector(input.local, shape, `Generated override ${index} local`),
    block: normalizeBlockValue(registry, input.block),
  });
}

function planWriteMap(regions, overrides, shape, {detectOnly = false} = {}) {
  const writes = new Map();
  for (const [regionIndex, region] of regions.entries()) {
    for (let z = region.from[2]; z < region.to[2]; z += 1) {
      for (let y = region.from[1]; y < region.to[1]; y += 1) {
        for (let x = region.from[0]; x < region.to[0]; x += 1) {
          const local = [x, y, z];
          const index = localToIndex(local, shape);
          if (writes.has(index)) {
            validationError("Generated regions overlap ambiguously", "hara/generated-region-overlap", {
              local,
              first:writes.get(index).source,
              second:regionIndex,
            });
          }
          if (writes.size >= LIMITS.generatedWrites) {
            validationError(`Generated plan exceeds ${LIMITS.generatedWrites} voxel writes`, "hara/generated-write-limit", {
              maximum:LIMITS.generatedWrites,
            });
          }
          writes.set(index, {block:region.block, source:regionIndex});
        }
      }
    }
  }

  const overrideTargets = new Set();
  for (const [overrideIndex, override] of overrides.entries()) {
    const index = localToIndex(override.local, shape);
    if (overrideTargets.has(index)) {
      validationError("Generated overrides contain duplicate targets", "hara/generated-override-duplicate", {
        local:override.local,
        override:overrideIndex,
      });
    }
    overrideTargets.add(index);
    if (!writes.has(index) && writes.size >= LIMITS.generatedWrites) {
      validationError(`Generated plan exceeds ${LIMITS.generatedWrites} voxel writes`, "hara/generated-write-limit", {
        maximum:LIMITS.generatedWrites,
      });
    }
    writes.set(index, {block:override.block, source:`override:${overrideIndex}`});
  }

  if (detectOnly) return writes.size;
  return writes;
}

export function normalizeGeneratedChunkPlan(value, registry, {
  expectedGenerator = null,
  expectedCoord = null,
  expectedShape = null,
} = {}) {
  if (!registry) validationError("Generated plan validation requires a block registry", "hara/generated-registry");
  const input = objectValue(value, "Generated chunk plan");
  if (input.format != null && input.format !== GENERATED_CHUNK_FORMAT) {
    validationError(`Unsupported generated chunk format: ${input.format}`, "hara/generated-format", {
      format:input.format,
    });
  }
  const generator = normalizeGeneratorDescriptor(input.generator);
  const coord = normalizeVector3(input.coord, "Generated chunk coordinate");
  const shape = normalizeChunkShape(input.shape);
  const revision = normalizeRevision(input.revision);
  const base = normalizeBlockValue(registry, input.base ?? registry.emptyBlock);
  const regionSource = boundedArray(input.regions ?? [], "Generated regions", LIMITS.generatedRegions);
  const overrideSource = boundedArray(input.overrides ?? [], "Generated overrides", LIMITS.generatedOverrides);
  const regions = Object.freeze(regionSource.map((entry, index) => normalizeRegion(entry, index, shape, registry)));
  const overrides = Object.freeze(overrideSource.map((entry, index) => normalizeOverride(entry, index, shape, registry)));
  planWriteMap(regions, overrides, shape, {detectOnly:true});
  const metadata = canonicalObject(input.metadata, "Generated chunk metadata", LIMITS.generatorParametersBytes);

  if (expectedGenerator && !sameCanonical(generator, normalizeGeneratorDescriptor(expectedGenerator))) {
    validationError("Generated plan does not match the expected generator", "hara/generated-generator-mismatch", {
      expected:normalizeGeneratorDescriptor(expectedGenerator),
      actual:generator,
    });
  }
  if (expectedCoord && !sameCanonical(coord, normalizeVector3(expectedCoord, "Expected chunk coordinate"))) {
    validationError("Generated plan does not match the expected coordinate", "hara/generated-coordinate-mismatch", {
      expected:expectedCoord,
      actual:coord,
    });
  }
  if (expectedShape && !sameCanonical(shape, normalizeChunkShape(expectedShape))) {
    validationError("Generated plan does not match the expected shape", "hara/generated-shape-mismatch", {
      expected:expectedShape,
      actual:shape,
    });
  }

  const normalized = deepFreeze({
    format:GENERATED_CHUNK_FORMAT,
    generator,
    coord,
    shape,
    revision,
    base,
    regions,
    overrides,
    metadata,
  });
  const serializedLength = new TextEncoder().encode(canonicalStringify(normalized)).byteLength;
  if (serializedLength > LIMITS.generatedPlanBytes) {
    validationError(`Generated chunk plan exceeds ${LIMITS.generatedPlanBytes} bytes`, "hara/generated-size", {
      length:serializedLength,
      maximum:LIMITS.generatedPlanBytes,
    });
  }
  return normalized;
}

export function materializeGeneratedChunk(value, registry, options = {}) {
  const plan = normalizeGeneratedChunkPlan(value, registry, options);
  const chunk = createChunk({
    registry,
    coord:plan.coord,
    shape:plan.shape,
    revision:plan.revision,
    fill:plan.base,
  });
  const writes = planWriteMap(plan.regions, plan.overrides, plan.shape);
  const updates = [];
  for (const [index, write] of [...writes.entries()].sort((left, right) => left[0] - right[0])) {
    if (!blockValuesEqual(write.block, plan.base)) {
      updates.push({index, value:write.block});
    }
  }
  if (!updates.length) return chunk;
  return patchChunk(chunk, updates, registry, {revision:plan.revision});
}

export function createGeneratedChunkPlan(value, registry) {
  return normalizeGeneratedChunkPlan(value, registry);
}

export function createFlatFixturePlan({
  generator,
  coord,
  shape = [16, 16, 16],
  revision = 0,
  base,
  block,
  surface = 3,
  metadata = {},
}, registry) {
  const normalizedGenerator = normalizeGeneratorDescriptor(generator);
  const normalizedCoord = normalizeVector3(coord, "Flat fixture coordinate");
  const normalizedShape = normalizeChunkShape(shape);
  safeInteger(surface, "Flat fixture surface");
  const worldStartY = normalizedCoord[1] * normalizedShape[1];
  if (!Number.isSafeInteger(worldStartY)) {
    validationError("Flat fixture world Y exceeds safe integer range", "hara/fixture-coordinate", {
      coord:normalizedCoord,
      shape:normalizedShape,
    });
  }
  const end = Math.max(0, Math.min(normalizedShape[1], surface - worldStartY + 1));
  const regions = end > 0
    ? [{from:[0, 0, 0], to:[normalizedShape[0], end, normalizedShape[2]], block}]
    : [];
  return normalizeGeneratedChunkPlan({
    format:GENERATED_CHUNK_FORMAT,
    generator:normalizedGenerator,
    coord:normalizedCoord,
    shape:normalizedShape,
    revision,
    base,
    regions,
    overrides:[],
    metadata:{...metadata, fixture:"flat", surface},
  }, registry);
}

export function integerFixtureHeight(worldX, worldZ, {
  seed = 0,
  minimum = 2,
  span = 5,
} = {}) {
  safeInteger(worldX, "Height-field world X");
  safeInteger(worldZ, "Height-field world Z");
  safeInteger(seed, "Height-field seed");
  safeInteger(minimum, "Height-field minimum");
  safeInteger(span, "Height-field span", {minimum:1, maximum:65535});
  const value = worldX * 3 + worldZ * 5 + seed;
  if (!Number.isSafeInteger(value)) {
    validationError("Height-field arithmetic exceeds safe integer range", "hara/fixture-coordinate", {
      worldX,
      worldZ,
      seed,
    });
  }
  return minimum + positiveMod(value, span);
}

export function createHeightFieldFixturePlan({
  generator,
  coord,
  shape = [16, 16, 16],
  revision = 0,
  base,
  fill,
  surfaceBlock = fill,
  seed = 0,
  minimum = 2,
  span = 5,
  metadata = {},
}, registry) {
  const normalizedGenerator = normalizeGeneratorDescriptor(generator);
  const normalizedCoord = normalizeVector3(coord, "Height-field fixture coordinate");
  const normalizedShape = normalizeChunkShape(shape);
  const regions = [];
  const overrides = [];
  const worldStartY = normalizedCoord[1] * normalizedShape[1];
  if (!Number.isSafeInteger(worldStartY)) {
    validationError("Height-field world Y exceeds safe integer range", "hara/fixture-coordinate");
  }

  for (let z = 0; z < normalizedShape[2]; z += 1) {
    for (let x = 0; x < normalizedShape[0]; x += 1) {
      const worldX = normalizedCoord[0] * normalizedShape[0] + x;
      const worldZ = normalizedCoord[2] * normalizedShape[2] + z;
      if (!Number.isSafeInteger(worldX) || !Number.isSafeInteger(worldZ)) {
        validationError("Height-field world coordinate exceeds safe integer range", "hara/fixture-coordinate", {
          coord:normalizedCoord,
          local:[x, z],
        });
      }
      const height = integerFixtureHeight(worldX, worldZ, {seed, minimum, span});
      const end = Math.max(0, Math.min(normalizedShape[1], height - worldStartY + 1));
      if (end > 0) {
        regions.push({from:[x, 0, z], to:[x + 1, end, z + 1], block:fill});
      }
      const localSurface = height - worldStartY;
      if (localSurface >= 0 && localSurface < normalizedShape[1]) {
        overrides.push({local:[x, localSurface, z], block:surfaceBlock});
      }
    }
  }

  return normalizeGeneratedChunkPlan({
    format:GENERATED_CHUNK_FORMAT,
    generator:normalizedGenerator,
    coord:normalizedCoord,
    shape:normalizedShape,
    revision,
    base,
    regions,
    overrides,
    metadata:{...metadata, fixture:"integer-height-field", seed, minimum, span},
  }, registry);
}
