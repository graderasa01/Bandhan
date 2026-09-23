import { prisma } from "@/lib/db/prisma";
import { getAiRoute } from "@/lib/ai/aiConfigService";
import { getProviderKey } from "@/lib/ai/credentials";
import type { AiFeatureKey, AiProviderName, AiRoute } from "@/lib/ai/models";
import { AI_PROVIDERS, type ModelRequirements } from "@/lib/ai/registry";
import {
  friendlyAiMessage,
  isRetryableSameModel,
  legacyKindFor,
  redactProviderMessage,
  shouldFallback,
  type AiErrorCategory,
  type AiOutcome,
} from "@/lib/ai/errors";
import { cooldownOf, lastSuccessAt, recordFailure, recordSuccess } from "@/lib/ai/health";
import { planRoute, type CandidateRole, type FallbackPolicy } from "@/lib/ai/routePlan";
import { fallbackPolicyFromEnv, narrowPolicy, providerOrderFromEnv } from "@/lib/ai/policy";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callOpenAi } from "@/lib/ai/providers/openai";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callDeepSeek } from "@/lib/ai/providers/deepseek";
import type { AiCallFailure, AiCallParams, AiCallResult, AiContentBlock, AiUsage } from "@/lib/ai/providers/types";

/**
 * The AI gateway: one call in, the best available model out — with the
 * reasons recorded.
 *
 * `callAi()` used to resolve one route and make one attempt. When that model
 * was busy (Gemini's `503 … high demand`) or its account was empty
 * (DeepSeek's `402`, Anthropic's "credit balance is too low"), the member got
 * "Jawab nahi ban paaya" and nobody could tell from the outside which of four
 * very different things had happened. This file is the difference:
 *
 *   • **It tries more than one model**, in the order `routePlan.ts` works out:
 *     the admin's choice, then another model on the same account, then —
 *     when the policy allows — another provider that can take the call.
 *   • **It remembers what just failed** (lib/ai/health.ts), so the next
 *     member does not wait two seconds to re-learn that a model is down.
 *   • **It names every outcome** (lib/ai/errors.ts) and returns the full trace,
 *     so a developer can see "gemini-3.8-flash 503 (overloaded) 2.3s →
 *     gemini-3.6-flash 200 1.4s" instead of a single vague failure.
 *   • **It never hands a member a provider's own words.** A failed result's
 *     `message` is the friendly sentence for its category; the provider's text
 *     travels in `detail` for logs.
 *
 * ## Fallback policy
 *
 * `AI_FALLBACK_POLICY` — `cross-provider` (default), `same-provider`, or
 * `off`. Cross-provider fallback moves spend between accounts (a Gemini
 * free-tier call becoming a paid DeepSeek one), which is why it is a switch.
 * `AI_FALLBACK_PROVIDERS` sets the order, and doubles as an allow-list.
 */

export interface AiAttemptTrace {
  provider: AiProviderName;
  model: string;
  role: CandidateRole;
  outcome: AiOutcome;
  httpStatus: number | null;
  reason: string | null;
  latencyMs: number;
  /** Set when this attempt repeated the previous one on the same model. */
  retry: boolean;
  /** Redacted provider text for a failure — dev-only surfaces show it, members never do. */
  detail: string | null;
}

export interface AiRouteTrace {
  feature: AiFeatureKey;
  logFeature: string;
  primary: AiRoute;
  override: AiRoute | null;
  policy: FallbackPolicy;
  answeredBy: AiRoute | null;
  fallbackUsed: boolean;
  attempts: AiAttemptTrace[];
  skipped: { provider: AiProviderName; model: string; reason: string }[];
  finalOutcome: AiOutcome;
  totalLatencyMs: number;
  /** Rough prompt size, for the debug panel's "context size" line. */
  approxInputTokens: number;
}

export type RoutedAiResult = (
  | { ok: true; text: string; usage: AiUsage; finishReason?: string | null }
  | (Omit<AiCallFailure, "message"> & {
      /** Member-safe sentence for this category — see `friendlyAiMessage`. */
      message: string;
      /** The provider's own (redacted) text from the last attempt, for logs. */
      detail: string;
    })
) & { route: AiRoute; trace: AiRouteTrace };

