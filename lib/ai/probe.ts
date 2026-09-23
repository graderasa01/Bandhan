import "server-only";
import { getAllAiRoutes } from "@/lib/ai/aiConfigService";
import { getProviderKey } from "@/lib/ai/credentials";
import type { AiFeatureKey, AiProviderName, AiRoute } from "@/lib/ai/models";
import { AI_FEATURE_LABELS, AI_IMAGE_EDIT_FEATURES, AI_VISION_FEATURES } from "@/lib/ai/models";
import { AI_PROVIDERS, MODEL_REGISTRY, registeredModel, type RegisteredModel } from "@/lib/ai/registry";
import { availabilityOf, cooldownOf, lastSuccessAt, recordFailure, recordSuccess, type AvailabilityView } from "@/lib/ai/health";
import { classifyProviderFailure, redactProviderMessage, type AiOutcome } from "@/lib/ai/errors";
import { planRoute, type FallbackPolicy } from "@/lib/ai/routePlan";
import { fallbackPolicyFromEnv, providerOrderFromEnv } from "@/lib/ai/policy";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callOpenAi } from "@/lib/ai/providers/openai";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callDeepSeek } from "@/lib/ai/providers/deepseek";
import type { AiCallParams, AiCallResult } from "@/lib/ai/providers/types";

/**
 * Asking a model directly whether it works — the only honest source for an
 * "Available" label.
 *
 * A key being present proves nothing (this deployment has had a present,
 * valid Anthropic key with no credit behind it for weeks), and a model being
 * listed proves nothing either (Gemini's model list kept advertising 2.5 Flash
 * after it had started answering 404). So a probe is one real, tiny call —
 * sixteen tokens, reasoning off — through the *same* client the app uses, and
 * its result goes into the same health registry the router reads.
 *
 * Cost, stated because the admin button spends it: a fraction of a paisa per
 * paid model, and on Gemini's free tier one request out of that model's daily
 * allowance (20/day per model on this key). "Check all" is ~10 calls.
 */

const CLIENTS: Record<AiProviderName, (p: AiCallParams) => Promise<AiCallResult>> = {
  ANTHROPIC: callAnthropic,
  OPENAI: callOpenAi,
  GEMINI: callGemini,
  DEEPSEEK: callDeepSeek,
};

export interface ProbeResult {
  provider: AiProviderName;
  model: string;
  outcome: AiOutcome;
  httpStatus: number | null;
  latencyMs: number | null;
  reason: string | null;
  /** Redacted provider text — admin eyes only. */
  detail: string | null;
  availability: AvailabilityView;
}

async function isConfigured(provider: AiProviderName): Promise<boolean> {
  return Boolean(await getProviderKey(provider));
}

export interface DeepSeekBalance {
  available: boolean;
  /** e.g. "0.56 USD" — the provider's own figure. */
  balance: string | null;
}

/**
 * DeepSeek publishes its account balance on a free endpoint, which makes it
 * the one provider here whose "usage limit reached" can be known without
 * spending anything. Null when the key is missing or the call fails.
 */
export async function getDeepSeekBalance(): Promise<DeepSeekBalance | null> {
  const key = await getProviderKey("DEEPSEEK");
  if (!key) return null;
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency?: string; total_balance?: string }[];
    };
    const info = json.balance_infos?.[0];
    return {
      available: Boolean(json.is_available),
      balance: info?.total_balance ? `${info.total_balance} ${info.currency ?? ""}`.trim() : null,
    };
  } catch {
    return null;
  }
}

export async function probeModel(provider: AiProviderName, model: string): Promise<ProbeResult> {
  if (!(await isConfigured(provider))) {
    return {
      provider,
      model,
      outcome: "MODEL_NOT_CONFIGURED",
      httpStatus: null,
      latencyMs: null,
      reason: "no-key",
      detail: null,
      availability: availabilityOf(provider, model, false),
    };
  }

  // DeepSeek: an empty account is known for free, before spending a completion.
  if (provider === "DEEPSEEK") {
    const balance = await getDeepSeekBalance();
    if (balance && !balance.available) {
      const failure = classifyProviderFailure({ provider, status: 402, message: "Insufficient Balance (balance endpoint)" });
      recordFailure(provider, model, failure, { httpStatus: 402, message: `Balance: ${balance.balance ?? "0"}`, source: "probe" });
      return {
        provider,
        model,
        outcome: failure.category,
        httpStatus: 402,
        latencyMs: null,
        reason: failure.reason,
        detail: `Balance: ${balance.balance ?? "0"}`,
        availability: availabilityOf(provider, model, true),
      };
    }
  }

  const t0 = Date.now();
  const result = await CLIENTS[provider]({
    model,
    system: "Reply with the single word: ok",
    content: "ok",
    maxTokens: 16,
    thinking: "off",
    timeoutMs: 20_000,
  });
  const latencyMs = Date.now() - t0;

  if (result.ok) {
    recordSuccess(provider, model, latencyMs, "probe");
    return {
      provider,
      model,
      outcome: "MODEL_SUCCESS",
      httpStatus: 200,
      latencyMs,
      reason: null,
      detail: null,
      availability: availabilityOf(provider, model, true),
    };
  }

  recordFailure(
    provider,
    model,
    { category: result.category, scope: result.scope ?? "request", retryAfterMs: result.retryAfterMs ?? 0, reason: result.reason ?? result.category },
    { httpStatus: result.httpStatus ?? null, message: result.message, latencyMs, source: "probe" },
  );
  return {
    provider,
    model,
    outcome: result.category,
    httpStatus: result.httpStatus ?? null,
    latencyMs,
    reason: result.reason ?? null,
    detail: redactProviderMessage(result.message),
    availability: availabilityOf(provider, model, true),
  };
}

