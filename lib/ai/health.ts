import type { AiProviderName } from "@/lib/ai/models";
import type { AiErrorCategory, AiFailureClassification, AiOutcome } from "@/lib/ai/errors";

/**
 * What the app currently knows about each model's health — learned from real
 * calls, not assumed.
 *
 * ## Why in memory
 *
 * The state that matters here is minutes old: "gemini-3.8-flash answered 503
 * forty seconds ago", "the DeepSeek balance ran out". Persisting it would add a
 * write to every AI call to record something that is stale by the time anyone
 * reads it from another process. Each server process learns for itself, from
 * its own traffic and from explicit probes, and a restart simply begins at
 * "not checked yet" — the one state this module is always honest about.
 *
 * ## What it is for
 *
 *  1. **The router skips a model it has just watched fail.** Without this, a
 *     model answering 503 for ten minutes costs every request two seconds of
 *     waiting for the same 503 before the fallback runs.
 *  2. **Screens stop claiming what nobody verified.** The admin page shows
 *     "Available" only after a real call succeeded, "Usage limit reached" only
 *     after a real quota answer — never a green dot for a key that merely
 *     exists.
 *
 * Pure TypeScript with an injectable clock, so the check script can walk the
 * whole state machine without a provider or a timer.
 */

export type ModelAvailability =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "USAGE_LIMIT"
  | "AUTH_FAILED"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

/** The words a screen shows. Kept here so the admin page and the debug panel cannot disagree. */
export const AVAILABILITY_LABEL: Record<ModelAvailability, string> = {
  AVAILABLE: "Available",
  UNAVAILABLE: "Currently unavailable",
  USAGE_LIMIT: "Usage limit reached",
  AUTH_FAILED: "Key rejected",
  NOT_CONFIGURED: "Not configured",
  UNKNOWN: "Not checked yet",
};

export interface ModelHealthEntry {
  provider: AiProviderName;
  model: string;
  lastOutcome: AiOutcome | null;
  lastReason: string | null;
  lastHttpStatus: number | null;
  /** Redacted provider text — for the admin page and logs, never for members. */
  lastMessage: string | null;
  lastLatencyMs: number | null;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  /** Skip this model until then. 0 = not cooling down. */
  cooldownUntil: number;
  consecutiveFailures: number;
  /** Whether the last observation came from a member's real call or an explicit probe. */
  source: "live" | "probe" | null;
  /** Whether the last failure was about the account (balance, key) rather than this model. */
  lastScope: "model" | "provider" | "request" | null;
}

interface ProviderHealthEntry {
  category: AiErrorCategory;
  reason: string;
  since: number;
  cooldownUntil: number;
  message: string | null;
}

type Clock = () => number;

let now: Clock = () => Date.now();

/**
 * Kept on `globalThis`, the same way `lib/db/prisma.ts` keeps its client: Next
 * compiles route handlers and server components into separate module graphs,
 * so a plain module-level Map would give /api/concierge one memory and the
 * /admin/ai-settings page another — and the admin page would show "Not
 * checked yet" for a model the chat had watched fail a minute earlier.
 */
const store = globalThis as unknown as {
  __btAiModelHealth?: Map<string, ModelHealthEntry>;
  __btAiProviderHealth?: Map<AiProviderName, ProviderHealthEntry>;
};
const models = (store.__btAiModelHealth ??= new Map<string, ModelHealthEntry>());
const providers = (store.__btAiProviderHealth ??= new Map<AiProviderName, ProviderHealthEntry>());

const keyOf = (provider: AiProviderName, model: string) => `${provider}:${model}`;

function entry(provider: AiProviderName, model: string): ModelHealthEntry {
  const key = keyOf(provider, model);
  let e = models.get(key);
  if (!e) {
    e = {
      provider,
      model,
      lastOutcome: null,
      lastReason: null,
      lastHttpStatus: null,
      lastMessage: null,
      lastLatencyMs: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      cooldownUntil: 0,
      consecutiveFailures: 0,
      source: null,
      lastScope: null,
    };
    models.set(key, e);
  }
  return e;
}

/**
 * A model answered. Clears its cooldown *and* any provider-wide one: a real
 * answer through this key is the strongest evidence there is that the account
 * works again (a topped-up balance, a rotated key).
 */
