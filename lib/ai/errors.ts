import type { AiProviderName } from "@/lib/ai/models";

/**
 * What happened to one model call, in one vocabulary every provider shares.
 *
 * ## Why this exists
 *
 * Until this file, a failed call was one of six `AiErrorKind`s and most of the
 * interesting failures collapsed into `upstream_error`:
 *
 *   • DeepSeek's `402 Insufficient Balance`            → upstream_error
 *   • Anthropic's `400 … credit balance is too low`    → upstream_error
 *   • Gemini's `503 UNAVAILABLE … high demand`         → upstream_error
 *   • a model ID the provider retired (`404`)          → upstream_error
 *
 * Every one of those needs a different reaction — top up a balance, wait a
 * minute, move to another model, re-pick the model in /admin/ai-settings — and
 * they all reached the user as the same "Jawab nahi ban paaya". Worse, none of
 * them could drive a fallback, because a router cannot tell "this model is
 * busy, try the next one" from "this request is malformed, the next one will
 * fail the same way" when both are called `upstream_error`.
 *
 * So the outcome is now named precisely, once, here — and the provider clients
 * only have to report the raw facts (HTTP status, provider message, error
 * details) for `classifyProviderFailure` to turn them into a category.
 *
 * Pure TypeScript on purpose: the router, the admin health view, the check
 * script and the Grio debug panel all read these names, and none of them may
 * need a database or an SDK to do it.
 */

export const AI_OUTCOMES = [
  "MODEL_SUCCESS",
  "MODEL_NOT_CONFIGURED",
  "MODEL_AUTH_FAILED",
  "MODEL_UNAVAILABLE",
  "MODEL_RATE_LIMITED",
  "MODEL_QUOTA_EXCEEDED",
  "MODEL_TIMEOUT",
  "MODEL_BAD_REQUEST",
  "MODEL_RESPONSE_PARSE_FAILED",
  "MODEL_STREAM_FAILED",
  /** The call succeeded but carried no usable text — usually the budget ran out mid-reasoning. */
  "MODEL_EMPTY_RESPONSE",
  /** The provider declined on content grounds. Never retried elsewhere — see `shouldFallback`. */
  "MODEL_REFUSED",
  /** This model cannot take this input at all (an image to a text-only model). */
  "MODEL_UNSUPPORTED",
  /** The request never reached the provider — DNS, reset connection, offline. */
  "MODEL_NETWORK_ERROR",
] as const;

export type AiOutcome = (typeof AI_OUTCOMES)[number];
export type AiErrorCategory = Exclude<AiOutcome, "MODEL_SUCCESS">;

/**
 * Whether a failure says something about the *model* (only this model ID is
 * affected) or about the *provider account* (every model behind this key is).
 *
 * The distinction is what keeps the health registry honest: an Anthropic key
 * out of credit makes Haiku, Sonnet and Opus all unusable at once, while a
 * Gemini free-tier daily quota is counted per model — `gemini-3.6-flash` can
 * be exhausted while `gemini-3.5-flash` still has its whole allowance.
 */
export type AiFailureScope = "model" | "provider" | "request";

export interface AiFailureClassification {
  category: AiErrorCategory;
  scope: AiFailureScope;
  /** How long this model/provider should be skipped before it is tried again. 0 = no cooldown. */
  retryAfterMs: number;
  /** A short machine-readable reason for logs and the debug panel ("quota:per-day", "overloaded", …). */
  reason: string;
}

/** Everything a provider client knows about a failure, before interpretation. */
export interface ProviderFailureFacts {
  provider: AiProviderName;
  status?: number | null;
  message?: string | null;
  /** Provider error code/type when it sends one (`insufficient_quota`, `RESOURCE_EXHAUSTED`, …). */
  code?: string | null;
  /** Gemini's `errorDetails` — carries QuotaFailure / RetryInfo. */
  details?: unknown;
  /** The thrown error's constructor name, for SDK-specific timeout/connection classes. */
  errorName?: string | null;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Parses a Google `RetryInfo.retryDelay` ("37s", "1.5s") into milliseconds. */
function parseRetryDelay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return m ? Math.round(Number(m[1]) * SECOND) : null;
}

