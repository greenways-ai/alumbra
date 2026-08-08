import {
  assertCanonicalByteLimit,
  canonicalValue,
  deepFreeze,
  validationError,
} from "@greenways/alumbra-core";
import { normalizeBlockPack } from "./block-pack.js";
import {
  LIMITS,
  NAMESPACED_ID_PATTERN,
  PACKAGE_PATTERN,
  boundedArray,
  normalizeEntryReference,
  normalizePackageReference,
  objectValue,
  requiredString,
  safeInteger,
  sameCanonical,
} from "./common.js";
import {
  normalizeGeneratedChunkPlan,
  normalizeGeneratorDescriptor,
} from "./generator-plan.js";
import { normalizeInteractionResult } from "./interaction.js";

export const HARA_ACTIVATION_FORMAT = "alumbra.hara-activation/1";
export const HARA_INVOCATION_FORMAT = "alumbra.hara-invocation/1";
export const HARA_RESULT_FORMAT = "alumbra.hara-result/1";

export const HARA_RUNTIME_LIMITS = Object.freeze({
  argumentsBytes: 2 * 1024 * 1024,
  resultBytes: 2 * 1024 * 1024,
  errorBytes: 64 * 1024,
  packages: LIMITS.packageRefs,
});

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RESULT_STATUSES = new Set(["ok", "error"]);

export class HaraRuleRuntimeError extends Error {
  constructor(message, {code = "hara/runtime", details = null} = {}) {
    super(message);
    this.name = "HaraRuleRuntimeError";
    this.code = code;
    this.details = details;
  }
}

function exactKeys(value, allowed, label) {
  const keys = Object.keys(value);
  const unexpected = keys.filter((key) => !allowed.has(key));
  if (unexpected.length) {
    validationError(`${label} contains unsupported fields`, "hara/runtime-fields", {
      label,
      fields:unexpected.sort(),
    });
  }
}

function normalizeDigest(value, label) {
  return requiredString(value, label, {maximum:71, pattern:SHA256_PATTERN});
}

function normalizeProjectEvidence(value) {
  const input = objectValue(value, "Hara project evidence");
  exactKeys(input, new Set(["id", "version", "digest"]), "Hara project evidence");
  return deepFreeze({
    id:requiredString(input.id, "Hara project id", {
      maximum:256,
      pattern:NAMESPACED_ID_PATTERN,
    }),
    version:requiredString(input.version, "Hara project version", {maximum:128}),
    digest:normalizeDigest(input.digest, "Hara project digest"),
  });
}

function normalizeLockEvidence(value) {
  const input = objectValue(value, "Hara lock evidence");
  exactKeys(input, new Set(["format", "digest"]), "Hara lock evidence");
  return deepFreeze({
    format:safeInteger(input.format, "Hara lock format", {minimum:1, maximum:1}),
    digest:normalizeDigest(input.digest, "Hara lock digest"),
  });
}

function normalizePinnedPackage(value, index) {
  const input = objectValue(value, `Pinned Hara package ${index}`);
  exactKeys(input, new Set(["package", "version"]), `Pinned Hara package ${index}`);
  return deepFreeze({
    package:requiredString(input.package, `Pinned Hara package ${index} coordinate`, {
      maximum:256,
      pattern:PACKAGE_PATTERN,
    }),
    version:requiredString(input.version, `Pinned Hara package ${index} version`, {maximum:128}),
  });
}