export function recordSuccess(
  provider: AiProviderName,
  model: string,
  latencyMs: number,
  source: "live" | "probe" = "live",
) {
  const e = entry(provider, model);
  const t = now();
  e.lastOutcome = "MODEL_SUCCESS";
  e.lastReason = null;
  e.lastHttpStatus = 200;
  e.lastMessage = null;
  e.lastLatencyMs = latencyMs;
  e.lastCheckedAt = t;
  e.lastSuccessAt = t;
  e.cooldownUntil = 0;
  e.consecutiveFailures = 0;
  e.source = source;
  e.lastScope = null;
  providers.delete(provider);
  // Siblings that failed only because the *account* did (empty balance,
  // rejected key) are cleared too: the account just answered, so their
  // failure no longer describes them. Their own model-level failures (a 503,
  // a retired ID) are left alone — those are about the model, not the key.
  for (const other of models.values()) {
    if (other.provider === provider && other !== e && other.lastScope === "provider") {
      other.cooldownUntil = 0;
      other.lastOutcome = null;
      other.lastReason = null;
      other.lastMessage = null;
      other.consecutiveFailures = 0;
      other.lastScope = null;
    }
  }
}

/**
 * A model failed. Request-scoped failures (a malformed request) say nothing
 * about the model and do not cool it down — the next, different request may be
 * fine. Content-level outcomes (a refusal, an empty or unparsable reply) prove
 * the model is *reachable*, so they count as reachability for the availability
 * label even though the call failed.
 */
export function recordFailure(
  provider: AiProviderName,
  model: string,
  failure: AiFailureClassification,
  facts: { httpStatus?: number | null; message?: string | null; latencyMs?: number | null; source?: "live" | "probe" },
) {
  const e = entry(provider, model);
  const t = now();
  e.lastOutcome = failure.category;
  e.lastReason = failure.reason;
  e.lastHttpStatus = facts.httpStatus ?? null;
  e.lastMessage = facts.message ?? null;
  e.lastLatencyMs = facts.latencyMs ?? null;
  e.lastCheckedAt = t;
  e.lastFailureAt = t;
  e.source = facts.source ?? "live";
  e.lastScope = failure.scope;

  if (failure.scope === "request" || failure.retryAfterMs <= 0) return;

  if (failure.scope === "provider") {
    // The account is the problem, so the cooldown lives on the provider —
    // one place, cleared by the first success through the same key.
    providers.set(provider, {
      category: failure.category,
      reason: failure.reason,
      since: t,
      cooldownUntil: t + failure.retryAfterMs,
      message: facts.message ?? null,
    });
    return;
  }

  e.consecutiveFailures += 1;
  // Repeated transient failures back off, capped so a model that recovers is
  // noticed within minutes rather than hours. Quota/auth cooldowns are already
  // long and exact, so they are not multiplied.
  const transient = failure.category === "MODEL_UNAVAILABLE" || failure.category === "MODEL_TIMEOUT" || failure.category === "MODEL_NETWORK_ERROR";
  const factor = transient ? Math.min(4, 2 ** (e.consecutiveFailures - 1)) : 1;
  const wait = Math.min(failure.retryAfterMs * factor, transient ? 5 * 60_000 : failure.retryAfterMs);
  e.cooldownUntil = Math.max(e.cooldownUntil, t + wait);
}

/** Outcomes that prove the model answered, even though the call itself did not succeed. */
const REACHABLE_FAILURES: ReadonlySet<AiOutcome> = new Set([
  "MODEL_REFUSED",
  "MODEL_EMPTY_RESPONSE",
  "MODEL_RESPONSE_PARSE_FAILED",
  "MODEL_BAD_REQUEST",
]);

export interface CooldownState {
  cooling: boolean;
  until: number;
  category: AiErrorCategory | null;
  reason: string | null;
}

/** Should the router skip this model right now? Provider-wide trouble counts too. */
export function cooldownOf(provider: AiProviderName, model: string): CooldownState {
  const t = now();
  const p = providers.get(provider);
  if (p && p.cooldownUntil > t) {
    return { cooling: true, until: p.cooldownUntil, category: p.category, reason: p.reason };
  }
  const e = models.get(keyOf(provider, model));
  if (e && e.cooldownUntil > t) {
    return {
      cooling: true,
      until: e.cooldownUntil,
      category: (e.lastOutcome !== "MODEL_SUCCESS" ? e.lastOutcome : null) as AiErrorCategory | null,
      reason: e.lastReason,
    };
  }
  return { cooling: false, until: 0, category: null, reason: null };
}

