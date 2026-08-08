const CATALOG_EVENTS = new Set([
  "catalog/select-toolset",
  "catalog/select-activity",
  "catalog/open-activity",
  "catalog/check-activity",
  "catalog/reset-activity",
]);

const RUN_STATUSES = new Set(["idle", "opening", "running", "passed", "failed"]);
const CHECK_STATUSES = new Set(["pending", "passed", "failed"]);

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
};

const objectValue = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
};

const projectCatalog = (catalog) => {
  const input = objectValue(catalog, "Alumbra Renderer Catalog");
  if (!Array.isArray(input.toolsets) || !Array.isArray(input.activities)) {
    throw new TypeError("Alumbra Renderer Catalog requires toolsets and activities arrays");
  }
  const toolsets = input.toolsets.map((toolset, index) => Object.freeze({
    id: nonEmptyString(toolset.id, `Catalog toolset ${index} id`),
    title: nonEmptyString(toolset.title, `Catalog toolset ${index} title`),
    shortTitle: nonEmptyString(toolset.shortTitle ?? toolset.title, `Catalog toolset ${index} short title`),
    description: nonEmptyString(toolset.description, `Catalog toolset ${index} description`),
  }));
  const toolsetIds = new Set();
  for (const toolset of toolsets) {
    if (toolsetIds.has(toolset.id)) throw new Error(`Duplicate Catalog toolset id: ${toolset.id}`);
    toolsetIds.add(toolset.id);
  }
  const activities = input.activities.map((activity, index) => {
    if (activity.path != null) {
      throw new Error(`Catalog activity ${activity.id ?? index} must not expose a project path`);
    }
    const projected = Object.freeze({
      id: nonEmptyString(activity.id, `Catalog activity ${index} id`),
      toolsetId: nonEmptyString(activity.toolsetId, `Catalog activity ${index} toolset id`),
      title: nonEmptyString(activity.title, `Catalog activity ${index} title`),
      level: nonEmptyString(activity.level, `Catalog activity ${index} level`),
      summary: nonEmptyString(activity.summary, `Catalog activity ${index} summary`),
      checkCount: Number(activity.checkCount ?? 0),
    });
    if (!toolsetIds.has(projected.toolsetId)) {
      throw new Error(`Catalog activity ${projected.id} references missing toolset ${projected.toolsetId}`);
    }
    if (!Number.isSafeInteger(projected.checkCount) || projected.checkCount < 0) {
      throw new TypeError(`Catalog activity ${projected.id} checkCount must be a non-negative integer`);
    }
    return projected;
  });
  const activityIds = new Set();
  for (const activity of activities) {
    if (activityIds.has(activity.id)) throw new Error(`Duplicate Catalog activity id: ${activity.id}`);
    activityIds.add(activity.id);
  }
  const selectedActivityId = input.selectedActivityId ?? activities[0]?.id ?? null;
  if (selectedActivityId && !activityIds.has(selectedActivityId)) {
    throw new Error(`Catalog selected activity is not present: ${selectedActivityId}`);
  }
  const selectedToolsetId = input.selectedToolsetId
    ?? activities.find((activity) => activity.id === selectedActivityId)?.toolsetId
    ?? toolsets[0]?.id
    ?? null;
  if (selectedToolsetId && !toolsetIds.has(selectedToolsetId)) {
    throw new Error(`Catalog selected toolset is not present: ${selectedToolsetId}`);
  }
  return Object.freeze({
    id: nonEmptyString(input.id, "Catalog id"),
    title: nonEmptyString(input.title, "Catalog title"),
    toolsets: Object.freeze(toolsets),
    activities: Object.freeze(activities),
    selectedToolsetId,
    selectedActivityId,
  });
};

const normalizeRun = (value = {}) => {
  const input = objectValue(value, "Catalog run");
  const status = input.status ?? "idle";
  if (!RUN_STATUSES.has(status)) throw new Error(`Unsupported Catalog run status: ${status}`);
  const checks = (input.checks ?? []).map((check, index) => {
    const checkStatus = check.status ?? "pending";
    if (!CHECK_STATUSES.has(checkStatus)) throw new Error(`Unsupported Catalog check status: ${checkStatus}`);
    return Object.freeze({
      id: nonEmptyString(check.id ?? `check/${index + 1}`, `Catalog check ${index} id`),
      label: nonEmptyString(check.label, `Catalog check ${index} label`),
      status: checkStatus,
      error: check.error == null ? null : String(check.error),
    });
  });
  return Object.freeze({
    status,
    message: input.message == null ? "" : String(input.message),
    checks: Object.freeze(checks),
  });
};