export function normalizeHaraActivation(value) {
  const input = objectValue(value, "Hara activation");
  exactKeys(
    input,
    new Set(["format", "project", "lock", "packages", "capabilities"]),
    "Hara activation",
  );
  if (input.format != null && input.format !== HARA_ACTIVATION_FORMAT) {
    validationError(`Unsupported Hara activation format: ${input.format}`, "hara/activation-format", {
      format:input.format,
    });
  }
  const packages = boundedArray(
    input.packages,
    "Pinned Hara packages",
    HARA_RUNTIME_LIMITS.packages,
  ).map(normalizePinnedPackage);
  if (!packages.length) {
    validationError("Hara activation requires at least one pinned package", "hara/activation-packages");
  }
  packages.sort((left, right) => {
    const packageOrder = left.package.localeCompare(right.package);
    return packageOrder || left.version.localeCompare(right.version);
  });
  const packageCoordinates = new Set();
  for (const entry of packages) {
    if (packageCoordinates.has(entry.package)) {
      validationError(`Hara activation pins ${entry.package} more than once`, "hara/activation-package-duplicate", {
        package:entry.package,
      });
    }
    packageCoordinates.add(entry.package);
  }
  const capabilities = input.capabilities ?? [];
  if (!Array.isArray(capabilities) || capabilities.length !== 0) {
    validationError(
      "Alumbra Hara rule activation cannot request ambient capabilities",
      "hara/activation-capabilities",
    );
  }
  return deepFreeze({
    format:HARA_ACTIVATION_FORMAT,
    project:normalizeProjectEvidence(input.project),
    lock:normalizeLockEvidence(input.lock),
    packages:Object.freeze(packages),
    capabilities:Object.freeze([]),
  });
}

function normalizeRuntimeReference(value, label = "Hara runtime reference") {
  const input = objectValue(value, label);
  exactKeys(input, new Set(["package", "version", "entry"]), label);
  return deepFreeze({
    package:requiredString(input.package, `${label} package`, {
      maximum:256,
      pattern:PACKAGE_PATTERN,
    }),
    version:requiredString(input.version, `${label} version`, {maximum:128}),
    entry:normalizeEntryReference(input.entry, `${label} entry`),
  });
}

function normalizeArguments(value) {
  const source = boundedArray(value ?? [], "Hara invocation arguments", 1024);
  const normalized = canonicalValue(source, {label:"Hara invocation arguments"});
  assertCanonicalByteLimit(
    normalized,
    HARA_RUNTIME_LIMITS.argumentsBytes,
    "Hara invocation arguments",
  );
  return deepFreeze(normalized);
}

function pinnedVersion(activation, packageId) {
  return activation.packages.find((entry) => entry.package === packageId)?.version ?? null;
}

function assertPinned(activation, reference) {
  const version = pinnedVersion(activation, reference.package);
  if (version == null) {
    validationError(`Hara package ${reference.package} is not pinned by the active lock`, "hara/package-unpinned", {
      package:reference.package,
    });
  }
  if (version !== reference.version) {
    validationError(
      `Hara package ${reference.package} requested ${reference.version} but the active lock pins ${version}`,
      "hara/package-version-mismatch",
      {package:reference.package, requested:reference.version, pinned:version},
    );
  }
}

function normalizeInvocationId(value, sequence) {
  return requiredString(value ?? `runtime/${sequence}`, "Hara invocation id", {
    maximum:256,
    pattern:NAMESPACED_ID_PATTERN,
  });
}

function normalizeRuntimeError(value, invocationId) {
  const input = objectValue(value, "Hara runtime error");
  exactKeys(input, new Set(["code", "message", "data"]), "Hara runtime error");
  const normalized = deepFreeze({
    code:requiredString(input.code, "Hara runtime error code", {
      maximum:256,
      pattern:NAMESPACED_ID_PATTERN,
    }),
    message:requiredString(input.message, "Hara runtime error message", {maximum:8192}),
    data:deepFreeze(canonicalValue(input.data ?? {}, {label:"Hara runtime error data"})),
  });
  assertCanonicalByteLimit(normalized, HARA_RUNTIME_LIMITS.errorBytes, "Hara runtime error");
  return new HaraRuleRuntimeError(normalized.message, {
    code:normalized.code,
    details:deepFreeze({invocation:invocationId, data:normalized.data}),
  });
}

