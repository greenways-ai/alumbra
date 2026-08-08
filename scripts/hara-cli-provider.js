import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  HARA_RESULT_FORMAT,
  HaraRuleRuntimeError,
  normalizeHaraActivation,
} from "../packages/hara/src/index.js";

const MODULE_PATTERN = /^[a-z][a-z0-9._-]*(?:\.[a-z][a-z0-9._-]*)*$/;
const FUNCTION_PATTERN = /^[a-z][a-z0-9._!?*-]*$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_BYTES = 4 * 1024 * 1024;
const CAPABILITY_KEYS = new Set([
  "capabilities",
  "capabilityRequests",
  "capability-requests",
]);

export function sha256Evidence(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function projectField(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new HaraRuleRuntimeError(`Cannot read ${label} from project evidence`, {
      code:"hara/project-evidence",
      details:{label},
    });
  }
  return match[1];
}

function parseProjectEvidence(source) {
  return {
    id:projectField(source, /:project\/id\s+([^\s}\]]+)/, ":project/id"),
    version:projectField(source, /:project\/version\s+"([^"]+)"/, ":project/version"),
  };
}

function parseLockFormat(source) {
  const value = Number(projectField(source, /:lock\/format\s+(\d+)/, ":lock/format"));
  if (!Number.isSafeInteger(value)) {
    throw new HaraRuleRuntimeError("Hara lock format is not an integer", {
      code:"hara/lock-evidence",
    });
  }
  return value;
}

function boundedText(value, maximum = 8192) {
  return String(value ?? "").slice(0, maximum);
}

function runtimeError(code, message, details = null) {
  return new HaraRuleRuntimeError(message, {code, details});
}

function resultError(request, code, message, data = {}) {
  return {
    format:HARA_RESULT_FORMAT,
    id:request.id,
    status:"error",
    error:{
      code,
      message:boundedText(message),
      data,
    },
  };
}

function resultValue(request, value) {
  return {
    format:HARA_RESULT_FORMAT,
    id:request.id,
    status:"ok",
    value,
  };
}

