const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
};

const sequenceValue = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Store sequence must be a non-negative safe integer");
  return value;
};

export function createLocalStorageBackend(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("Local storage backend requires getItem and setItem");
  }
  return Object.freeze({
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem?.(key),
  });
}

export function createOrderedJsonStore({
  backend,
  key,
  serialize = JSON.stringify,
  parse = JSON.parse,
} = {}) {
  if (!backend || typeof backend.getItem !== "function" || typeof backend.setItem !== "function") {
    throw new TypeError("Ordered store requires a getItem/setItem backend");
  }
  if (typeof serialize !== "function" || typeof parse !== "function") {
    throw new TypeError("Ordered store serialize and parse functions are required");
  }
  const storageKey = nonEmptyString(key, "Ordered store key");
  let latestRequested = -1;
  let latestCommitted = -1;
  let tail = Promise.resolve();
  let destroyed = false;

  const ensureActive = () => {
    if (destroyed) throw new Error("Ordered store has been destroyed");
  };

  return Object.freeze({
    get state() {
      return Object.freeze({latestRequested, latestCommitted, destroyed});
    },
    async load() {
      ensureActive();
      await tail.catch(() => {});
      const raw = await backend.getItem(storageKey);
      if (raw == null) return null;
      if (typeof raw !== "string") throw new TypeError("Ordered store backend returned a non-string value");
      return parse(raw);
    },
    save(value, {sequence} = {}) {
      ensureActive();
      const acceptedSequence = sequenceValue(sequence);
      if (acceptedSequence <= latestRequested) {
        return Promise.resolve(Object.freeze({
          accepted: false,
          current: false,
          sequence: acceptedSequence,
          latestRequested,
          latestCommitted,
        }));
      }
      const serialized = serialize(value);
      if (typeof serialized !== "string") throw new TypeError("Ordered store serializer must return a string");
      latestRequested = acceptedSequence;
      const operation = tail.catch(() => {}).then(async () => {
        if (destroyed || acceptedSequence < latestRequested) {
          return Object.freeze({
            accepted: false,
            current: false,
            sequence: acceptedSequence,
            latestRequested,
            latestCommitted,
          });
        }
        await backend.setItem(storageKey, serialized);
        latestCommitted = acceptedSequence;
        return Object.freeze({
          accepted: true,
          current: acceptedSequence === latestRequested,
          sequence: acceptedSequence,
          latestRequested,
          latestCommitted,
        });
      });
      tail = operation;
      return operation;
    },
    async clear() {
      ensureActive();
      await tail.catch(() => {});
      await backend.removeItem?.(storageKey);
      latestRequested = -1;
      latestCommitted = -1;
    },
    async flush() {
      await tail;
      return Object.freeze({latestRequested, latestCommitted});
    },
    destroy() {
      destroyed = true;
    },
  });
}
