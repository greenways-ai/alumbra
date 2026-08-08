export function createReferencePool({ keyOf, create, destroy = (value) => value?.destroy?.() } = {}) {
  if (typeof keyOf !== "function" || typeof create !== "function" || typeof destroy !== "function") {
    throw new TypeError("Reference pool requires keyOf, create and destroy functions");
  }
  const records = new Map();
  let disposed = false;

  return Object.freeze({
    acquire(input) {
      if (disposed) throw new Error("Reference pool has been destroyed");
      const key = String(keyOf(input));
      let record = records.get(key);
      if (!record) {
        record = { key, value: create(input, key), references: 0 };
        records.set(key, record);
      }
      record.references += 1;
      return Object.freeze({ key, value: record.value });
    },
    release(key) {
      const record = records.get(String(key));
      if (!record) return false;
      record.references -= 1;
      if (record.references < 0) throw new Error(`Reference pool released ${key} too many times`);
      if (record.references === 0) {
        records.delete(record.key);
        destroy(record.value, record.key);
      }
      return true;
    },
    stats() {
      return Object.freeze({
        resources: records.size,
        references: [...records.values()].reduce((sum, record) => sum + record.references, 0),
      });
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const record of records.values()) destroy(record.value, record.key);
      records.clear();
    },
  });
}
