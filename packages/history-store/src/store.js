import { validationError } from "@greenways/alumbra-core";
import { normalizeSha256Digest } from "@greenways/alumbra-history";
import {
  copyBlobBytes,
  verifyBlobDigest,
} from "./bytes.js";

const method = (store, name) => {
  if (typeof store?.[name] !== "function") {
    validationError(`History blob store requires ${name}(...)`, "history-store/contract", {
      method: name,
    });
  }
  return store[name].bind(store);
};

export function bindHistoryBlobStore(store) {
  const has = method(store, "has");
  const put = method(store, "put");
  const get = method(store, "get");
  const remove = typeof store.delete === "function" ? store.delete.bind(store) : null;
  return Object.freeze({
    async has(digest) {
      return Boolean(await has(normalizeSha256Digest(digest)));
    },
    async put(digest, value) {
      const key = await verifyBlobDigest(digest, value, "History blob");
      await put(key, copyBlobBytes(value));
      return key;
    },
    async get(digest) {
      const key = normalizeSha256Digest(digest);
      const value = await get(key);
      if (value == null) return null;
      const bytes = copyBlobBytes(value);
      await verifyBlobDigest(key, bytes, "Stored history blob");
      return bytes;
    },
    async delete(digest) {
      if (!remove) return false;
      return Boolean(await remove(normalizeSha256Digest(digest)));
    },
  });
}

export function createMemoryHistoryBlobStore({
  failPut = null,
} = {}) {
  const values = new Map();
  const puts = new Map();
  let deleted = 0;
  return Object.freeze({
    async has(digest) {
      return values.has(normalizeSha256Digest(digest));
    },
    async put(digest, value) {
      const key = await verifyBlobDigest(digest, value, "Memory history blob");
      const bytes = copyBlobBytes(value);
      if (typeof failPut === "function" && await failPut({ digest: key, bytes: bytes.slice() })) {
        throw new Error(`Injected history blob write failure: ${key}`);
      }
      values.set(key, bytes);
      puts.set(key, (puts.get(key) ?? 0) + 1);
      return key;
    },
    async get(digest) {
      const value = values.get(normalizeSha256Digest(digest));
      return value ? value.slice() : null;
    },
    async delete(digest) {
      const removed = values.delete(normalizeSha256Digest(digest));
      if (removed) deleted += 1;
      return removed;
    },
    stats() {
      return Object.freeze({
        blobs: values.size,
        writes: [...puts.values()].reduce((sum, count) => sum + count, 0),
        uniqueWrites: puts.size,
        deleted,
      });
    },
    putCount(digest) {
      return puts.get(normalizeSha256Digest(digest)) ?? 0;
    },
  });
}
