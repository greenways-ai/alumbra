import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseEdn } from "./edn.mjs";

export const PUBLIC_PACKAGE_ORDER = Object.freeze([
  "@greenways/alumbra-hara",
  "@greenways/alumbra-core",
  "@greenways/alumbra-engine",
  "@greenways/alumbra-renderer-playcanvas",
  "@greenways/alumbra-hodos",
]);

export const TOP_KEYS = new Set([
  "hara/type",
  "showcase/format",
  "showcase/package",
  "showcase/version",
  "showcase/title",
  "showcase/summary",
  "showcase/views",
  "showcase/states",
  "showcase/demos",
]);
export const VIEW_KEYS = new Set([
  "view/id",
  "view/title",
  "view/summary",
  "view/source",
  "view/docs",
]);
export const STATE_KEYS = new Set([
  "state/id",
  "state/title",
  "state/summary",
  "state/file",
  "state/value",
]);
export const DEMO_KEYS = new Set([
  "demo/id",
  "demo/title",
  "demo/summary",
  "demo/view",
  "demo/state",
  "demo/project",
  "demo/surface",
  "demo/docs",
  "demo/tags",
  "demo/theme",
  "demo/viewport",
  "demo/default",
]);
export const VIEWPORT_KEYS = new Set(["viewport/width", "viewport/height"]);
const FORBIDDEN_STATE_KEY = /(?:^|\/|-)(?:callback|callbacks|function|functions|shader|shaders|glsl|source|source-code|program|runtime-handle|engine-handle|mesh-buffer|mesh-buffers|chunk-array|capability-grant|capability-grants|url|href|path|project-path|filesystem-path)$/i;
const EXECUTABLE_STRING = /(?:=>|\bfunction\s*\(|\beval\s*\(|javascript:|<script\b|#version\s+\d|\bgl_(?:Position|FragColor)\b)/i;

export const PACKAGE_INDEX = new Map(PUBLIC_PACKAGE_ORDER.map((name, index) => [name, index]));
export const RENDERER_PACKAGE_SET = new Set(PUBLIC_PACKAGE_ORDER);

export const RENDERER_CATALOG_ID = "catalog/alumbra-renderer";
export const RENDERER_CATALOG_VERSION = "1";

export function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a map`);
  }
  return value;
}

export function vectorValue(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a vector`);
  return value;
}

export function token(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be an identifier`);
  }
  return value.trim().replace(/^:/, "");
}

export function text(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function knownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field :${key}`);
  }
}

export function unique(values, label) {
  const result = new Set();
  for (const value of values) {
    if (result.has(value)) throw new Error(`Duplicate ${label} id: ${value}`);
    result.add(value);
  }
  return result;
}

export function relativePath(value, label) {
  const candidate = text(value, label);
  if (
    candidate.startsWith("/")
    || candidate.endsWith("/")
    || candidate.includes("\\")
    || candidate.includes("\0")
    || candidate.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new TypeError(`${label} must be a normalized relative path`);
  }
  return candidate;
}

function targetPath(packageDirectory, value, label) {
  const relative = relativePath(value, label);
  const target = path.resolve(packageDirectory, relative);
  if (target !== packageDirectory && !target.startsWith(`${packageDirectory}${path.sep}`)) {
    throw new Error(`${label} escaped the package root`);
  }
  return { relative, target };
}

export async function requireEntry(packageDirectory, value, expected, label) {
  const resolved = targetPath(packageDirectory, value, label);
  let metadata;
  try {
    metadata = await stat(resolved.target);
  } catch {
    throw new Error(`${label} is missing: ${resolved.relative}`);
  }
  if (expected === "file" && !metadata.isFile()) {
    throw new Error(`${label} must be a file: ${resolved.relative}`);
  }
  if (expected === "directory" && !metadata.isDirectory()) {
    throw new Error(`${label} must be a directory: ${resolved.relative}`);
  }
  return resolved;
}

export async function parseFile(file, label) {
  try {
    return parseEdn(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${label}: ${error.message}`, { cause: error });
  }
}

export function rejectExecutableValue(value, label, keyPath = []) {
  if (typeof value === "string") {
    if (EXECUTABLE_STRING.test(value)) {
      throw new Error(`${label} contains executable-looking text at ${keyPath.join(".") || "$"}`);
    }
    return;
  }
  if (value == null || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectExecutableValue(entry, label, [...keyPath, String(index)]));
    return;
  }
  objectValue(value, label);
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_STATE_KEY.test(key)) {
      throw new Error(`${label} contains forbidden field :${key}`);
    }
    rejectExecutableValue(entry, label, [...keyPath, key]);
  }
}

export function declaredWorkspaceSurfaces(workspace) {
  if (token(workspace["hara/type"], "Workspace :hara/type") !== "workspace") {
    throw new Error("Showcase demo workspace.edn must declare :hara/type :workspace");
  }
  const surfaces = new Set();
  const add = (value) => {
    if (typeof value === "string" && value.trim()) surfaces.add(value.trim().replace(/^:/, ""));
  };
  const selection = workspace["workspace/selection"];
  if (selection && typeof selection === "object") add(selection["surface/id"]);
  const customizations = workspace["workspace/customizations"];
  if (customizations && typeof customizations === "object") {
    add(customizations["responsive/default-surface"]);
    for (const surface of customizations["responsive/surfaces"] || []) {
      if (surface && typeof surface === "object") add(surface["surface/id"]);
    }
  }
  for (const area of workspace["workspace/areas"] || []) {
    const presentation = area?.["area/presentation"];
    if (presentation && typeof presentation === "object") {
      add(presentation["presentation/surface"]);
    }
  }
  return surfaces;
}

export function parseCatalogTags(tags, label) {
  const normalized = vectorValue(tags ?? [], `${label} tags`).map((entry, index) =>
    text(entry, `${label} tag ${index}`));
  const levelTag = normalized.find((entry) => entry.startsWith("level:"));
  const checksTag = normalized.find((entry) => entry.startsWith("checks:"));
  const level = levelTag
    ? levelTag.slice("level:".length).split(/[-_]/).map((entry) =>
      entry ? `${entry[0].toUpperCase()}${entry.slice(1)}` : "").join(" ")
    : "Foundation";
  const checkCount = checksTag ? Number(checksTag.slice("checks:".length)) : 0;
  if (!Number.isSafeInteger(checkCount) || checkCount < 0) {
    throw new Error(`${label} checks tag must contain a non-negative integer`);
  }
  return {
    tags: normalized.filter((entry) => !entry.startsWith("level:") && !entry.startsWith("checks:")),
    level,
    checkCount,
  };
}
