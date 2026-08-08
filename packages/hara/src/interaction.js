import {
  createBlockTransaction,
  deepFreeze,
  validationError,
} from "@greenways/alumbra-core";
import {
  LIMITS,
  boundedArray,
  canonicalObject,
  normalizeNamespacedId,
  objectValue,
  optionalString,
  requiredString,
} from "./common.js";

export const INTERACTION_FORMAT = "alumbra.interaction/1";
const FEEDBACK_KINDS = new Set(["text", "visual", "audio", "haptic", "programmatic"]);

function normalizeEffect(value, index) {
  const input = objectValue(value, `Interaction effect ${index}`);
  return deepFreeze({
    capability: normalizeNamespacedId(input.capability, `Interaction effect ${index} capability`),
    operation: normalizeNamespacedId(input.operation, `Interaction effect ${index} operation`),
    requestId: optionalString(input.requestId ?? input["request-id"], `Interaction effect ${index} request id`, {
      maximum:256,
      pattern:/^[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/,
    }),
    arguments: canonicalObject(
      input.arguments,
      `Interaction effect ${index} arguments`,
      LIMITS.generatorParametersBytes,
    ),
  });
}

function normalizeFeedback(value, index) {
  const input = objectValue(value, `Interaction feedback ${index}`);
  const kind = requiredString(input.kind, `Interaction feedback ${index} kind`, {
    maximum:32,
    pattern:/^[a-z][a-z0-9._-]*$/,
  });
  if (!FEEDBACK_KINDS.has(kind)) {
    validationError(`Unsupported interaction feedback kind: ${kind}`, "hara/feedback-kind", {kind});
  }
  return deepFreeze({
    kind,
    code: input.code == null
      ? null
      : normalizeNamespacedId(input.code, `Interaction feedback ${index} code`),
    message: optionalString(input.message, `Interaction feedback ${index} message`, {
      maximum:LIMITS.itemText,
    }),
    data: canonicalObject(input.data, `Interaction feedback ${index} data`, LIMITS.generatorParametersBytes),
  });
}

export function normalizeInteractionResult(value, registry) {
  if (!registry) validationError("Interaction validation requires a block registry", "hara/interaction-registry");
  const input = objectValue(value, "Interaction result");
  if (input.format != null && input.format !== INTERACTION_FORMAT) {
    validationError(`Unsupported interaction format: ${input.format}`, "hara/interaction-format", {
      format:input.format,
    });
  }
  const id = normalizeNamespacedId(input.id, "Interaction id");
  const transactions = Object.freeze(boundedArray(
    input.transactions ?? [],
    "Interaction transactions",
    LIMITS.transactionsPerInteraction,
  ).map((entry) => createBlockTransaction(entry, registry)));
  const transactionIds = new Set();
  for (const transaction of transactions) {
    if (transactionIds.has(transaction.id)) {
      validationError(`Interaction contains duplicate transaction ${transaction.id}`, "hara/interaction-transaction-duplicate", {
        id:transaction.id,
      });
    }
    transactionIds.add(transaction.id);
  }
  const effects = Object.freeze(boundedArray(
    input.effects ?? [],
    "Interaction effects",
    LIMITS.effectsPerInteraction,
  ).map(normalizeEffect));
  const feedback = Object.freeze(boundedArray(
    input.feedback ?? [],
    "Interaction feedback",
    LIMITS.feedbackPerInteraction,
  ).map(normalizeFeedback));
  if (!transactions.length && !effects.length && !feedback.length) {
    validationError("Interaction result must contain a transaction, effect or feedback", "hara/interaction-empty");
  }
  const metadata = canonicalObject(input.metadata, "Interaction metadata", LIMITS.generatorParametersBytes);
  const normalized = deepFreeze({
    format:INTERACTION_FORMAT,
    id,
    transactions,
    effects,
    feedback,
    metadata,
  });
  const bytes = new TextEncoder().encode(JSON.stringify(normalized)).byteLength;
  if (bytes > LIMITS.interactionBytes) {
    validationError(`Interaction result exceeds ${LIMITS.interactionBytes} bytes`, "hara/interaction-size", {
      bytes,
      maximum:LIMITS.interactionBytes,
    });
  }
  return normalized;
}
