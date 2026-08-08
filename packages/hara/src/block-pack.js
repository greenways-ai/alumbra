import {
  BLOCK_ID_PATTERN,
  assertCanonicalByteLimit,
  canonicalValue,
  createBlockRegistry,
  deepFreeze,
  validationError,
} from "@greenways/alumbra-core";
import {
  LIMITS,
  SIMPLE_ID_PATTERN,
  boundedArray,
  canonicalObject,
  finiteNumber,
  normalizeColor,
  normalizeEntryReference,
  normalizeNamespacedId,
  objectValue,
  requiredString,
  safeInteger,
} from "./common.js";

export const BLOCK_PACK_FORMAT = "alumbra.block-pack/1";
const STATE_KEY_PATTERN = /^[a-z][a-z0-9._-]*$/;
const CORE_BLOCK_METADATA_BYTES = 8 * 1024;

function normalizeStateDescriptor(key, value, label) {
  if (!STATE_KEY_PATTERN.test(key)) {
    validationError(`${label} has invalid state key ${key}`, "hara/block-state-key", {key});
  }
  const input = objectValue(value, `${label} state ${key}`);
  const type = requiredString(input.type, `${label} state ${key} type`, {
    maximum:32,
    pattern:SIMPLE_ID_PATTERN,
  });

  if (type === "boolean") {
    const defaultValue = input.default ?? false;
    if (typeof defaultValue !== "boolean") {
      validationError(`${label} state ${key} default must be boolean`, "hara/block-state-default", {key});
    }
    return deepFreeze({type, default:defaultValue});
  }

  if (type === "integer") {
    const minimum = safeInteger(input.min ?? Number.MIN_SAFE_INTEGER, `${label} state ${key} min`);
    const maximum = safeInteger(input.max ?? Number.MAX_SAFE_INTEGER, `${label} state ${key} max`);
    if (minimum > maximum) {
      validationError(`${label} state ${key} min exceeds max`, "hara/block-state-range", {key});
    }
    const defaultValue = safeInteger(input.default ?? minimum, `${label} state ${key} default`, {
      minimum,
      maximum,
    });
    return deepFreeze({type, min:minimum, max:maximum, default:defaultValue});
  }

  if (type === "enum") {
    const source = boundedArray(input.values, `${label} state ${key} values`, LIMITS.enumValues);
    if (!source.length) validationError(`${label} state ${key} requires enum values`, "hara/block-state-enum");
    const values = [...new Set(source.map((entry, index) => requiredString(
      entry,
      `${label} state ${key} value ${index}`,
      {maximum:128},
    )))];
    const defaultValue = requiredString(input.default ?? values[0], `${label} state ${key} default`, {
      maximum:128,
    });
    if (!values.includes(defaultValue)) {
      validationError(`${label} state ${key} default is not an enum value`, "hara/block-state-default", {
        key,
        default:defaultValue,
      });
    }
    return deepFreeze({type, values:Object.freeze(values), default:defaultValue});
  }

  validationError(`${label} state ${key} has unsupported type ${type}`, "hara/block-state-type", {key, type});
}

function normalizeStates(value, label) {
  const input = objectValue(value ?? {}, `${label} states`);
  const keys = Object.keys(input).sort();
  if (keys.length > LIMITS.statesPerBlock) {
    validationError(`${label} exceeds ${LIMITS.statesPerBlock} states`, "hara/block-state-count", {
      count:keys.length,
    });
  }
  const states = {};
  for (const key of keys) states[key] = normalizeStateDescriptor(key, input[key], label);
  return deepFreeze(states);
}

