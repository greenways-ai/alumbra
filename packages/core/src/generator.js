import { canonicalStringify, deepFreeze } from "./canonical.js";
import { normalizeVector3 } from "./coordinates.js";
import { validationError } from "./errors.js";

const PACKAGE_PATTERN = /^(hara|npm):[a-z0-9@._/-]+$/;
const ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

export function normalizeGeneratorIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationError("Generator identity must be an object", "generator/identity");
  }
  const packageId = String(value.package || "");
  const version = String(value.version || "").trim();
  const id = String(value.id || "");
  if (!PACKAGE_PATTERN.test(packageId)) {
    validationError(`Invalid generator package: ${packageId}`, "generator/package", {
      package: packageId,
    });
  }
  if (!version) validationError("Generator version is required", "generator/version");
  if (!ID_PATTERN.test(id)) {
    validationError(`Invalid generator id: ${id}`, "generator/id", { id });
  }

  const seedValue = value.seed;
  if (
    typeof seedValue !== "string"
    && !(typeof seedValue === "number" && Number.isSafeInteger(seedValue))
  ) {
    validationError("Generator seed must be a string or safe integer", "generator/seed");
  }

  return deepFreeze({
    package: packageId,
    version,
    id,
    seed: String(seedValue),
  });
}

export function generatorChunkKey(identity, coord) {
  return canonicalStringify({
    generator: normalizeGeneratorIdentity(identity),
    chunk: normalizeVector3(coord, "chunk coordinate"),
  });
}