/** Every registered chat model, or one provider's. Providers run in parallel, models within one in sequence. */
export async function probeAll(only?: AiProviderName): Promise<ProbeResult[]> {
  const providers = only ? [only] : [...AI_PROVIDERS];
  const perProvider = await Promise.all(
    providers.map(async (provider) => {
      const out: ProbeResult[] = [];
      for (const m of MODEL_REGISTRY.filter((r) => r.provider === provider)) {
        out.push(await probeModel(provider, m.id));
      }
      return out;
    }),
  );
  return perProvider.flat();
}

/* ------------------------------------------------------------------ */
/* The admin overview                                                   */
/* ------------------------------------------------------------------ */

export interface ModelStatusRow {
  model: RegisteredModel;
  availability: AvailabilityView;
}

export interface FeatureRouteStatus {
  feature: AiFeatureKey;
  label: string;
  route: AiRoute;
  availability: AvailabilityView | null;
  /** What the router would try right now if this feature were called — computed, not stored. */
  chain: { provider: AiProviderName; model: string; role: string }[];
  skipped: { provider: AiProviderName; model: string; reason: string }[];
}

export interface AiHealthOverview {
  policy: FallbackPolicy;
  providerOrder: AiProviderName[];
  configured: Record<AiProviderName, boolean>;
  models: ModelStatusRow[];
  features: FeatureRouteStatus[];
  deepseekBalance: DeepSeekBalance | null;
  generatedAt: number;
}

/**
 * Everything /admin/ai-settings needs to tell the truth: each model's last
 * observed state, each feature's route with the fallback chain the router
 * would actually take right now, the policy in force, and DeepSeek's balance.
 * Reads memory and the route table only — it never calls a model.
 */
export async function getAiHealthOverview(): Promise<AiHealthOverview> {
  const configuredEntries = await Promise.all(AI_PROVIDERS.map(async (p) => [p, await isConfigured(p)] as const));
  const configured = Object.fromEntries(configuredEntries) as Record<AiProviderName, boolean>;
  const env = (name: string) => process.env[name];
  const policy = fallbackPolicyFromEnv(env);
  const providerOrder = providerOrderFromEnv(env);
  const now = Date.now();

  const models: ModelStatusRow[] = MODEL_REGISTRY.map((m) => ({
    model: m,
    availability: availabilityOf(m.provider, m.id, configured[m.provider]),
  }));

  const routes = await getAllAiRoutes();
  const features: FeatureRouteStatus[] = routes.map((r) => {
    const imageFeature = AI_IMAGE_EDIT_FEATURES.has(r.feature);
    const plan = imageFeature
      ? { attempts: [{ ...r.route, role: "primary" as const }], skipped: [] }
      : planRoute({
          feature: r.feature,
          primary: r.route,
          requirements: { vision: AI_VISION_FEATURES.has(r.feature), jsonSchema: false },
          configured,
          policy,
          providerOrder,
          cooldown: cooldownOf,
          lastSuccessAt,
          now,
        });
    return {
      feature: r.feature,
      label: AI_FEATURE_LABELS[r.feature],
      route: r.route,
      availability: registeredModel(r.route.provider, r.route.model)
        ? availabilityOf(r.route.provider, r.route.model, configured[r.route.provider])
        : null,
      chain: plan.attempts.map((a) => ({ provider: a.provider, model: a.model, role: a.role })),
      skipped: plan.skipped,
    };
  });

  return {
    policy,
    providerOrder,
    configured,
    models,
    features,
    deepseekBalance: configured.DEEPSEEK ? await getDeepSeekBalance() : null,
    generatedAt: now,
  };
}