function requestedCapabilityPath(value, pathValue = "$", depth = 0) {
  if (depth > 64 || value == null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = requestedCapabilityPath(value[index], `${pathValue}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (CAPABILITY_KEYS.has(key)) {
      const emptyArray = Array.isArray(entry) && entry.length === 0;
      const emptyObject = entry && typeof entry === "object"
        && !Array.isArray(entry)
        && Object.keys(entry).length === 0;
      if (entry != null && entry !== false && !emptyArray && !emptyObject) {
        return `${pathValue}.${key}`;
      }
    }
    const found = requestedCapabilityPath(entry, `${pathValue}.${key}`, depth + 1);
    if (found) return found;
  }
  return null;
}

export function buildHaraInvocationSource(request) {
  const module = request?.entry?.module;
  const functionName = request?.entry?.function;
  if (!MODULE_PATTERN.test(module ?? "") || !FUNCTION_PATTERN.test(functionName ?? "")) {
    throw runtimeError(
      "hara/invocation-entry",
      "Hara invocation contains an invalid module or function",
      {module, function:functionName},
    );
  }
  const argumentsJson = JSON.stringify(request.arguments ?? []);
  const argumentsLiteral = JSON.stringify(argumentsJson);
  return `(ns alumbra.runtime.invoke\n`
    + `  (:require [std.json :as json]\n`
    + `            [${module} :as target]))\n\n`
    + `(json/write\n`
    + ` (apply target/${functionName}\n`
    + `        (json/read ${argumentsLiteral})))\n`;
}

export function parseHaraJsonOutput(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const jsonText = JSON.parse(lines[index]);
      if (typeof jsonText !== "string") continue;
      return JSON.parse(jsonText);
    } catch {
      // Earlier lines may contain diagnostics; keep looking for the final Hara string value.
    }
  }
  throw runtimeError("hara/runtime-output", "Hara runtime did not return a JSON string value", {
    stdout:boundedText(stdout),
  });
}

function execute(binary, args, {
  input = "",
  signal = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumOutputBytes = DEFAULT_OUTPUT_BYTES,
  onChild = null,
  onClose = null,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio:["pipe", "pipe", "pipe"],
      env:{...process.env, NO_COLOR:"1"},
    });
    onChild?.(child);
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let limit = null;
    let timedOut = false;
    let settled = false;

    const kill = () => {
      if (!child.killed) child.kill("SIGTERM");
    };
    const onAbort = () => kill();
    signal?.addEventListener("abort", onAbort, {once:true});
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maximumOutputBytes) {
        limit = "stdout";
        kill();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maximumOutputBytes) {
        limit = "stderr";
        kill();
        return;
      }
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      onClose?.();
      reject(error);
    });
    child.on("close", (code, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      onClose?.();
      resolve({
        code,
        signal:closeSignal,
        stdout:Buffer.concat(stdout).toString("utf8"),
        stderr:Buffer.concat(stderr).toString("utf8"),
        timedOut,
        limit,
        aborted:Boolean(signal?.aborted),
      });
    });
    child.stdin.on("error", () => {
      // Cancellation may close stdin before the source has been fully written.
    });
    child.stdin.end(input);
  });
}

export function createHaraCliProvider({
  binary = process.env.HARA_BIN || "hara",
  projectRoot,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumOutputBytes = DEFAULT_OUTPUT_BYTES,
} = {}) {
  if (!projectRoot) {
    throw runtimeError("hara/provider-project", "Hara CLI provider requires projectRoot");
  }
  const resolvedProjectRoot = path.resolve(projectRoot);

  return {
    async activate(activationValue) {
      const activation = normalizeHaraActivation(activationValue);
      const projectPath = path.join(resolvedProjectRoot, "project.edn");
      const lockPath = path.join(resolvedProjectRoot, "project.lock.edn");
      const [projectBytes, lockBytes] = await Promise.all([
        readFile(projectPath),
        readFile(lockPath),
      ]);
      const projectText = projectBytes.toString("utf8");
      const lockText = lockBytes.toString("utf8");
      const project = parseProjectEvidence(projectText);
      const projectDigest = sha256Evidence(projectBytes);
      const lockDigest = sha256Evidence(lockBytes);
      const lockFormat = parseLockFormat(lockText);

      if (activation.project.id !== project.id || activation.project.version !== project.version) {
        throw runtimeError(
          "hara/activation-project",
          "Hara activation project identity does not match project.edn",
          {expected:project, actual:activation.project},
        );
      }
      if (activation.project.digest !== projectDigest) {
        throw runtimeError(
          "hara/activation-project-digest",
          "Hara activation project digest does not match project.edn",
          {expected:projectDigest, actual:activation.project.digest},
        );
      }
      if (activation.lock.format !== lockFormat || activation.lock.digest !== lockDigest) {
        throw runtimeError(
          "hara/activation-lock",
          "Hara activation lock evidence does not match project.lock.edn",
          {
            expected:{format:lockFormat, digest:lockDigest},
            actual:activation.lock,
          },
        );
      }
      const rootPackage = `hara:${project.id}`;
      const rootPin = activation.packages.find((entry) => entry.package === rootPackage);
      if (!rootPin || rootPin.version !== project.version) {
        throw runtimeError(
          "hara/activation-root-package",
          "Hara activation does not pin the project package at its exact version",
          {package:rootPackage, version:project.version},
        );
      }

      let check;
      try {
        check = await execute(binary, [
          "--project", resolvedProjectRoot,
          "--no-color",
          "--no-splash",
          "check",
        ], {timeoutMs, maximumOutputBytes});
      } catch (error) {
        throw runtimeError("hara/cli-start", `Cannot start Hara CLI: ${error.message}`, {
          binary,
        });
      }
      if (check.code !== 0) {
        throw runtimeError("hara/project-check", "Hara CLI rejected the pinned project", {
          exitCode:check.code,
          signal:check.signal,
          stderr:boundedText(check.stderr),
        });
      }

      let disposed = false;
      const children = new Map();

      return {
        activation,
        async invoke(request, {signal = null} = {}) {
          if (disposed) {
            return resultError(request, "hara/session-disposed", "Hara CLI session is disposed");
          }
          if (request.package !== rootPackage || request.version !== project.version) {
            return resultError(
              request,
              "hara/provider-package",
              "Hara CLI provider cannot resolve the requested package from this project",
              {
                expected:{package:rootPackage, version:project.version},
                actual:{package:request.package, version:request.version},
              },
            );
          }
          let source;
          try {
            source = buildHaraInvocationSource(request);
          } catch (error) {
            return resultError(
              request,
              error.code ?? "hara/invocation-source",
              error.message,
              error.details ?? {},
            );
          }
          let execution;
          try {
            execution = await execute(binary, [
              "--project", resolvedProjectRoot,
              "--no-color",
              "--no-splash",
              "stdin",
            ], {
              input:source,
              signal,
              timeoutMs,
              maximumOutputBytes,
              onChild:(child) => children.set(request.id, child),
              onClose:() => children.delete(request.id),
            });
          } catch (error) {
            return resultError(request, "hara/cli-start", `Cannot start Hara CLI: ${error.message}`, {
              binary,
            });
          }
          if (execution.aborted) {
            return resultError(request, "hara/cancelled", "Hara CLI invocation was cancelled");
          }
          if (execution.timedOut) {
            return resultError(request, "hara/runtime-timeout", "Hara CLI invocation exceeded its time limit", {
              timeoutMs,
            });
          }
          if (execution.limit) {
            return resultError(request, "hara/runtime-output-limit", "Hara CLI exceeded its output limit", {
              stream:execution.limit,
              maximumOutputBytes,
            });
          }
          if (execution.code !== 0) {
            return resultError(request, "hara/runtime-evaluation", "Hara CLI could not evaluate the rule entry point", {
              exitCode:execution.code,
              signal:execution.signal,
              stderr:boundedText(execution.stderr),
            });
          }
          try {
            const value = parseHaraJsonOutput(execution.stdout);
            const capabilityPath = requestedCapabilityPath(value);
            if (capabilityPath) {
              return resultError(
                request,
                "hara/result-capability-request",
                "Hara rule result requested ambient capabilities",
                {path:capabilityPath},
              );
            }
            return resultValue(request, value);
          } catch (error) {
            return resultError(
              request,
              error.code ?? "hara/runtime-output",
              error.message,
              error.details ?? {stdout:boundedText(execution.stdout)},
            );
          }
        },
        async cancel(id) {
          const child = children.get(id);
          if (child && !child.killed) child.kill("SIGTERM");
        },
        async dispose() {
          if (disposed) return;
          disposed = true;
          for (const child of children.values()) {
            if (!child.killed) child.kill("SIGTERM");
          }
          children.clear();
        },
      };
    },
  };
}