/**
 * Milliseconds until the next midnight in America/Los_Angeles — when Gemini's
 * free-tier per-day counters reset. Computed from the offset of *that* date,
 * so it stays right across daylight-saving changes without a timezone table.
 */
export function msUntilPacificMidnight(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const elapsed = (hour * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * SECOND;
  return Math.max(MINUTE, 24 * 3600 * SECOND - elapsed);
}

interface QuotaDetail {
  perDay: boolean;
  perMinute: boolean;
  retryDelayMs: number | null;
}

/** Reads Gemini's structured 429 details: which quota ran out, and when to come back. */
function readGoogleQuotaDetails(details: unknown): QuotaDetail {
  const out: QuotaDetail = { perDay: false, perMinute: false, retryDelayMs: null };
  if (!Array.isArray(details)) return out;
  for (const d of details as Record<string, unknown>[]) {
    const type = String(d?.["@type"] ?? "");
    if (type.endsWith("QuotaFailure") && Array.isArray(d.violations)) {
      for (const v of d.violations as Record<string, unknown>[]) {
        const id = `${String(v?.quotaId ?? "")} ${String(v?.quotaMetric ?? "")}`;
        if (/PerDay/i.test(id)) out.perDay = true;
        if (/PerMinute/i.test(id)) out.perMinute = true;
      }
    }
    if (type.endsWith("RetryInfo")) out.retryDelayMs = parseRetryDelay(d.retryDelay);
  }
  return out;
}

const TIMEOUT_NAMES = /Timeout|AbortError|GoogleGenerativeAIAbortError/i;
const CONNECTION_NAMES = /APIConnectionError|FetchError|TypeError/i;
const CONNECTION_MESSAGES = /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network/i;

/**
 * The one place a provider's raw failure becomes a category.
 *
 * Ordered from most specific to least: a 400 that says "credit balance is too
 * low" is a quota problem wearing a bad-request status, and has to be caught
 * before the generic 400 rule turns it into "your request was malformed" — the
 * exact misreading that sent this app's operators looking for a prompt bug
 * while the real problem was an empty balance.
 */
export function classifyProviderFailure(f: ProviderFailureFacts): AiFailureClassification {
  const status = f.status ?? null;
  const message = (f.message ?? "").toString();
  const code = (f.code ?? "").toString();
  const name = (f.errorName ?? "").toString();

  // ── no HTTP status: the request never got a proper answer ──────────────
  if (status === null || status === undefined || status === 0) {
    if (TIMEOUT_NAMES.test(name) || /timed? ?out|timeout|aborted/i.test(message)) {
      return { category: "MODEL_TIMEOUT", scope: "model", retryAfterMs: 30 * SECOND, reason: "timeout" };
    }
    if (CONNECTION_NAMES.test(name) || CONNECTION_MESSAGES.test(message)) {
      return { category: "MODEL_NETWORK_ERROR", scope: "provider", retryAfterMs: 15 * SECOND, reason: "connection" };
    }
    return { category: "MODEL_UNAVAILABLE", scope: "model", retryAfterMs: 30 * SECOND, reason: "no-status" };
  }

  // ── 429 first ───────────────────────────────────────────────────────────
  //
  // Before the balance rule below, and not by accident: Gemini's per-minute
  // limit answers "You exceeded your current quota, please check your plan and
  // billing details" — the word "billing" in a *rate limit*. Checked in the
  // other order, a busy minute would read as an empty account and take every
  // Gemini model out of rotation for a quarter of an hour.
  if (status === 429) {
    if (f.provider === "GEMINI") {
      const q = readGoogleQuotaDetails(f.details);
      if (q.perDay || /per ?day|daily/i.test(message)) {
        return {
          category: "MODEL_QUOTA_EXCEEDED",
          scope: "model",
          retryAfterMs: msUntilPacificMidnight(),
          reason: "quota:per-day",
        };
      }
      return {
        category: "MODEL_RATE_LIMITED",
        scope: "model",
        retryAfterMs: q.retryDelayMs ?? MINUTE,
        reason: q.perMinute ? "quota:per-minute" : "rate-limit",
      };
    }
    // OpenAI sends an empty account as a 429 with `insufficient_quota`.
    if (/insufficient_quota/i.test(code) || /insufficient[ _]quota|exceeded your current quota/i.test(message)) {
      return { category: "MODEL_QUOTA_EXCEEDED", scope: "provider", retryAfterMs: 15 * MINUTE, reason: "balance" };
    }
    return { category: "MODEL_RATE_LIMITED", scope: "model", retryAfterMs: 30 * SECOND, reason: "rate-limit" };
  }

  // ── balance / billing, whatever status it arrives with ─────────────────
  if (
    status === 402 ||
    /credit balance is too low|insufficient[ _]balance|insufficient[ _]quota|purchase credits|payment required/i.test(
      message,
    ) ||
    /insufficient_quota/i.test(code)
  ) {
    return { category: "MODEL_QUOTA_EXCEEDED", scope: "provider", retryAfterMs: 15 * MINUTE, reason: "balance" };
  }

  if (status === 401) {
    return { category: "MODEL_AUTH_FAILED", scope: "provider", retryAfterMs: 15 * MINUTE, reason: "unauthorized" };
  }
  if (status === 403) {
    // Gemini answers 403 both for a bad key and for "this key's project may
    // not use this model" — either way no call through this key will succeed
    // until someone changes the configuration.
    return { category: "MODEL_AUTH_FAILED", scope: "provider", retryAfterMs: 15 * MINUTE, reason: "forbidden" };
  }

  if (status === 404) {
    // A retired or misspelled model ID. Not transient: waiting will not bring
    // it back, so the cooldown is long and the admin page says so.
    return { category: "MODEL_UNAVAILABLE", scope: "model", retryAfterMs: 30 * MINUTE, reason: "model-not-found" };
  }

  if (status === 408) {
    return { category: "MODEL_TIMEOUT", scope: "model", retryAfterMs: 30 * SECOND, reason: "provider-timeout" };
  }

  if (status === 400 || status === 413 || status === 422) {
    // Gemini answers a bad key with 400 INVALID_ARGUMENT "API key not valid"
    // (reason API_KEY_INVALID), not a 401 — measured 2026-09-23 by the failure
    // drills. Read as a malformed request it would send an admin looking for a
    // prompt bug while the key sat broken.
    if (/api[ _]?key not valid|api_key_invalid|invalid api[ _]?key|api key expired/i.test(`${message} ${code}`)) {
      return { category: "MODEL_AUTH_FAILED", scope: "provider", retryAfterMs: 15 * MINUTE, reason: "invalid-key" };
    }
    if (/model.{0,40}(not found|does not exist|no longer available|not supported|is not available)/i.test(message)) {
      return { category: "MODEL_UNAVAILABLE", scope: "model", retryAfterMs: 30 * MINUTE, reason: "model-not-found" };
    }
    return { category: "MODEL_BAD_REQUEST", scope: "request", retryAfterMs: 0, reason: `http-${status}` };
  }

  if (status === 529 || status === 503 || status === 502 || status === 504 || status === 500) {
    return {
      category: "MODEL_UNAVAILABLE",
      scope: "model",
      retryAfterMs: status === 500 ? 20 * SECOND : 60 * SECOND,
      reason: status === 529 || /overload|high demand/i.test(message) ? "overloaded" : `http-${status}`,
    };
  }

  if (status >= 500) {
    return { category: "MODEL_UNAVAILABLE", scope: "model", retryAfterMs: 30 * SECOND, reason: `http-${status}` };
  }
  return { category: "MODEL_BAD_REQUEST", scope: "request", retryAfterMs: 0, reason: `http-${status}` };
}

/**
 * Should the router try another model after this?
 *
 * A refusal is the one deliberate "no": the provider read the content and
 * declined it, and shopping the same text around until some model agrees would
 * turn a safety decision into a lottery. Everything else is about *this* model
 * or *this* account, and a different one may well succeed.
 */
export function shouldFallback(category: AiErrorCategory): boolean {
  return category !== "MODEL_REFUSED";
}

/**
 * Worth one more attempt on the *same* model, immediately?
 *
 * Only for failures that are about the path rather than the model: a timeout or
 * a dropped connection is often gone on the next try. A 503 "high demand" or a
 * rate limit is not — hammering the same model again is how a busy model stays
 * busy — so those move straight to the next candidate instead.
 */
export function isRetryableSameModel(category: AiErrorCategory): boolean {
  return category === "MODEL_NETWORK_ERROR" || category === "MODEL_EMPTY_RESPONSE";
}

/**
 * What an ordinary member reads. Never the provider's own words: "400
 * INVALID_ARGUMENT" is a developer's sentence, and "credit balance is too low"
 * tells a member something about our billing they should never have to know.
 * The detailed reason stays in the server log and the dev-only debug trace.
 */
export function friendlyAiMessage(category: AiErrorCategory, subject: string = "AI"): string {
  switch (category) {
    case "MODEL_RATE_LIMITED":
    case "MODEL_UNAVAILABLE":
      return `${subject} par abhi bahut log hain — ek minute baad dobara try karein.`;
    case "MODEL_TIMEOUT":
    case "MODEL_NETWORK_ERROR":
      return "Jawab aane me zyada der lag gayi — dobara try karein.";
    case "MODEL_NOT_CONFIGURED":
    case "MODEL_AUTH_FAILED":
    case "MODEL_QUOTA_EXCEEDED":
      return `${subject} abhi thodi der ke liye available nahi hai — hum ise theek kar rahe hain.`;
    case "MODEL_REFUSED":
      return `Is sawaal par ${subject} madad nahi kar sakta.`;
    case "MODEL_UNSUPPORTED":
      return `Ye kaam abhi ${subject} ke configured model se nahi ho sakta.`;
    case "MODEL_BAD_REQUEST":
    case "MODEL_RESPONSE_PARSE_FAILED":
    case "MODEL_STREAM_FAILED":
    case "MODEL_EMPTY_RESPONSE":
    default:
      return `${subject} is request ko abhi process nahi kar paaya — thodi der baad dobara try karein.`;
  }
}

/**
 * The legacy six-way `AiErrorKind` every route still maps through `mapAiError`.
 * Kept so the fourteen existing call sites keep their HTTP status contract
 * while the router works in the precise vocabulary underneath.
 */
export function legacyKindFor(
  category: AiErrorCategory,
): "not_configured" | "rate_limited" | "auth_error" | "refusal" | "unsupported" | "upstream_error" {
  switch (category) {
    case "MODEL_NOT_CONFIGURED":
      return "not_configured";
    case "MODEL_AUTH_FAILED":
      return "auth_error";
    case "MODEL_RATE_LIMITED":
    case "MODEL_QUOTA_EXCEEDED":
      return "rate_limited";
    case "MODEL_REFUSED":
      return "refusal";
    case "MODEL_UNSUPPORTED":
      return "unsupported";
    default:
      return "upstream_error";
  }
}

/**
 * Strips anything key-shaped from a provider message before it is logged or
 * shown in a debug panel. Providers occasionally echo request fragments back;
 * a key that reaches a log line is a key that has leaked.
 */
export function redactProviderMessage(message: string): string {
  return message
    .replace(/(sk|AIza|key)[-_A-Za-z0-9]{12,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 400);
}
