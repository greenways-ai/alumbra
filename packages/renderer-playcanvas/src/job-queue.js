const abortError = (message) => {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
};

const normalizeId = (value) => {
  const id = String(value ?? "").trim();
  if (!id || id.length > 512) throw new TypeError("Job id must be a non-empty string of at most 512 characters");
  return id;
};

const normalizePriority = (value) => {
  const priority = Number(value ?? 0);
  if (!Number.isSafeInteger(priority)) throw new TypeError("Job priority must be a safe integer");
  return priority;
};

const normalizeConcurrency = (value) => {
  const concurrency = Number(value ?? 1);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new RangeError("Job queue concurrency must be an integer between 1 and 64");
  }
  return concurrency;
};

export function createDeterministicJobQueue({
  name = "Alumbra job queue",
  concurrency = 1,
  execute,
} = {}) {
  if (typeof execute !== "function") throw new TypeError("A deterministic job queue requires an execute function");
  const queueName = String(name || "Alumbra job queue");
  const limit = normalizeConcurrency(concurrency);
  const pending = [];
  const running = new Map();
  const drainWaiters = new Set();
  let sequence = 0;
  let completed = 0;
  let cancelled = 0;
  let failed = 0;
  let destroyed = false;
  let pumpScheduled = false;

  const stats = () => Object.freeze({
    pending: pending.length,
    running: running.size,
    completed,
    cancelled,
    failed,
  });

  const settleDrainWaiters = () => {
    if (pending.length || running.size) return;
    for (const resolve of drainWaiters) resolve(stats());
    drainWaiters.clear();
  };

  const cancelPendingJob = (job, message) => {
    if (job.settled) return;
    job.settled = true;
    job.cancelled = true;
    job.controller.abort(message);
    cancelled += 1;
    job.reject(abortError(message));
  };

  const finishRunningJob = (job, outcome, value) => {
    if (job.settled) return;
    job.settled = true;
    running.delete(job.id);
    if (job.cancelled || job.controller.signal.aborted) {
      cancelled += 1;
      job.reject(abortError(`${queueName} job ${job.id} was cancelled`));
    } else if (outcome === "fulfilled") {
      completed += 1;
      job.resolve(value);
    } else {
      failed += 1;
      job.reject(value);
    }
  };

  const start = (job) => {
    running.set(job.id, job);
    Promise.resolve()
      .then(() => execute(job.value, Object.freeze({
        id: job.id,
        sequence: job.sequence,
        priority: job.priority,
        signal: job.controller.signal,
      })))
      .then(
        (value) => finishRunningJob(job, "fulfilled", value),
        (error) => finishRunningJob(job, "rejected", error),
      )
      .finally(() => {
        schedulePump();
        settleDrainWaiters();
      });
  };

  const pump = () => {
    pumpScheduled = false;
    while (!destroyed && running.size < limit && pending.length) {
      const job = pending.shift();
      if (!job.cancelled) start(job);
    }
    settleDrainWaiters();
  };

  function schedulePump() {
    if (pumpScheduled) return;
    pumpScheduled = true;
    queueMicrotask(pump);
  }

  const api = {
    submit({ id, priority = 0, value } = {}) {
      if (destroyed) throw new Error(`${queueName} has been destroyed`);
      const normalizedId = normalizeId(id);
      if (pending.some((job) => job.id === normalizedId) || running.has(normalizedId)) {
        throw new Error(`${queueName} already contains job ${normalizedId}`);
      }
      const normalizedPriority = normalizePriority(priority);
      const controller = new AbortController();
      const promise = new Promise((resolve, reject) => {
        pending.push({
          id: normalizedId,
          priority: normalizedPriority,
          sequence: sequence++,
          value,
          controller,
          resolve,
          reject,
          cancelled: false,
          settled: false,
        });
      });
      pending.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
      schedulePump();
      return promise;
    },
    cancel(id, reason = null) {
      const normalizedId = normalizeId(id);
      const pendingIndex = pending.findIndex((job) => job.id === normalizedId);
      const message = String(reason || `${queueName} job ${normalizedId} was cancelled`);
      if (pendingIndex >= 0) {
        const [job] = pending.splice(pendingIndex, 1);
        cancelPendingJob(job, message);
        settleDrainWaiters();
        return true;
      }
      const job = running.get(normalizedId);
      if (!job || job.cancelled) return false;
      job.cancelled = true;
      job.controller.abort(message);
      return true;
    },
    has(id) {
      const normalizedId = normalizeId(id);
      return pending.some((job) => job.id === normalizedId) || running.has(normalizedId);
    },
    stats,
    drain() {
      if (!pending.length && !running.size) return Promise.resolve(stats());
      return new Promise((resolve) => drainWaiters.add(resolve));
    },
    async destroy() {
      if (destroyed) return api.drain();
      destroyed = true;
      while (pending.length) {
        cancelPendingJob(pending.shift(), `${queueName} was destroyed`);
      }
      for (const job of running.values()) {
        if (!job.cancelled) {
          job.cancelled = true;
          job.controller.abort(`${queueName} was destroyed`);
        }
      }
      settleDrainWaiters();
      return api.drain();
    },
  };

  return Object.freeze(api);
}