function normalizeResultEnvelope(value, request, maximumBytes) {
  const input = objectValue(value, "Hara invocation result");
  if (input.capabilities != null || input["capability-requests"] != null) {
    validationError(
      "Hara invocation results cannot request ambient capabilities",
      "hara/result-capability-request",
      {invocation:request.id},
    );
  }
  exactKeys(input, new Set(["format", "id", "status", "value", "error"]), "Hara invocation result");
  if (input.format !== HARA_RESULT_FORMAT) {
    validationError(`Unsupported Hara result format: ${input.format}`, "hara/result-format", {
      format:input.format,
      invocation:request.id,
    });
  }
  const id = requiredString(input.id, "Hara result invocation id", {
    maximum:256,
    pattern:NAMESPACED_ID_PATTERN,
  });
  if (id !== request.id) {
    validationError("Hara result invocation id does not match its request", "hara/result-id", {
      expected:request.id,
      actual:id,
    });
  }
  const status = requiredString(input.status, "Hara result status", {
    maximum:16,
    pattern:/^[a-z]+$/,
  });
  if (!RESULT_STATUSES.has(status)) {
    validationError(`Unsupported Hara result status: ${status}`, "hara/result-status", {status});
  }
  if (status === "error") {
    if (Object.prototype.hasOwnProperty.call(input, "value")) {
      validationError("Hara error result cannot contain a value", "hara/result-error-value", {id});
    }
    throw normalizeRuntimeError(input.error, id);
  }
  if (Object.prototype.hasOwnProperty.call(input, "error")) {
    validationError("Successful Hara result cannot contain an error", "hara/result-success-error", {id});
  }
  if (!Object.prototype.hasOwnProperty.call(input, "value")) {
    validationError("Successful Hara result requires a value", "hara/result-value", {id});
  }
  const normalized = canonicalValue(input.value, {label:"Hara invocation value"});
  assertCanonicalByteLimit(normalized, maximumBytes, "Hara invocation value");
  return deepFreeze(normalized);
}

function providerFailure(error, invocationId) {
  if (error instanceof HaraRuleRuntimeError || error?.name === "AlumbraValidationError") return error;
  const message = error instanceof Error && error.message
    ? error.message
    : "Hara runtime provider failed";
  return new HaraRuleRuntimeError(message, {
    code:"hara/provider-failure",
    details:deepFreeze({invocation:invocationId}),
  });
}

function cancellationError(invocationId, reason) {
  return new HaraRuleRuntimeError("Hara invocation was cancelled", {
    code:"hara/cancelled",
    details:deepFreeze({invocation:invocationId, reason:String(reason ?? "cancelled").slice(0, 1024)}),
  });
}

async function disposeMismatchedSession(session) {
  try {
    await session?.dispose?.();
  } catch {
    // Activation mismatch is authoritative; provider cleanup failure must not mask it.
  }
}

