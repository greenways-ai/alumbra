import { validationError } from "@greenways/alumbra-core";
import {
  normalizeMeshLightingEvidence,
  validateMeshLightGroup,
} from "./mesh-light.js";

export const MESH_LIGHT_COLOR_PROFILE_FORMAT = "alumbra.mesh-light-color-profile/1";
export const MESH_LIGHT_COLOR_EVIDENCE_FORMAT = "alumbra.mesh-light-color-evidence/1";

const PROFILE_FIELDS = new Set([
  "format",
  "id",
  "ambient",
  "sunlightScale",
  "emittedScale",
  "resourceKey",
]);
const ID_PATTERN = /^[a-z][a-z0-9._:/-]*$/;

const plainObject = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactObject = (value, label, fields) => {
  if (!plainObject(value)) validationError(`${label} must be an object`, "mesh-light-color/object");
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      validationError(`${label} contains unknown field ${key}`, "mesh-light-color/field", {
        label,
        key,
      });
    }
  }
  return value;
};

const boundedNumber = (value, minimum, maximum, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    validationError(`${label} must be between ${minimum} and ${maximum}`, "mesh-light-color/range", {
      label,
      value,
      minimum,
      maximum,
    });
  }
  return number;
};

const semanticId = (value, label) => {
  const id = String(value ?? "").trim();
  if (!id || id.length > 256 || !ID_PATTERN.test(id)) {
    validationError(`${label} must be a semantic identity`, "mesh-light-color/id", { value: id });
  }
  return id;
};

export function normalizeMeshLightColorProfile(value = {}) {
  const input = exactObject(value, "Mesh light color profile", PROFILE_FIELDS);
  if (input.format != null && input.format !== MESH_LIGHT_COLOR_PROFILE_FORMAT) {
    validationError(
      `Unsupported mesh light color profile format: ${input.format}`,
      "mesh-light-color/format",
    );
  }
  const profile = {
    format: MESH_LIGHT_COLOR_PROFILE_FORMAT,
    id: semanticId(input.id ?? "alumbra/mesh-light-grayscale", "Mesh light color profile id"),
    ambient: boundedNumber(input.ambient ?? 0.12, 0, 1, "Mesh light ambient"),
    sunlightScale: boundedNumber(
      input.sunlightScale ?? 0.88,
      0,
      4,
      "Mesh light sunlight scale",
    ),
    emittedScale: boundedNumber(
      input.emittedScale ?? 1,
      0,
      4,
      "Mesh light emitted scale",
    ),
  };
  profile.resourceKey = [
    profile.id,
    profile.ambient,
    profile.sunlightScale,
    profile.emittedScale,
  ].join("|");
  return Object.freeze(profile);
}

export const DEFAULT_MESH_LIGHT_COLOR_PROFILE = normalizeMeshLightColorProfile();

const byte = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);

export function projectMeshLightColors({
  group,
  lighting: lightingValue,
  profile: profileValue = DEFAULT_MESH_LIGHT_COLOR_PROFILE,
} = {}) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    validationError("Mesh light color projection requires a mesh group", "mesh-light-color/group");
  }
  const vertexCount = group.positions?.length / 3;
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) {
    validationError("Mesh light color projection requires valid positions", "mesh-light-color/positions");
  }
  const lighting = normalizeMeshLightingEvidence(lightingValue);
  const profile = normalizeMeshLightColorProfile(profileValue);
  const light = validateMeshLightGroup(
    group,
    vertexCount,
    lighting,
    "Mesh light color group",
  );
  if (!light.lighted) {
    validationError("Mesh light color projection requires light attributes", "mesh-light-color/unlit");
  }
  const colors = new Uint8Array(vertexCount * 4);
  let minimumByte = 255;
  let maximumByte = 0;
  let sunlightVertices = 0;
  let emittedVertices = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const sunlight = group.sunlight[index];
    const emitted = group.emitted[index];
    const intensity = profile.ambient
      + profile.sunlightScale * (sunlight / lighting.maxLevel)
      + profile.emittedScale * (emitted / lighting.maxLevel);
    const value = byte(intensity);
    const offset = index * 4;
    colors[offset] = value;
    colors[offset + 1] = value;
    colors[offset + 2] = value;
    colors[offset + 3] = 255;
    minimumByte = Math.min(minimumByte, value);
    maximumByte = Math.max(maximumByte, value);
    if (sunlight > 0) sunlightVertices += 1;
    if (emitted > 0) emittedVertices += 1;
  }
  if (vertexCount === 0) minimumByte = 0;
  const evidence = Object.freeze({
    format: MESH_LIGHT_COLOR_EVIDENCE_FORMAT,
    profileId: lighting.profileId,
    generation: lighting.generation,
    epoch: lighting.epoch,
    colorProfileId: profile.id,
    vertices: vertexCount,
    sunlightVertices,
    emittedVertices,
    minimumByte,
    maximumByte,
  });
  return Object.freeze({ colors, evidence });
}

export function describeMeshLightMaterial(descriptor, lighting, profileValue) {
  if (!descriptor || typeof descriptor !== "object" || !descriptor.resourceKey) {
    validationError("Mesh light material projection requires a material descriptor", "mesh-light-color/material");
  }
  const normalizedLighting = normalizeMeshLightingEvidence(lighting);
  const profile = normalizeMeshLightColorProfile(profileValue);
  return Object.freeze({
    ...descriptor,
    vertexColors: true,
    meshLightingProfileId: normalizedLighting.profileId,
    meshLightColorProfileId: profile.id,
    resourceKey: `${descriptor.resourceKey}|mesh-light:${normalizedLighting.profileId}|color:${profile.resourceKey}`,
  });
}

export function meshLightResourceKey(group, profileValue) {
  const profile = normalizeMeshLightColorProfile(profileValue);
  return `${profile.resourceKey}|${group.sunlight?.length ?? 0}|${group.emitted?.length ?? 0}`;
}
