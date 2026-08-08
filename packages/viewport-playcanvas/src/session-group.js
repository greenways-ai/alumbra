import {createPlayCanvasViewportSession} from "./session.js";

export function createViewportSessionGroup({
  createSession = createPlayCanvasViewportSession,
} = {}) {
  if (typeof createSession !== "function") throw new TypeError("Viewport session group requires a session factory");
  const sessions = new Map();
  let disposed = false;

  const ensureActive = () => {
    if (disposed) throw new Error("Viewport session group has been destroyed");
  };
  const requireSession = (id) => {
    const session = sessions.get(String(id));
    if (!session) throw new Error(`Unknown viewport session: ${id}`);
    return session;
  };

  return Object.freeze({
    create(id, options = {}) {
      ensureActive();
      const key = String(id);
      if (!key) throw new TypeError("Viewport session id must be non-empty");
      if (sessions.has(key)) throw new Error(`Viewport session already exists: ${key}`);
      const session = createSession({...options, sessionId: key});
      if (!session || typeof session.destroy !== "function") {
        throw new TypeError("Viewport session factory returned an invalid session");
      }
      sessions.set(key, session);
      return session;
    },
    has(id) {
      return sessions.has(String(id));
    },
    get(id) {
      return sessions.get(String(id)) ?? null;
    },
    ids() {
      return Object.freeze([...sessions.keys()]);
    },
    snapshot() {
      return Object.freeze([...sessions.values()].map((session) => session.snapshot()));
    },
    suspend(id, reason = "group") {
      ensureActive();
      return requireSession(id).suspend(reason);
    },
    resume(id, reason = "group") {
      ensureActive();
      return requireSession(id).resume(reason);
    },
    remove(id, {destroy = true} = {}) {
      ensureActive();
      const key = String(id);
      const session = sessions.get(key);
      if (!session) return false;
      sessions.delete(key);
      if (destroy) session.destroy();
      return true;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const session of sessions.values()) session.destroy();
      sessions.clear();
    },
  });
}
