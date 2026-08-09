import {
  canonicalStringify,
  canonicalValue,
  validationError,
} from "@greenways/alumbra-core";
import { normalizeSha256Digest } from "@greenways/alumbra-history";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const byteView = (value, label = "Blob bytes") => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  validationError(`${label} must be an ArrayBuffer or typed byte view`, "history-store/bytes");
};

export function copyBlobBytes(value, label = "Blob bytes") {
  return byteView(value, label).slice();
}

export async function digestBlobBytes(value, label = "Blob bytes") {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) validationError("Web Crypto SHA-256 is unavailable", "history-store/crypto");
  const bytes = byteView(value, label);
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((entry) => entry.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export function encodeCanonicalBlob(value, label = "Archive value") {
  return encoder.encode(canonicalStringify(value, { label }));
}

export function decodeCanonicalBlob(value, label = "Archive bytes") {
  const bytes = byteView(value, label);
  let parsed;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch (error) {
    validationError(`${label} is not canonical UTF-8 JSON`, "history-store/json", {
      message: String(error?.message ?? error),
    });
  }
  const normalized = canonicalValue(parsed, { label });
  const canonical = encodeCanonicalBlob(normalized, label);
  if (canonical.byteLength !== bytes.byteLength
    || canonical.some((entry, index) => entry !== bytes[index])) {
    validationError(`${label} is not in canonical JSON form`, "history-store/canonical-json");
  }
  return normalized;
}

export async function verifyBlobDigest(digest, value, label = "Blob") {
  const expected = normalizeSha256Digest(digest, `${label} digest`);
  const actual = await digestBlobBytes(value, label);
  if (actual !== expected) {
    validationError(`${label} digest does not match`, "history-store/blob-digest", {
      expected,
      actual,
    });
  }
  return expected;
}