const eventValue = (type, activityId = null, toolsetId = null) => {
  if (!CATALOG_EVENTS.has(type)) throw new Error(`Unsupported Catalog event: ${type}`);
  return Object.freeze({
    type,
    detail: Object.freeze({
      ...(activityId ? { activityId } : {}),
      ...(toolsetId ? { toolsetId } : {}),
    }),
  });
};

export function createCatalogSession({
  catalog,
  installedDemos,
  dispatch = () => {},
  openDemo = () => {},
  runChecks = async () => ({ status: "passed", checks: [] }),
} = {}) {
  const projected = projectCatalog(catalog);
  const registry = objectValue(installedDemos, "Installed Alumbra demos");
  const byActivity = new Map(projected.activities.map((activity) => [activity.id, activity]));
  for (const activity of projected.activities) {
    const installed = registry[activity.id];
    if (!installed || typeof installed !== "object" || Array.isArray(installed)) {
      throw new Error(`Catalog activity is not installed: ${activity.id}`);
    }
  }
  if (typeof dispatch !== "function" || typeof openDemo !== "function" || typeof runChecks !== "function") {
    throw new TypeError("Catalog session callbacks must be functions");
  }

  let selectedToolsetId = projected.selectedToolsetId;
  let selectedActivityId = projected.selectedActivityId;
  let run = normalizeRun();
  let disposed = false;
  const listeners = new Set();

  const ensureActive = () => {
    if (disposed) throw new Error("Catalog session has been disposed");
  };
  const notify = () => {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  };
  const activityValue = (activityId) => {
    const id = nonEmptyString(activityId, "Catalog activity id");
    const activity = byActivity.get(id);
    if (!activity) throw new Error(`Unknown Catalog activity: ${id}`);
    return activity;
  };
  const emit = (type, activityId = null, toolsetId = null) => {
    const event = eventValue(type, activityId, toolsetId);
    dispatch(event);
    return event;
  };

  function snapshot() {
    return Object.freeze({
      catalog: projected,
      selectedToolsetId,
      selectedActivityId,
      selectedActivity: selectedActivityId ? byActivity.get(selectedActivityId) : null,
      run,
    });
  }

  return Object.freeze({
    snapshot,
    subscribe(listener) {
      ensureActive();
      if (typeof listener !== "function") throw new TypeError("Catalog listener must be a function");
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    selectToolset(toolsetId) {
      ensureActive();
      const id = nonEmptyString(toolsetId, "Catalog toolset id");
      if (!projected.toolsets.some((toolset) => toolset.id === id)) {
        throw new Error(`Unknown Catalog toolset: ${id}`);
      }
      selectedToolsetId = id;
      const current = selectedActivityId ? byActivity.get(selectedActivityId) : null;
      if (!current || current.toolsetId !== id) {
        selectedActivityId = projected.activities.find((activity) => activity.toolsetId === id)?.id ?? null;
      }
      run = normalizeRun();
      emit("catalog/select-toolset", selectedActivityId, selectedToolsetId);
      notify();
    },
    selectActivity(activityId) {
      ensureActive();
      const activity = activityValue(activityId);
      selectedToolsetId = activity.toolsetId;
      selectedActivityId = activity.id;
      run = normalizeRun();
      emit("catalog/select-activity", activity.id, activity.toolsetId);
      notify();
    },
    async openActivity(activityId = selectedActivityId) {
      ensureActive();
      const activity = activityValue(activityId);
      selectedToolsetId = activity.toolsetId;
      selectedActivityId = activity.id;
      run = normalizeRun({ status: "opening", message: `Opening ${activity.title}` });
      emit("catalog/open-activity", activity.id, activity.toolsetId);
      notify();
      try {
        await openDemo(Object.freeze({ activityId: activity.id, demo: registry[activity.id] }));
        run = normalizeRun({ status: "running", message: `${activity.title} is open` });
      } catch (error) {
        run = normalizeRun({ status: "failed", message: error?.message ?? String(error) });
        notify();
        throw error;
      }
      notify();
      return snapshot();
    },
    async checkActivity(activityId = selectedActivityId) {
      ensureActive();
      const activity = activityValue(activityId);
      selectedToolsetId = activity.toolsetId;
      selectedActivityId = activity.id;
      run = normalizeRun({ status: "running", message: `Checking ${activity.title}` });
      emit("catalog/check-activity", activity.id, activity.toolsetId);
      notify();
      try {
        const result = await runChecks(Object.freeze({ activityId: activity.id, demo: registry[activity.id] }));
        run = normalizeRun(result);
      } catch (error) {
        run = normalizeRun({
          status: "failed",
          message: error?.message ?? String(error),
          checks: [{ id: "catalog/check-error", label: "Activity checks completed", status: "failed", error: error?.message }],
        });
      }
      notify();
      return run;
    },
    resetActivity(activityId = selectedActivityId) {
      ensureActive();
      const activity = activityValue(activityId);
      run = normalizeRun();
      emit("catalog/reset-activity", activity.id, activity.toolsetId);
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
  });
}

const element = (documentValue, tag, className, textValue = null) => {
  const node = documentValue.createElement(tag);
  if (className) node.className = className;
  if (textValue != null) node.textContent = textValue;
  return node;
};

export function createCatalogHost({ container, document: documentValue = container?.ownerDocument, ...options } = {}) {
  if (!container || typeof container.replaceChildren !== "function") {
    throw new TypeError("Catalog host requires a DOM container");
  }
  if (!documentValue || typeof documentValue.createElement !== "function") {
    throw new TypeError("Catalog host requires a document");
  }
  const session = createCatalogSession(options);
  const root = element(documentValue, "section", "catalog-surface");
  root.setAttribute("aria-label", "Alumbra Renderer Catalog");
  const heading = element(documentValue, "header", "catalog-heading");
  heading.append(element(documentValue, "p", "catalog-eyebrow", "ALUMBRA / RENDERER CATALOG"));
  heading.append(element(documentValue, "h2", "catalog-title", session.snapshot().catalog.title));
  const toolsets = element(documentValue, "nav", "catalog-toolsets");
  toolsets.setAttribute("aria-label", "Renderer packages");
  const activities = element(documentValue, "div", "catalog-activities");
  const detail = element(documentValue, "article", "catalog-detail");
  const status = element(documentValue, "div", "catalog-run");
  status.setAttribute("aria-live", "polite");
  root.append(heading, toolsets, activities, detail, status);
  container.replaceChildren(root);

  const render = (state) => {
    toolsets.replaceChildren();
    for (const toolset of state.catalog.toolsets) {
      const button = element(documentValue, "button", "catalog-toolset", toolset.shortTitle);
      button.type = "button";
      button.dataset.toolsetId = toolset.id;
      button.setAttribute("aria-pressed", String(toolset.id === state.selectedToolsetId));
      button.addEventListener("click", () => session.selectToolset(toolset.id));
      toolsets.append(button);
    }

    activities.replaceChildren();
    for (const activity of state.catalog.activities.filter((entry) => entry.toolsetId === state.selectedToolsetId)) {
      const button = element(documentValue, "button", "catalog-activity");
      button.type = "button";
      button.dataset.activityId = activity.id;
      button.setAttribute("aria-pressed", String(activity.id === state.selectedActivityId));
      button.append(element(documentValue, "span", "catalog-activity-level", activity.level));
      button.append(element(documentValue, "strong", "catalog-activity-title", activity.title));
      button.append(element(documentValue, "span", "catalog-activity-summary", activity.summary));
      button.addEventListener("click", () => session.selectActivity(activity.id));
      activities.append(button);
    }

    detail.replaceChildren();
    if (state.selectedActivity) {
      detail.append(element(documentValue, "p", "catalog-detail-level", state.selectedActivity.level));
      detail.append(element(documentValue, "h3", "catalog-detail-title", state.selectedActivity.title));
      detail.append(element(documentValue, "p", "catalog-detail-summary", state.selectedActivity.summary));
      const actions = element(documentValue, "div", "catalog-actions");
      const open = element(documentValue, "button", "catalog-action catalog-action-primary", "Open activity");
      open.type = "button";
      open.dataset.catalogAction = "open";
      open.addEventListener("click", () => void session.openActivity());
      const check = element(documentValue, "button", "catalog-action", `Run checks (${state.selectedActivity.checkCount})`);
      check.type = "button";
      check.dataset.catalogAction = "check";
      check.addEventListener("click", () => void session.checkActivity());
      const reset = element(documentValue, "button", "catalog-action", "Reset");
      reset.type = "button";
      reset.dataset.catalogAction = "reset";
      reset.addEventListener("click", () => session.resetActivity());
      actions.append(open, check, reset);
      detail.append(actions);
    }

    status.replaceChildren();
    if (state.run.message) status.append(element(documentValue, "p", "catalog-run-message", state.run.message));
    if (state.run.checks.length) {
      const list = element(documentValue, "ul", "catalog-checks");
      for (const check of state.run.checks) {
        const item = element(documentValue, "li", `catalog-check catalog-check-${check.status}`);
        item.append(element(documentValue, "span", "catalog-check-status", check.status));
        item.append(element(documentValue, "span", "catalog-check-label", check.label));
        list.append(item);
      }
      status.append(list);
    }
    root.dataset.runStatus = state.run.status;
  };

  const unsubscribe = session.subscribe(render);
  return Object.freeze({
    session,
    update(nextCatalog) {
      throw new Error(`Catalog host does not support replacing its immutable catalog: ${nextCatalog?.id ?? "unknown"}`);
    },
    dispose() {
      unsubscribe();
      session.dispose();
      container.replaceChildren();
    },
  });
}