/** Recent success, as a router tiebreaker: a model that just worked is the best guess for the next call. */
export function lastSuccessAt(provider: AiProviderName, model: string): number | null {
  return models.get(keyOf(provider, model))?.lastSuccessAt ?? null;
}

export interface AvailabilityView {
  provider: AiProviderName;
  model: string;
  state: ModelAvailability;
  label: string;
  /** True when the state is a *last known* observation whose cooldown has passed — "was unavailable, not rechecked". */
  stale: boolean;
  lastCheckedAt: number | null;
  lastLatencyMs: number | null;
  lastOutcome: AiOutcome | null;
  lastReason: string | null;
  lastHttpStatus: number | null;
  lastMessage: string | null;
  cooldownUntil: number;
  source: "live" | "probe" | null;
}

function stateForCategory(category: AiOutcome | null): ModelAvailability {
  if (category === null) return "UNKNOWN";
  if (category === "MODEL_SUCCESS" || REACHABLE_FAILURES.has(category)) return "AVAILABLE";
  if (category === "MODEL_QUOTA_EXCEEDED" || category === "MODEL_RATE_LIMITED") return "USAGE_LIMIT";
  if (category === "MODEL_AUTH_FAILED") return "AUTH_FAILED";
  if (category === "MODEL_NOT_CONFIGURED") return "NOT_CONFIGURED";
  return "UNAVAILABLE";
}

/**
 * The truthful one-word answer for a screen.
 *
 * `configured` is passed in rather than looked up because the key lookup is
 * async and server-only; the caller already has it. No key means
 * NOT_CONFIGURED regardless of history — an old success does not make a
 * deleted key work.
 */
export function availabilityOf(provider: AiProviderName, model: string, configured: boolean): AvailabilityView {
  const t = now();
  const e = models.get(keyOf(provider, model)) ?? null;
  const p = providers.get(provider) ?? null;

  const base = {
    provider,
    model,
    lastCheckedAt: e?.lastCheckedAt ?? null,
    lastLatencyMs: e?.lastLatencyMs ?? null,
    lastOutcome: e?.lastOutcome ?? null,
    lastReason: e?.lastReason ?? null,
    lastHttpStatus: e?.lastHttpStatus ?? null,
    lastMessage: e?.lastMessage ?? p?.message ?? null,
    cooldownUntil: Math.max(e?.cooldownUntil ?? 0, p?.cooldownUntil ?? 0),
    source: e?.source ?? null,
  };

  if (!configured) {
    return { ...base, state: "NOT_CONFIGURED", label: AVAILABILITY_LABEL.NOT_CONFIGURED, stale: false };
  }

  // A provider-wide failure newer than this model's last success outranks it:
  // the account is out of credit even if this particular model answered an
  // hour ago.
  if (p && (!e?.lastSuccessAt || p.since > e.lastSuccessAt)) {
    const state = stateForCategory(p.category);
    return { ...base, state, label: AVAILABILITY_LABEL[state], stale: p.cooldownUntil <= t };
  }

  const state = stateForCategory(e?.lastOutcome ?? null);
  const stale = state !== "AVAILABLE" && state !== "UNKNOWN" && (e?.cooldownUntil ?? 0) <= t;
  return { ...base, state, label: AVAILABILITY_LABEL[state], stale };
}

/**
 * Forget what this process believes about one provider's account.
 *
 * Called when an admin saves or clears that provider's key: a 401 learned
 * against the old key says nothing about the new one, and without this the
 * router would keep skipping a freshly fixed provider until its fifteen-minute
 * auth cooldown ran out. Model-level observations (a 503 on one model) are
 * about the model, not the key, and are left alone.
 */
export function clearProviderHealth(provider: AiProviderName) {
  providers.delete(provider);
  for (const e of models.values()) {
    if (e.provider === provider && e.lastScope === "provider") {
      e.cooldownUntil = 0;
      e.lastOutcome = null;
      e.lastReason = null;
      e.lastMessage = null;
      e.consecutiveFailures = 0;
      e.lastScope = null;
    }
  }
}

/** Every model this process has an observation for — the debug panel's raw view. */
export function healthSnapshot(): ModelHealthEntry[] {
  return [...models.values()].map((e) => ({ ...e }));
}

/** Test seams. */
export function __setHealthClock(clock: Clock) {
  now = clock;
}
export function __resetHealth() {
  models.clear();
  providers.clear();
  now = () => Date.now();
}
