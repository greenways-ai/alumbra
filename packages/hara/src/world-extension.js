import {
  canonicalValue,
  deepFreeze,
  validationError,
} from "@greenways/alumbra-core";
import {
  LIMITS,
  boundedArray,
  canonicalObject,
  normalizeEntryReference,
  normalizeNamespacedId,
  objectValue,
  requiredString,
} from "./common.js";
import { normalizeGeneratorDescriptor } from "./generator-plan.js";

export const WORLD_EXTENSION_FORMAT = "alumbra.world-extension/1";
export const ALUMBRA_WORLD_EXTENSION_KEY = "ai.greenways.alumbra/world";

function normalizePinnedPackage(value, label, {requiresEntry = false} = {}) {
  const input = objectValue(value, label);
  const normalized = {
    package: requiredString(input.package, `${label} package`, {
      maximum:256,
      pattern:/^(hara|npm):[a-z0-9@._/-]+$/,
    }),
    version: requiredString(input.version, `${label} version`, {maximum:128}),
    id: normalizeNamespacedId(input.id, `${label} id`),
  };
  if (requiresEntry || input.entry != null) {
    normalized.entry = normalizeEntryReference(input.entry, `${label} entry`);
  }
  if (input.configuration != null) {
    normalized.configuration = canonicalObject(
      input.configuration,
      `${label} configuration`,
      LIMITS.generatorParametersBytes,
    );
  }
  return deepFreeze(normalized);
}

function uniquePackages(values, label) {
  const seen = new Set();
  for (const value of values) {
    const key = `${value.package}@${value.version}:${value.id}`;
    if (seen.has(key)) {
      validationError(`${label} contains duplicate package ${key}`, "hara/world-package-duplicate", {key});
    }
    seen.add(key);
  }
}

export function normalizeWorldExtension(value) {
  const input = objectValue(value, "Alumbra world extension");
  if (input.format != null && input.format !== WORLD_EXTENSION_FORMAT) {
    validationError(`Unsupported Alumbra world extension format: ${input.format}`, "hara/world-format", {
      format:input.format,
    });
  }
  const blockPacks = Object.freeze(boundedArray(
    input.blockPacks ?? input["block-packs"] ?? [],
    "Alumbra block packs",
    LIMITS.packageRefs,
  ).map((entry, index) => normalizePinnedPackage(entry, `Alumbra block pack ${index}`)));
  if (!blockPacks.length) {
    validationError("Alumbra world extension requires at least one block pack", "hara/world-block-packs");
  }
  uniquePackages(blockPacks, "Alumbra block packs");

  const generator = normalizeGeneratorDescriptor(input.generator);
  const rules = Object.freeze(boundedArray(
    input.rules ?? [],
    "Alumbra rules",
    LIMITS.packageRefs,
  ).map((entry, index) => normalizePinnedPackage(entry, `Alumbra rule ${index}`, {requiresEntry:true})));
  uniquePackages(rules, "Alumbra rules");

  const mode = requiredString(input.mode ?? "creative", "Alumbra world mode", {
    maximum:64,
    pattern:/^[a-z][a-z0-9._-]*$/,
  });
  const state = canonicalObject(input.state, "Alumbra initial rule state", LIMITS.worldExtensionBytes / 2);
  const metadata = canonicalObject(input.metadata, "Alumbra world metadata", LIMITS.worldExtensionBytes / 4);
  const normalized = deepFreeze({
    format:WORLD_EXTENSION_FORMAT,
    blockPacks,
    generator,
    rules,
    mode,
    state,
    metadata,
  });
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(normalized))).byteLength;
  if (bytes > LIMITS.worldExtensionBytes) {
    validationError(`Alumbra world extension exceeds ${LIMITS.worldExtensionBytes} bytes`, "hara/world-size", {
      bytes,
      maximum:LIMITS.worldExtensionBytes,
    });
  }
  return normalized;
}

export function withAlumbraWorldExtension(world, extension) {
  const input = canonicalValue(objectValue(world, "World manifest"), {label:"World manifest"});
  if (Object.hasOwn(input, ALUMBRA_WORLD_EXTENSION_KEY)) {
    validationError("World manifest already contains an Alumbra extension", "hara/world-extension-present");
  }
  return deepFreeze({
    ...input,
    [ALUMBRA_WORLD_EXTENSION_KEY]:normalizeWorldExtension(extension),
  });
}

export function readAlumbraWorldExtension(world, {required = true} = {}) {
  const input = objectValue(world, "World manifest");
  const value = input[ALUMBRA_WORLD_EXTENSION_KEY];
  if (value == null) {
    if (!required) return null;
    validationError("World manifest does not contain an Alumbra extension", "hara/world-extension-missing");
  }
  return normalizeWorldExtension(value);
}