function normalizeMaterial(value, label, empty) {
  const input = objectValue(value ?? {}, `${label} material`);
  const texture = input.texture == null
    ? null
    : requiredString(input.texture, `${label} material texture`, {maximum:512});
  return deepFreeze({
    visible: input.visible == null ? !empty : Boolean(input.visible),
    opaque: input.opaque == null ? !empty : Boolean(input.opaque),
    color: normalizeColor(input.color, `${label} material color`, empty ? [0, 0, 0] : [1, 1, 1]),
    opacity: finiteNumber(input.opacity ?? (empty ? 0 : 1), `${label} material opacity`, {
      minimum:0,
      maximum:1,
    }),
    gloss: finiteNumber(input.gloss ?? 0, `${label} material gloss`, {minimum:0, maximum:1}),
    emissive: normalizeColor(input.emissive, `${label} material emissive`, [0, 0, 0]),
    texture,
  });
}

function normalizePhysics(value, label, empty) {
  const input = objectValue(value ?? {}, `${label} physics`);
  const hardness = finiteNumber(input.hardness ?? (empty ? 0 : 1), `${label} physics hardness`, {
    minimum:0,
    maximum:1_000_000,
  });
  return deepFreeze({
    solid: input.solid == null ? !empty : Boolean(input.solid),
    breakable: input.breakable == null ? !empty : Boolean(input.breakable),
    replaceable: input.replaceable == null ? empty : Boolean(input.replaceable),
    hardness,
  });
}

function normalizeDrop(value, label, index) {
  const input = objectValue(value, `${label} drop ${index}`);
  const minimum = safeInteger(input.min ?? input.count ?? 1, `${label} drop ${index} min`, {
    minimum:0,
    maximum:65535,
  });
  const maximum = safeInteger(input.max ?? input.count ?? minimum, `${label} drop ${index} max`, {
    minimum,
    maximum:65535,
  });
  return deepFreeze({
    item: normalizeNamespacedId(input.item, `${label} drop ${index} item`),
    min:minimum,
    max:maximum,
    chance: finiteNumber(input.chance ?? 1, `${label} drop ${index} chance`, {
      minimum:0,
      maximum:1,
    }),
  });
}

function normalizeDrops(value, label) {
  const source = boundedArray(value ?? [], `${label} drops`, LIMITS.dropsPerBlock);
  return Object.freeze(source.map((entry, index) => normalizeDrop(entry, label, index)));
}

export function normalizeBlockDeclaration(value, index = 0) {
  const input = objectValue(value, `Block declaration ${index}`);
  const id = requiredString(input.id, `Block declaration ${index} id`, {
    maximum:256,
    pattern:BLOCK_ID_PATTERN,
  });
  const label = `Block ${id}`;
  const empty = Boolean(input.empty);
  const states = normalizeStates(input.states, label);
  const material = normalizeMaterial(input.material ?? input.render, label, empty);
  const physics = normalizePhysics(input.physics, label, empty);
  const drops = normalizeDrops(input.drops, label);
  const emittedLight = safeInteger(input.emittedLight ?? input["emitted-light"] ?? 0, `${label} emitted light`, {
    minimum:0,
    maximum:15,
  });
  const onUse = input.onUse == null && input["on-use"] == null
    ? null
    : normalizeEntryReference(input.onUse ?? input["on-use"], `${label} on-use`);
  const metadata = canonicalObject(input.metadata, `${label} metadata`, LIMITS.blockMetadataBytes);
  const displayName = input.label == null
    ? id.split("/").at(-1).replaceAll("-", " ")
    : requiredString(input.label, `${label} label`, {maximum:256});

  if (empty && (physics.solid || material.visible || emittedLight !== 0)) {
    validationError(`${label} empty blocks must be invisible, non-solid and non-emissive`, "hara/block-empty", {id});
  }
  if (!material.visible && material.opaque) {
    validationError(`${label} invisible material cannot be opaque`, "hara/block-material", {id});
  }

  const normalized = deepFreeze({
    id,
    label:displayName,
    empty,
    states,
    material,
    physics,
    drops,
    emittedLight,
    onUse,
    metadata,
  });
  assertCanonicalByteLimit(normalized, LIMITS.blockMetadataBytes * 2, label);
  return normalized;
}

