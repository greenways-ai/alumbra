let provider = () => Object.freeze({
  activeActivity: null,
  mode: "single",
  sessions: Object.freeze([]),
});

export function setViewportEvidenceProvider(value) {
  if (typeof value !== "function") throw new TypeError("Viewport evidence provider must be a function");
  const previous = provider;
  provider = value;
  return () => {
    if (provider === value) provider = previous;
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
  return Object.freeze({...value, sessions: Object.freeze(sessions)});
}
