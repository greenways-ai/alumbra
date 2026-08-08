import { validationError } from "./errors.js";

const plainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export function canonicalValue(value, { label = "value", maxDepth = 64 } = {}) {
  const seen = new Set();

  const visit = (entry, path, depth) => {
    if (depth > maxDepth) {
      validationError(`${label} exceeds the maximum nesting depth`, "canonical/depth", { path });
    }

    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return entry;

    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) {
        validationError(`${label} contains a non-finite number`, "canonical/non-finite", { path });
      }
      return Object.is(entry, -0) ? 0 : entry;
    }

    if (Array.isArray(entry)) {
      if (seen.has(entry)) validationError(`${label} contains a cycle`, "canonical/cycle", { path });
      seen.add(entry);
      const output = entry.map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      seen.delete(entry);
      return output;
    }

    if (!plainObject(entry)) {
      validationError(`${label} contains an unsupported value`, "canonical/type", {
        path,
        type: Object.prototype.toString.call(entry),
      });
    }

    if (seen.has(entry)) validationError(`${label} contains a cycle`, "canonical/cycle", { path });
    seen.add(entry);
    const output = {};
    for (const key of Object.keys(entry).sort()) {
      const item = entry[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
        validationError(`${label} contains an unsupported property`, "canonical/property", {
          path: `${path}.${key}`,
        });
      }
      Object.defineProperty(output, key, {
        value: visit(item, `${path}.${key}`, depth + 1),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    seen.delete(entry);
    return output;
  };

  return visit(value, "$", 0);
}

export function canonicalStringify(value, options) {
  return JSON.stringify(canonicalValue(value, options));
}

export function canonicalEqual(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

export function assertCanonicalByteLimit(value, maximum, label = "value") {
  const text = canonicalStringify(value, { label });
  const length = new TextEncoder().encode(text).byteLength;
  if (length > maximum) {
    validationError(`${label} exceeds ${maximum} UTF-8 bytes`, "canonical/size", {
      length,
      maximum,
    });
  }
  return text;
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
  return value;
}
