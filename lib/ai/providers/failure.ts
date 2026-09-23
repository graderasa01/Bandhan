import type { AiProviderName } from "@/lib/ai/models";
import {
  classifyProviderFailure,
  legacyKindFor,
  redactProviderMessage,
  type AiErrorCategory,
  type AiFailureScope,
  type ProviderFailureFacts,
} from "@/lib/ai/errors";
import type { AiCallFailure, AiUsage } from "./types";

/**
 * Turning a provider's failure into an `AiCallFailure` — shared by all four
 * clients so none of them re-derives a status mapping of its own. That
 * re-deriving is how DeepSeek's 402 and Anthropic's "credit balance is too low"
 * both ended up as a generic `upstream_error`: each client only knew the two or
 * three SDK error classes somebody had thought to catch.
 */

/**
 * Pulls the facts out of whatever an SDK threw. The four SDKs disagree on
 * shape but agree on the parts that matter: a numeric `status`, a `message`,
 * sometimes a `code`/`error.type`, and — Gemini only — structured
 * `errorDetails` that say *which* quota ran out.
 */
export function factsFromError(provider: AiProviderName, err: unknown): ProviderFailureFacts {
  const e = (err ?? {}) as Record<string, unknown>;
  const status = typeof e.status === "number" ? e.status : null;
  const nested = (e.error as Record<string, unknown> | undefined) ?? undefined;
  const nestedError = (nested?.error as Record<string, unknown> | undefined) ?? undefined;
  const code =
    (typeof e.code === "string" && e.code) ||
    (typeof nested?.type === "string" && nested.type) ||
    (typeof nestedError?.type === "string" && nestedError.type) ||
    null;
  return {
    provider,
    status,
    message: err instanceof Error ? err.message : String(err),
    code,
    details: e.errorDetails,
    errorName: (err as { constructor?: { name?: string } })?.constructor?.name ?? (typeof e.name === "string" ? e.name : null),
  };
}

export function failureFromFacts(facts: ProviderFailureFacts, usage?: AiUsage): AiCallFailure {
  const c = classifyProviderFailure(facts);
  return {
    ok: false,
    kind: legacyKindFor(c.category),
    category: c.category,
    message: redactProviderMessage(facts.message || c.reason),
    httpStatus: facts.status ?? null,
    reason: c.reason,
    scope: c.scope,
    retryAfterMs: c.retryAfterMs,
    ...(usage ? { usage } : {}),
  };
}

export function failureFromError(provider: AiProviderName, err: unknown, usage?: AiUsage): AiCallFailure {
  return failureFromFacts(factsFromError(provider, err), usage);
}

const SCOPE_OF: Partial<Record<AiErrorCategory, AiFailureScope>> = {
  MODEL_NOT_CONFIGURED: "provider",
  MODEL_AUTH_FAILED: "provider",
  MODEL_QUOTA_EXCEEDED: "provider",
};

/**
 * A failure the client decided on its own — no key, an empty reply, a
 * refusal, a text-only model handed an image. There is no HTTP status to
 * classify, so the category is stated directly.
 *
 * Request-scoped by default with no cooldown: an empty reply or a refusal is
 * about *this* prompt, and the next, different prompt may be fine.
 */
export function failureOf(
  category: AiErrorCategory,
  message: string,
  extra: { usage?: AiUsage; reason?: string; httpStatus?: number | null; retryAfterMs?: number } = {},
): AiCallFailure {
  return {
    ok: false,
    kind: legacyKindFor(category),
    category,
    message: redactProviderMessage(message),
    httpStatus: extra.httpStatus ?? null,
    reason: extra.reason ?? category.toLowerCase(),
    scope: SCOPE_OF[category] ?? "request",
    retryAfterMs: extra.retryAfterMs ?? 0,
    ...(extra.usage ? { usage: extra.usage } : {}),
  };
}