export function normalizeBlockPack(value) {
  const input = objectValue(value, "Block pack");
  if (input.format != null && input.format !== BLOCK_PACK_FORMAT) {
    validationError(`Unsupported block pack format: ${input.format}`, "hara/block-pack-format", {
      format:input.format,
    });
  }
  const packageId = requiredString(input.package, "Block pack package", {
    maximum:256,
    pattern:/^(hara|npm):[a-z0-9@._/-]+$/,
  });
  const version = requiredString(input.version, "Block pack version", {maximum:128});
  const id = normalizeNamespacedId(input.id, "Block pack id");
  const source = boundedArray(input.blocks, "Block pack blocks", LIMITS.blocksPerPack);
  if (!source.length) validationError("Block pack requires at least one block", "hara/block-pack-empty");
  const blocks = source.map(normalizeBlockDeclaration);
  const seen = new Set();
  for (const block of blocks) {
    if (seen.has(block.id)) {
      validationError(`Block pack ${id} contains duplicate block ${block.id}`, "hara/block-pack-duplicate", {
        id:block.id,
      });
    }
    seen.add(block.id);
  }
  const metadata = canonicalObject(input.metadata, `Block pack ${id} metadata`, LIMITS.blockPackMetadataBytes);
  const normalized = deepFreeze({
    format:BLOCK_PACK_FORMAT,
    package:packageId,
    version,
    id,
    blocks:Object.freeze(blocks),
    metadata,
  });
  assertCanonicalByteLimit(normalized, LIMITS.blockPackBytes, `Block pack ${id}`);
  return normalized;
}

export function blockDeclarationToCore(value) {
  const block = normalizeBlockDeclaration(value);
  const metadata = deepFreeze({
    ...canonicalValue(block.metadata, {label:`Block ${block.id} metadata`}),
    label:block.label,
    material:block.material,
    render:block.material,
    physics:block.physics,
    drops:block.drops,
    emittedLight:block.emittedLight,
    onUse:block.onUse,
  });
  assertCanonicalByteLimit(metadata, CORE_BLOCK_METADATA_BYTES, `Core block ${block.id} metadata`);
  return deepFreeze({
    id:block.id,
    empty:block.empty,
    states:block.states,
    metadata,
  });
}

export function materializeBlockRegistry(packs, {
  id = "alumbra/combined-blocks",
  version = "0.1.0",
} = {}) {
  const source = boundedArray(packs, "Block packs", LIMITS.packageRefs);
  if (!source.length) validationError("At least one block pack is required", "hara/block-packs-empty");
  const normalizedPacks = source.map(normalizeBlockPack);
  const packKeys = new Set();
  const blockSources = [];
  const definitions = [];
  const blockIds = new Set();
  for (const pack of normalizedPacks) {
    const packKey = `${pack.package}@${pack.version}:${pack.id}`;
    if (packKeys.has(packKey)) {
      validationError(`Duplicate block pack ${packKey}`, "hara/block-pack-reference-duplicate", {packKey});
    }
    packKeys.add(packKey);
    for (const block of pack.blocks) {
      if (blockIds.has(block.id)) {
        validationError(`Duplicate block ${block.id} across packs`, "hara/block-duplicate", {id:block.id});
      }
      blockIds.add(block.id);
      definitions.push(blockDeclarationToCore(block));
      blockSources.push(deepFreeze({block:block.id, pack:pack.id, package:pack.package, version:pack.version}));
    }
  }
  const registry = createBlockRegistry(definitions, {
    id: normalizeNamespacedId(id, "Combined registry id"),
    version: requiredString(version, "Combined registry version", {maximum:128}),
  });
  blockSources.sort((left, right) => left.block.localeCompare(right.block));
  return Object.freeze({
    registry,
    packs:Object.freeze(normalizedPacks),
    sources:Object.freeze(blockSources),
  });
}

export function blockPackReference(value) {
  const pack = normalizeBlockPack(value);
  return deepFreeze({package:pack.package, version:pack.version, id:pack.id});
}
