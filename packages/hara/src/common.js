import {
  assertCanonicalByteLimit,
  canonicalStringify,
  canonicalValue,
  deepFreeze,
  validationError,
} from "@greenways/alumbra-core";

export const PACKAGE_PATTERN = /^(hara|npm):[a-z0-9@._/-]+$/;
export const NAMESPACED_ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/;
export const SIMPLE_ID_PATTERN = /^[a-z][a-z0-9._-]*$/;
export const MODULE_PATTERN = /^[a-z][a-z0-9._-]*(?:\.[a-z][a-z0-9._-]*)*$/;
export const FUNCTION_PATTERN = /^[a-z][a-z0-9._!?*-]*$/;

export const LIMITS = Object.freeze({
  blockPackBytes: 512 * 1024,
  blockPackMetadataBytes: 16 * 1024,
  blockMetadataBytes: 16 * 1024,
  blocksPerPack: 4096,
  statesPerBlock: 32,
  enumValues: 256,
  dropsPerBlock: 32,
  generatorParametersBytes: 32 * 1024,
  generatedPlanBytes: 2 * 1024 * 1024,
  generatedRegions: 4096,
  generatedOverrides: 65536,
  generatedWrites: 1024 * 1024,
  worldExtensionBytes: 256 * 1024,
  packageRefs: 256,
  interactionBytes: 512 * 1024,
  transactionsPerInteraction: 32,
  effectsPerInteraction: 64,
  feedbackPerInteraction: 64,
  itemText: 2048,
});

export function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError(`${label} must be an object`, "hara/object", {label});
  }
  return value;
}

export function requiredString(value, label, {maximum = 256, pattern = null} = {}) {
  const text = String(value ?? "").trim();
  if (!text) validationError(`${label} is required`, "hara/string-required", {label});
  if (text.length > maximum) {
    validationError(`${label} exceeds ${maximum} characters`, "hara/string-length", {label, maximum});
  }
  if (pattern && !pattern.test(text)) {
    validationError(`${label} has an invalid format`, "hara/string-format", {label, value:text});
  }
  return text;
}

export function optionalString(value, label, options = {}) {
  if (value == null) return null;
  return requiredString(value, label, options);
}

export function safeInteger(value, label, {minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER} = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    validationError(`${label} must be an integer between ${minimum} and ${maximum}`, "hara/integer", {
      label,
      value,
      minimum,
      maximum,
    });
  }
  return value;
}

export function finiteNumber(value, label, {minimum = -Infinity, maximum = Infinity} = {}) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    validationError(`${label} must be finite between ${minimum} and ${maximum}`, "hara/number", {
      label,
      value,
      minimum,
      maximum,
    });
  }
  return Object.is(value, -0) ? 0 : value;
}

export function boundedArray(value, label, maximum) {
  if (!Array.isArray(value)) validationError(`${label} must be an array`, "hara/array", {label});
  if (value.length > maximum) {
    validationError(`${label} exceeds ${maximum} entries`, "hara/array-length", {
      label,
      length:value.length,
      maximum,
    });
  }
  return value;
}

export function canonicalObject(value, label, maximum) {
  const normalized = canonicalValue(value ?? {}, {label});
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    validationError(`${label} must be an object`, "hara/canonical-object", {label});
  }
  assertCanonicalByteLimit(normalized, maximum, label);
  return deepFreeze(normalized);
}

export function normalizePackageReference(value, label = "Package reference", {entry = false} = {}) {
  const input = objectValue(value, label);
  const normalized = {
    package: requiredString(input.package, `${label} package`, {maximum:256, pattern:PACKAGE_PATTERN}),
    version: requiredString(input.version, `${label} version`, {maximum:128}),
    id: requiredString(input.id, `${label} id`, {maximum:256, pattern:NAMESPACED_ID_PATTERN}),
  };
  if (entry || input.entry != null) normalized.entry = normalizeEntryReference(input.entry, `${label} entry`);
  return deepFreeze(normalized);
}

export function normalizeEntryReference(value, label = "Entry reference") {
  const input = objectValue(value, label);
  return deepFreeze({
    module: requiredString(input.module, `${label} module`, {maximum:256, pattern:MODULE_PATTERN}),
    function: requiredString(input.function, `${label} function`, {maximum:128, pattern:FUNCTION_PATTERN}),
  });
}

export function normalizeNamespacedId(value, label = "Identifier") {
  return requiredString(value, label, {maximum:256, pattern:NAMESPACED_ID_PATTERN});
}

export function normalizeColor(value, label, fallback) {
  const source = value ?? fallback;
  if (!Array.isArray(source) || source.length !== 3) {
    validationError(`${label} must contain three channels`, "hara/color", {label});
  }
  return Object.freeze(source.map((channel, index) => finiteNumber(
    channel,
    `${label}[${index}]`,
    {minimum:0, maximum:1},
  )));
}

export function sameCanonical(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

export function freezeCanonical(value, label, maximum) {
  const normalized = canonicalValue(value, {label});
  assertCanonicalByteLimit(normalized, maximum, label);
  return deepFreeze(normalized);
}
