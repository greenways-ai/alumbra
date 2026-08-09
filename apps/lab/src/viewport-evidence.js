let provider = () => Object.freeze({
  activeActivity: null,
  mode: "single",
  sessions: Object.freeze([]),
});

const contributors = new Map();

export function setViewportEvidenceProvider(value) {
  if (typeof value !== "function") throw new TypeError("Viewport evidence provider must be a function");
  const previous = provider;
  provider = value;
  return () => {
    if (provider === value) provider = previous;
  };
}

export function setViewportEvidenceContributor(id, value) {
  const key = String(id ?? "").trim();
  if (!key) throw new TypeError("Viewport evidence contributor id must be non-empty");
  if (typeof value !== "function") throw new TypeError("Viewport evidence contributor must be a function");
  if (contributors.has(key)) throw new Error(`Viewport evidence contributor already exists: ${key}`);
  contributors.set(key, value);
  return () => {
    if (contributors.get(key) === value) contributors.delete(key);
  };
}

export function readViewportEvidence() {
  const value = provider();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Viewport evidence provider returned an invalid value");
  }
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.map((session) => Object.freeze({...session}))
    : [];
  const output = {
    ...value,
    sessions: Object.freeze(sessions),
  };
  for (const [id, contribute] of contributors) {
    if (Object.hasOwn(output, id)) {
      throw new Error(`Viewport evidence contributor collides with the base provider: ${id}`);
    }
    const contribution = contribute();
    if (!contribution || typeof contribution !== "object" || Array.isArray(contribution)) {
      throw new TypeError(`Viewport evidence contributor ${id} returned an invalid value`);
    }
    output[id] = Object.freeze({...contribution});
  }
  return Object.freeze(output);
}