export interface RoutedCallParams {
  configFeature: AiFeatureKey;
  logFeature: string;
  userId: string | null;
  system: string;
  content: string | AiContentBlock[];
  maxTokens: number;
  thinking?: "off";
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
  /**
   * Force one model and skip fallback — the dev debug panel's model picker.
   * Callers must only pass this outside production; the router trusts them.
   */
  override?: AiRoute | null;
  /** Narrow this call's fallback below the global policy (never widen it). */
  fallback?: FallbackPolicy;
  /** Per-attempt ceiling; defaults per feature (see FEATURE_BUDGETS). */
  timeoutMs?: number;
  /** Whole-call ceiling across every attempt. */
  deadlineMs?: number;
  /** Who the failure sentence is about — "Grio" on Grio surfaces, "AI" elsewhere. */
  subject?: string;
}

type ProviderCall = (params: AiCallParams) => Promise<AiCallResult>;

export interface RouterDeps {
  callProvider: (provider: AiProviderName, params: AiCallParams) => Promise<AiCallResult>;
  getRoute: (feature: AiFeatureKey) => Promise<AiRoute>;
  isConfigured: (provider: AiProviderName) => Promise<boolean>;
  logInteraction: (row: {
    userId: string | null;
    feature: string;
    provider: AiProviderName;
    model: string;
    usage: AiUsage;
    refused: boolean;
    refusalMessage: string | null;
  }) => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  env: (name: string) => string | undefined;
}

const CLIENTS: Record<AiProviderName, ProviderCall> = {
  ANTHROPIC: callAnthropic,
  OPENAI: callOpenAi,
  GEMINI: callGemini,
  DEEPSEEK: callDeepSeek,
};

