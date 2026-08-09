import {
  canonicalStringify,
  validationError,
} from "@greenways/alumbra-core";

const encoder = new TextEncoder();
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function normalizeSha256Digest(value, label = "SHA-256 digest") {
  const digest = String(value ?? "");
  if (!DIGEST_PATTERN.test(digest)) {
    validationError(`${label} must be a lowercase sha256 digest`, "history/digest", {
      value: digest,
    });
  }
  return digest;
}

export async function digestHistoryValue(value, {
  label = "History value",
} = {}) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    validationError("Web Crypto SHA-256 is unavailable", "history/crypto");
  }
  const bytes = encoder.encode(canonicalStringify(value, { label }));
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((entry) => entry.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
