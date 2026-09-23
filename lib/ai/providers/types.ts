import type { AiProviderName } from "@/lib/ai/models";
import type { AiErrorCategory, AiFailureScope } from "@/lib/ai/errors";

/**
 * Provider-agnostic content — the shape every route builds, so a route never
 * imports an Anthropic/OpenAI/Gemini type directly. `image`/`pdf` cover the
 * biodata-upload path; every other feature only ever sends `text`.
 */
export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; base64: string }
  | { type: "pdf"; base64: string; filename?: string };

export type AiCallParams = {
  model: string;
  system: string;
  content: string | AiContentBlock[];
  /**
   * The ceiling on *everything the model emits* — reasoning included, not just
   * the answer. On a thinking-enabled model the two share this budget, so a
   * value sized for the answer alone can be spent entirely on reasoning and
   * return no content at all. See `thinking` below.
   */
  maxTokens: number;
  /**
   * `"off"` asks the provider not to reason before answering.
   *
   * Added after every short call in this app started failing with
   * `stop_reason=max_tokens, blocks=thinking`: the configured models
   * (`claude-sonnet-5`, `claude-opus-5`) think by default, thinking is drawn
   * from `maxTokens`, and budgets like 200 (moderation) or 512 (match
   * explanation) were chosen years' worth of models ago to size a short
   * *answer*. The model spent the whole budget reasoning and returned nothing.
   *
   * The rule this encodes: **a call with a `jsonSchema` and a small budget
   * should not think.** Its output shape is already constrained, its length is
   * bounded by that shape, and its cost ceiling was set for the answer. Long
   * open-ended calls (Grio's chat) leave it unset and pay for the reasoning
   * they benefit from.
   *
   * Provider-agnostic on purpose: a caller must never have to know which
   * provider is configured. What each one does with it, though, is not the
   * same, and the differences are load-bearing:
   *
   *   • Anthropic — `thinking: { type: "disabled" }`.
   *   • Gemini    — `thinkingConfig: { thinkingBudget: 0 }`. Added when the
   *                 catalog moved to 3.x; those models reason by default and
   *                 bill it against `maxOutputTokens`, so until this was
   *                 honoured a 512-token budget came back as truncated JSON.
   *   • DeepSeek  — cannot be turned off, so `maxTokens` gets headroom instead.
   *   • OpenAI    — genuinely ignores it.
   *
   * The thing to carry away: "this provider ignores it" is a claim with a
   * shelf life. It was true of Gemini's 2.x line and false the day the catalog
   * moved on, with nothing failing loudly enough to say so.
   */
  thinking?: "off";
  /** When set, the provider is asked to return JSON matching this schema. */
  jsonSchema?: Record<string, unknown>;
  /** OpenAI requires a schema name; ignored by the other providers. */
  schemaName?: string;
  /**
   * The most this one attempt may take, in milliseconds.
   *
   * Every SDK here defaults to ten minutes and retries on its own, which is
   * how a single overloaded provider used to hold a member's chat on
   * "Soch rahe hain…" for as long as the browser was willing to wait. The
   * router (lib/ai/router.ts) sets this per feature and does its own retrying
   * across models; when unset, `defaultTimeoutMs` applies.
   */
  timeoutMs?: number;
};

/** Ceiling for an attempt nobody sized: generous for the one very long call, bounded for the rest. */
export function defaultTimeoutMs(params: Pick<AiCallParams, "maxTokens" | "timeoutMs">): number {
  if (params.timeoutMs && params.timeoutMs > 0) return params.timeoutMs;
  return params.maxTokens > 16_000 ? 10 * 60_000 : 120_000;
}

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type AiErrorKind =
  | "not_configured"
  | "rate_limited"
  | "auth_error"
  | "refusal"
  | "unsupported"
  | "upstream_error";

/**
 * A failed attempt, described precisely.
 *
 * `kind` is the original six-way vocabulary every route still maps through
 * `mapAiError`; `category` is the precise one (lib/ai/errors.ts) the router,
 * the health registry and the debug trace read. `message` is the provider's
 * own text, redacted — a developer's sentence, never shown to a member (the
 * router replaces it with `friendlyAiMessage` before a result leaves `callAi`).
 */
export type AiCallFailure = {
  ok: false;
  kind: AiErrorKind;
  category: AiErrorCategory;
  message: string;
  /** Present when the provider answered at all. */
  httpStatus?: number | null;
  /** Short machine reason from the classifier ("quota:per-day", "overloaded", "balance", …). */
  reason?: string;
  scope?: AiFailureScope;
  /** How long the health registry should skip this model/provider. */
  retryAfterMs?: number;
  // `usage` is present when the request reached the model and was billed — a
  // refusal, or a reply that came back empty/unusable. Absent when the request
  // never completed.
  usage?: AiUsage;
};

export type AiCallResult =
  | { ok: true; text: string; usage: AiUsage; finishReason?: string | null }
  | AiCallFailure;

/** One provider client implements exactly this. */
export type AiProviderClient = {
  name: AiProviderName;
  call(params: AiCallParams): Promise<AiCallResult>;
};

/**
 * Image-editing request — a photo to transform plus a fixed instruction
 * prompt. Deliberately a separate shape from `AiCallParams`: no `jsonSchema`
 * (nothing to structure), no `maxTokens` in the token-budget sense (image
 * models bill per image, not per token) — this is a different capability
 * class, not a variant of the text one. Only `OPENAI`/`GEMINI` implement it;
 * see `photoUltraEnhance` in `lib/ai/models.ts` for why Anthropic/DeepSeek
 * never will.
 */
export type AiImageEditParams = {
  model: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
};

export type AiImageEditResult =
  | { ok: true; imageBase64: string; mimeType: string }
  | { ok: false; kind: AiErrorKind; message: string };
