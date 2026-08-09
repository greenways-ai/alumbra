export const RESIDENCY_EVIDENCE_FORMAT = "alumbra.residency-evidence/1";

const COUNTER_FIELDS = Object.freeze([
  "desiredChunks",
  "residentChunks",
  "pendingGeneration",
  "runningGeneration",
  "pendingMeshes",
  "runningMeshes",
  "meshInstalls",
  "discardedStaleJobs",
  "evictedResources",
  "failedJobs",
]);

const counter = (value, label) => {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return number;
};

export function normalizeResidencyEvidence(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Residency evidence must be an object");
  }
  const supported = new Set(["format", "status", ...COUNTER_FIELDS]);
  const unexpected = Object.keys(value).filter((key) => !supported.has(key));
  if (unexpected.length) {
    throw new Error(`Residency evidence contains unsupported fields: ${unexpected.sort().join(", ")}`);
  }
  if (value.format != null && value.format !== RESIDENCY_EVIDENCE_FORMAT) {
    throw new Error(`Unsupported residency evidence format: ${value.format}`);
  }
  const status = String(value.status ?? "active");
  if (status !== "active" && status !== "disposed") {
    throw new Error(`Unsupported residency evidence status: ${status}`);
  }
  const output = {
    format: RESIDENCY_EVIDENCE_FORMAT,
    status,
  };
  for (const field of COUNTER_FIELDS) output[field] = counter(value[field], `Residency evidence ${field}`);
  if (output.residentChunks > output.desiredChunks) {
    throw new Error("Resident chunk count cannot exceed desired chunk count");
  }
  return Object.freeze(output);
}
