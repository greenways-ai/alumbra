import {
  assertCanonicalByteLimit,
  canonicalEqual,
  canonicalStringify,
  canonicalValue,
  deepFreeze,
} from "./canonical.js";
import { validationError } from "./errors.js";

export const BLOCK_ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const STATE_KEY_PATTERN = /^[a-z][a-z0-9._-]*$/;
const MAX_BLOCK_METADATA_BYTES = 8 * 1024;

const normalizeInteger = (value, label) => {
  if (!Number.isSafeInteger(value)) validationError(`${label} must be a safe integer`, "block/state-integer");
  return value;
};

function normalizeStateDescriptor(key, descriptor) {
  if (!STATE_KEY_PATTERN.test(key)) {
    validationError(`Invalid block state key: ${key}`, "block/state-key", { key });
  }
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    validationError(`State descriptor ${key} must be an object`, "block/state-schema", { key });
  }

  const type = String(descriptor.type || "");
  if (type === "boolean") {
    const defaultValue = descriptor.default ?? false;
    if (typeof defaultValue !== "boolean") {
      validationError(`Boolean state ${key} has an invalid default`, "block/state-default", { key });
    }
    return deepFreeze({ type, default: defaultValue });
  }

  if (type === "integer") {
    const minimum = normalizeInteger(descriptor.min ?? Number.MIN_SAFE_INTEGER, `${key}.min`);
    const maximum = normalizeInteger(descriptor.max ?? Number.MAX_SAFE_INTEGER, `${key}.max`);
    if (minimum > maximum) {
      validationError(`Integer state ${key} has min greater than max`, "block/state-range", { key });
    }
    const defaultValue = normalizeInteger(descriptor.default ?? minimum, `${key}.default`);
    if (defaultValue < minimum || defaultValue > maximum) {
      validationError(`Integer state ${key} default is outside its range`, "block/state-default", { key });
    }
    return deepFreeze({ type, min: minimum, max: maximum, default: defaultValue });
  }

  if (type === "enum") {
    if (!Array.isArray(descriptor.values) || descriptor.values.length === 0) {
      validationError(`Enum state ${key} requires values`, "block/state-enum", { key });
    }
    const values = [...new Set(descriptor.values.map((value) => String(value)))];
    if (values.some((value) => value.length === 0)) {
      validationError(`Enum state ${key} contains an empty value`, "block/state-enum", { key });
    }
    const defaultValue = String(descriptor.default ?? values[0]);
    if (!values.includes(defaultValue)) {
      validationError(`Enum state ${key} default is not in values`, "block/state-default", { key });
    }
    return deepFreeze({ type, values: Object.freeze(values), default: defaultValue });
  }

  validationError(`Unsupported block state type for ${key}: ${type}`, "block/state-type", { key, type });
}

function normalizeDefinition(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError(`Block definition ${index} must be an object`, "block/definition");
  }

  const id = String(value.id || "");
  if (!BLOCK_ID_PATTERN.test(id)) {
    validationError(`Invalid namespaced block id: ${id}`, "block/id", { id });
  }

  const states = {};
  const sourceStates = value.states ?? {};
  if (!sourceStates || typeof sourceStates !== "object" || Array.isArray(sourceStates)) {
    validationError(`Block ${id} states must be an object`, "block/state-schema", { id });
  }
  for (const key of Object.keys(sourceStates).sort()) {
    states[key] = normalizeStateDescriptor(key, sourceStates[key]);
  }

  const metadata = canonicalValue(value.metadata ?? {}, { label: `Block ${id} metadata` });
  assertCanonicalByteLimit(metadata, MAX_BLOCK_METADATA_BYTES, `Block ${id} metadata`);

  return deepFreeze({
    id,
    empty: Boolean(value.empty),
    states: deepFreeze(states),
    metadata: deepFreeze(metadata),
  });
}

function validateStateValue(block, key, descriptor, value) {
  if (descriptor.type === "boolean") {
    if (typeof value !== "boolean") {
      validationError(`Block ${block.id} state ${key} must be boolean`, "block/state-value", {
        id: block.id,
        key,
      });
    }
    return value;
  }

  if (descriptor.type === "integer") {
    if (!Number.isSafeInteger(value) || value < descriptor.min || value > descriptor.max) {
      validationError(`Block ${block.id} state ${key} is outside its integer range`, "block/state-value", {
        id: block.id,
        key,
        value,
      });
    }
    return value;
  }

  const normalized = String(value);
  if (!descriptor.values.includes(normalized)) {
    validationError(`Block ${block.id} state ${key} is not an allowed enum value`, "block/state-value", {
      id: block.id,
      key,
      value: normalized,
    });
  }
  return normalized;
}

export function createBlockRegistry(definitions, {
  id = "alumbra/registry",
  version = "0.1.0",
} = {}) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    validationError("Block registry requires at least one definition", "block/registry-empty");
  }
  if (!BLOCK_ID_PATTERN.test(String(id))) {
    validationError(`Invalid block registry id: ${id}`, "block/registry-id", { id });
  }
  if (!String(version).trim()) {
    validationError("Block registry version is required", "block/registry-version");
  }

  const normalized = definitions.map(normalizeDefinition);
  const byId = new Map();
  let emptyDefinition = null;
  for (const block of normalized) {
    if (byId.has(block.id)) {
      validationError(`Duplicate block id: ${block.id}`, "block/duplicate", { id: block.id });
    }
    byId.set(block.id, block);
    if (block.empty) {
      if (emptyDefinition) {
        validationError("Block registry may define only one empty block", "block/multiple-empty", {
          first: emptyDefinition.id,
          second: block.id,
        });
      }
      emptyDefinition = block;
    }
  }
  if (!emptyDefinition) {
    validationError("Block registry requires exactly one empty block", "block/missing-empty");
  }

  const registry = {
    id: String(id),
    version: String(version),
    definitions: Object.freeze(normalized),
    emptyBlock: emptyDefinition.id,
    has(blockId) {
      return byId.has(String(blockId));
    },
    get(blockId) {
      const block = byId.get(String(blockId));
      if (!block) validationError(`Unknown block id: ${blockId}`, "block/unknown", { id: String(blockId) });
      return block;
    },
  };
  return Object.freeze(registry);
}

export function normalizeBlockValue(registry, value) {
  if (!registry || typeof registry.get !== "function") {
    validationError("A block registry is required", "block/registry-required");
  }

  const input = typeof value === "string" ? { id: value, state: {} } : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    validationError("Block value must be a block id or object", "block/value");
  }

  const id = String(input.id || "");
  const definition = registry.get(id);
  const sourceState = input.state ?? {};
  if (!sourceState || typeof sourceState !== "object" || Array.isArray(sourceState)) {
    validationError(`Block ${id} state must be an object`, "block/state", { id });
  }

  for (const key of Object.keys(sourceState)) {
    if (!Object.hasOwn(definition.states, key)) {
      validationError(`Block ${id} has unknown state ${key}`, "block/state-unknown", { id, key });
    }
  }

  const state = {};
  for (const key of Object.keys(definition.states).sort()) {
    const descriptor = definition.states[key];
    state[key] = validateStateValue(
      definition,
      key,
      descriptor,
      Object.hasOwn(sourceState, key) ? sourceState[key] : descriptor.default,
    );
  }

  return deepFreeze({ id, state: deepFreeze(state) });
}

export function blockValueKey(value) {
  return canonicalStringify(value, { label: "Block value" });
}

export function blockValuesEqual(left, right) {
  return canonicalEqual(left, right);
}