const defaultDeps: RouterDeps = {
  callProvider: (provider, params) => CLIENTS[provider](params),
  getRoute: getAiRoute,
  isConfigured: async (provider) => Boolean(await getProviderKey(provider)),
  logInteraction: async (row) => {
    try {
      await prisma.aiInteraction.create({
        data: {
          userId: row.userId,
          feature: row.feature,
          modelId: row.model,
          provider: row.provider,
          inputTokens: row.usage.inputTokens,
          outputTokens: row.usage.outputTokens,
          wasBlocked: row.refused,
          blockReason: row.refused ? row.refusalMessage : null,
        },
      });
    } catch (err) {
      // A logging failure must never take down the actual AI response.
      console.error("[ai:log] aiInteraction write failed:", err instanceof Error ? err.message : String(err));
    }
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  env: (name) => process.env[name],
};

/**
 * How long one attempt, and the whole call, may take — by what the feature is.
 *
 * Interactive calls (a member is watching a spinner) get room for a fallback
 * inside a minute; the per-card reel explanation is bounded tightly because
 * fifteen of them run at once inside a page load; the long structured calls
 * keep the headroom they have always needed.
 */
const FEATURE_BUDGETS: Record<AiFeatureKey, { attemptMs: number; deadlineMs: number }> = {
  rishtaConcierge: { attemptMs: 40_000, deadlineMs: 65_000 },
  matchExplain: { attemptMs: 40_000, deadlineMs: 65_000 },
  askProfile: { attemptMs: 25_000, deadlineMs: 40_000 },
  icebreaker: { attemptMs: 25_000, deadlineMs: 40_000 },
  questionRewrite: { attemptMs: 20_000, deadlineMs: 30_000 },
  contentModeration: { attemptMs: 20_000, deadlineMs: 30_000 },
  questionTranslation: { attemptMs: 20_000, deadlineMs: 30_000 },
  discoveryIntentParsing: { attemptMs: 20_000, deadlineMs: 30_000 },
  matchExplanation: { attemptMs: 20_000, deadlineMs: 30_000 },
  bioWriter: { attemptMs: 60_000, deadlineMs: 100_000 },
  deepProfileAnalysis: { attemptMs: 60_000, deadlineMs: 100_000 },
  kundliInterpretation: { attemptMs: 60_000, deadlineMs: 100_000 },
  extraction: { attemptMs: 90_000, deadlineMs: 150_000 },
  biodataExtraction: { attemptMs: 90_000, deadlineMs: 150_000 },
  marketingManager: { attemptMs: 600_000, deadlineMs: 900_000 },
  photoUltraEnhance: { attemptMs: 90_000, deadlineMs: 120_000 },
};

function hasVision(content: string | AiContentBlock[]): boolean {
  return typeof content !== "string" && content.some((b) => b.type !== "text");
}

function approxTokens(system: string, content: string | AiContentBlock[]): number {
  const text = typeof content === "string" ? content : content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  // ~4 characters per token for English, fewer for Hinglish — a size signal
  // for the debug panel and a guard against absurd prompts, not a bill.
  return Math.ceil((system.length + text.length) / 3.5);
}

/**
 * For a schema call: does the reply actually parse? A model that wraps its
 * JSON in a ```json fence is unwrapped (every caller runs `JSON.parse` on the
 * raw text); one whose reply still does not parse is a failed attempt, which
 * the next model may well get right.
 */
function normaliseJson(text: string): string | null {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    if (fenced) {
      try {
        JSON.parse(fenced[1]);
        return fenced[1];
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function routeAiCall(params: RoutedCallParams, deps: RouterDeps = defaultDeps): Promise<RoutedAiResult> {
  const started = deps.now();
  const budget = FEATURE_BUDGETS[params.configFeature] ?? { attemptMs: 60_000, deadlineMs: 100_000 };
  const attemptMs = params.timeoutMs ?? budget.attemptMs;
  const deadline = started + (params.deadlineMs ?? budget.deadlineMs);
  const policy = narrowPolicy(fallbackPolicyFromEnv(deps.env), params.fallback);

  const primary = await deps.getRoute(params.configFeature);
  const configuredEntries = await Promise.all(AI_PROVIDERS.map(async (p) => [p, await deps.isConfigured(p)] as const));
  const configured = Object.fromEntries(configuredEntries) as Record<AiProviderName, boolean>;

  const requirements: ModelRequirements = {
    vision: hasVision(params.content),
    jsonSchema: Boolean(params.jsonSchema),
    approxInputTokens: approxTokens(params.system, params.content),
  };

  const plan = planRoute({
    feature: params.configFeature,
    primary,
    requirements,
    configured,
    policy,
    providerOrder: providerOrderFromEnv(deps.env),
    cooldown: cooldownOf,
    lastSuccessAt,
    now: started,
    override: params.override ?? null,
  });

  const trace: AiRouteTrace = {
    feature: params.configFeature,
    logFeature: params.logFeature,
    primary,
    override: params.override ?? null,
    policy,
    answeredBy: null,
    fallbackUsed: false,
    attempts: [],
    skipped: plan.skipped,
    finalOutcome: "MODEL_NOT_CONFIGURED",
    totalLatencyMs: 0,
    approxInputTokens: requirements.approxInputTokens ?? 0,
  };

  let last: AiCallFailure | null = null;
  const subject = params.subject ?? "AI";
  /**
   * Providers whose *account* failed during this call — a rejected key, an
   * empty balance. Every other model behind the same key will fail the same
   * way, so the rest of that provider's candidates are skipped rather than
   * each spending a round trip to prove it.
   */
  const deadProviders = new Set<AiProviderName>();

  for (const candidate of plan.attempts) {
    if (deadProviders.has(candidate.provider)) {
      trace.skipped.push({ provider: candidate.provider, model: candidate.model, reason: "account failed earlier in this call" });
      continue;
    }
    let retried = false;
    // At most two passes on one model: the attempt, and one immediate retry
    // for a failure that is about the path rather than the model.
    for (let pass = 0; pass < 2; pass++) {
      const remaining = deadline - deps.now();
      if (remaining < 1_500) break;

      const t0 = deps.now();
      const result = await deps.callProvider(candidate.provider, {
        model: candidate.model,
        system: params.system,
        content: params.content,
        maxTokens: params.maxTokens,
        thinking: params.thinking,
        jsonSchema: params.jsonSchema,
        schemaName: params.schemaName,
        timeoutMs: Math.min(attemptMs, remaining),
      });
      const latencyMs = deps.now() - t0;

      // A schema call that "succeeded" with text that does not parse is a
      // failed attempt — named here, where the next model can still fix it,
      // rather than as a SyntaxError far away inside the caller.
      let outcome: AiCallResult = result;
      if (result.ok && params.jsonSchema) {
        const json = normaliseJson(result.text);
        outcome =
          json === null
            ? {
                ok: false,
                kind: legacyKindFor("MODEL_RESPONSE_PARSE_FAILED"),
                category: "MODEL_RESPONSE_PARSE_FAILED",
                message: `Reply did not parse as JSON: ${redactProviderMessage(result.text.slice(0, 160))}`,
                reason: `finish:${result.finishReason ?? "unknown"}`,
                scope: "request",
                retryAfterMs: 0,
                usage: result.usage,
              }
            : { ...result, text: json };
      }

      const usage = outcome.ok ? outcome.usage : outcome.usage;
      if (usage) {
        await deps.logInteraction({
          userId: params.userId,
          feature: params.logFeature,
          provider: candidate.provider,
          model: candidate.model,
          usage,
          refused: !outcome.ok && outcome.category === "MODEL_REFUSED",
          refusalMessage: !outcome.ok ? outcome.message : null,
        });
      }

      if (outcome.ok) {
        recordSuccess(candidate.provider, candidate.model, latencyMs, "live");
        trace.attempts.push({
          provider: candidate.provider,
          model: candidate.model,
          role: candidate.role,
          outcome: "MODEL_SUCCESS",
          httpStatus: 200,
          reason: null,
          latencyMs,
          retry: retried,
          detail: null,
        });
        trace.answeredBy = { provider: candidate.provider, model: candidate.model };
        trace.fallbackUsed = candidate.role !== "primary" && candidate.role !== "override";
        trace.finalOutcome = "MODEL_SUCCESS";
        trace.totalLatencyMs = deps.now() - started;
        if (trace.fallbackUsed || trace.attempts.length > 1) {
          console.warn(
            `[ai:router] ${params.configFeature} answered by ${candidate.provider}:${candidate.model} after ` +
              trace.attempts
                .slice(0, -1)
                .map((a) => `${a.provider}:${a.model} ${a.outcome}${a.httpStatus ? ` ${a.httpStatus}` : ""}`)
                .join(" → ") +
              ` (${trace.totalLatencyMs}ms)`,
          );
        }
        return {
          ok: true,
          text: outcome.text,
          usage: outcome.usage,
          finishReason: outcome.finishReason ?? null,
          route: { provider: candidate.provider, model: candidate.model },
          trace,
        };
      }

      recordFailure(
        candidate.provider,
        candidate.model,
        {
          category: outcome.category,
          scope: outcome.scope ?? "request",
          retryAfterMs: outcome.retryAfterMs ?? 0,
          reason: outcome.reason ?? outcome.category,
        },
        { httpStatus: outcome.httpStatus ?? null, message: outcome.message, latencyMs, source: "live" },
      );
      trace.attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        role: candidate.role,
        outcome: outcome.category,
        httpStatus: outcome.httpStatus ?? null,
        reason: outcome.reason ?? null,
        latencyMs,
        retry: retried,
        detail: outcome.message,
      });
      console.error(
        `[ai:router] ${params.configFeature} ${candidate.role} ${candidate.provider}:${candidate.model} → ${outcome.category}` +
          `${outcome.httpStatus ? ` (HTTP ${outcome.httpStatus})` : ""}${outcome.reason ? ` [${outcome.reason}]` : ""} ${latencyMs}ms: ${outcome.message}`,
      );
      last = outcome;
      if (outcome.scope === "provider") deadProviders.add(candidate.provider);

      if (!shouldFallback(outcome.category)) {
        return finalFailure(outcome, trace, started, deps, subject);
      }
      if (pass === 0 && isRetryableSameModel(outcome.category)) {
        retried = true;
        await deps.sleep(300);
        continue;
      }
      break;
    }
  }

  if (!last) {
    // Nothing was attempted: no configured provider could take this call.
    const nothing: AiCallFailure = {
      ok: false,
      kind: legacyKindFor("MODEL_NOT_CONFIGURED"),
      category: "MODEL_NOT_CONFIGURED",
      message: `Koi bhi configured model is call ke liye available nahi tha (${plan.skipped.map((s) => `${s.provider}:${s.model} ${s.reason}`).join("; ") || "no candidates"}).`,
      reason: "no-candidate",
      scope: "provider",
    };
    console.error(`[ai:router] ${params.configFeature}: ${nothing.message}`);
    return finalFailure(nothing, trace, started, deps, subject);
  }
  return finalFailure(last, trace, started, deps, subject);
}

function finalFailure(
  failure: AiCallFailure,
  trace: AiRouteTrace,
  started: number,
  deps: RouterDeps,
  subject: string,
): RoutedAiResult {
  trace.finalOutcome = failure.category;
  trace.totalLatencyMs = deps.now() - started;
  const lastAttempt = trace.attempts[trace.attempts.length - 1];
  const category: AiErrorCategory = failure.category;
  return {
    ...failure,
    kind: legacyKindFor(category),
    message: friendlyAiMessage(category, subject),
    detail: failure.message,
    route: lastAttempt ? { provider: lastAttempt.provider, model: lastAttempt.model } : trace.primary,
    trace,
  };
}