export async function createHaraRulesSession({provider, activation}) {
  if (!provider || typeof provider.activate !== "function") {
    validationError("Hara runtime provider must implement activate(activation)", "hara/provider-contract");
  }
  const normalizedActivation = normalizeHaraActivation(activation);
  const providerSession = await provider.activate(normalizedActivation);
  if (!providerSession || typeof providerSession !== "object") {
    validationError("Hara runtime provider returned no session", "hara/session-contract");
  }
  if (typeof providerSession.invoke !== "function" || typeof providerSession.dispose !== "function") {
    await disposeMismatchedSession(providerSession);
    validationError(
      "Hara runtime session must implement invoke(request, options) and dispose()",
      "hara/session-contract",
    );
  }
  let sessionMatches = false;
  try {
    sessionMatches = sameCanonical(
      normalizeHaraActivation(providerSession.activation),
      normalizedActivation,
    );
  } catch {
    sessionMatches = false;
  }
  if (!sessionMatches) {
    await disposeMismatchedSession(providerSession);
    validationError(
      "Hara runtime session activation evidence does not match the requested project and lock",
      "hara/session-activation-mismatch",
    );
  }

  let disposed = false;
  let sequence = 0;
  const pending = new Map();

  function ensureActive() {
    if (disposed) {
      throw new HaraRuleRuntimeError("Hara runtime session has been disposed", {
        code:"hara/session-disposed",
      });
    }
  }

  async function cancelInvocation(id, reason) {
    const record = pending.get(id);
    if (!record || record.cancelled) return;
    record.cancelled = true;
    record.controller.abort(reason);
    if (typeof providerSession.cancel === "function") {
      try {
        await providerSession.cancel(id, reason);
      } catch {
        // The cancellation result is represented by the local bounded error.
      }
    }
  }

  async function invoke(reference, argumentsValue = [], options = {}) {
    ensureActive();
    const normalizedReference = normalizeRuntimeReference(reference);
    assertPinned(normalizedActivation, normalizedReference);
    sequence += 1;
    const id = normalizeInvocationId(options.id, sequence);
    if (pending.has(id)) {
      validationError(`Hara invocation ${id} is already active`, "hara/invocation-duplicate", {id});
    }
    const maximumBytes = safeInteger(
      options.maximumBytes ?? HARA_RUNTIME_LIMITS.resultBytes,
      "Hara invocation result limit",
      {minimum:1, maximum:HARA_RUNTIME_LIMITS.resultBytes},
    );
    const request = deepFreeze({
      format:HARA_INVOCATION_FORMAT,
      id,
      package:normalizedReference.package,
      version:normalizedReference.version,
      entry:normalizedReference.entry,
      arguments:normalizeArguments(argumentsValue),
    });
    const externalSignal = options.signal ?? null;
    if (externalSignal != null && typeof externalSignal.addEventListener !== "function") {
      validationError("Hara invocation signal must be an AbortSignal", "hara/invocation-signal");
    }
    if (externalSignal?.aborted) throw cancellationError(id, externalSignal.reason);

    const controller = new AbortController();
    const record = {controller, cancelled:false};
    pending.set(id, record);
    const onAbort = () => {
      void cancelInvocation(id, externalSignal.reason);
    };
    externalSignal?.addEventListener("abort", onAbort, {once:true});

    const providerPromise = Promise.resolve().then(() => providerSession.invoke(
      request,
      {signal:controller.signal},
    ));
    const abortPromise = new Promise((resolve, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(cancellationError(id, controller.signal.reason));
      }, {once:true});
    });

    try {
      const result = await Promise.race([providerPromise, abortPromise]);
      return normalizeResultEnvelope(result, request, maximumBytes);
    } catch (error) {
      throw providerFailure(error, id);
    } finally {
      externalSignal?.removeEventListener("abort", onAbort);
      pending.delete(id);
    }
  }

  async function invokeBlockPack(reference, argumentsValue = [], options = {}) {
    const normalizedReference = normalizePackageReference(reference, "Runtime block-pack reference", {
      entry:true,
    });
    const value = await invoke({
      package:normalizedReference.package,
      version:normalizedReference.version,
      entry:normalizedReference.entry,
    }, argumentsValue, options);
    const pack = normalizeBlockPack(value);
    if (
      pack.package !== normalizedReference.package
      || pack.version !== normalizedReference.version
      || pack.id !== normalizedReference.id
    ) {
      validationError(
        "Runtime block pack does not match its pinned reference",
        "hara/runtime-block-pack-mismatch",
        {expected:normalizedReference, actual:{package:pack.package, version:pack.version, id:pack.id}},
      );
    }
    return pack;
  }

  async function invokeGenerator(generatorValue, argumentsValue, {
    registry,
    expectedCoord = null,
    expectedShape = null,
    ...options
  } = {}) {
    const generator = normalizeGeneratorDescriptor(generatorValue);
    const value = await invoke({
      package:generator.package,
      version:generator.version,
      entry:generator.entry,
    }, argumentsValue, options);
    return normalizeGeneratedChunkPlan(value, registry, {
      expectedGenerator:generator,
      expectedCoord,
      expectedShape,
    });
  }

  async function invokeInteraction(reference, argumentsValue, {registry, ...options} = {}) {
    const normalizedReference = normalizePackageReference(reference, "Runtime interaction reference", {
      entry:true,
    });
    const value = await invoke({
      package:normalizedReference.package,
      version:normalizedReference.version,
      entry:normalizedReference.entry,
    }, argumentsValue, options);
    return normalizeInteractionResult(value, registry);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const cancellations = [...pending.keys()].map((id) => cancelInvocation(id, "session disposed"));
    await Promise.allSettled(cancellations);
    await providerSession.dispose();
  }

  return Object.freeze({
    activation:normalizedActivation,
    invoke,
    invokeBlockPack,
    invokeGenerator,
    invokeInteraction,
    dispose,
  });
}
