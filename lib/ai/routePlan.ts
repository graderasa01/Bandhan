import { AI_FEATURE_TIER, type AiFeatureKey, type AiProviderName, type AiRoute } from "@/lib/ai/models";
import { modelsOf, registeredModel, satisfies, type ModelRequirements, type RegisteredModel } from "@/lib/ai/registry";
import type { CooldownState } from "@/lib/ai/health";

/**
 * Which models to try, in what order, for one call — worked out before any of
 * them is called.
 *
 * Pure: every fact it needs (which keys exist, which models are cooling down,
 * which answered recently) is passed in, so the check script can hand it any
 * situation — "the primary is 503-ing and DeepSeek has no balance" — and read
 * the plan back without a network.
 *
 * ## The order, and why
 *
 *   1. **The admin's route.** /admin/ai-settings is a cost decision; the router
 *      honours it first, every time it is usable.
 *   2. **Same provider, another model.** A busy `gemini-3.8-flash` is very often
 *      a free `gemini-3.6-flash` away from an answer — same account, same
 *      bill, the admin's provider choice intact.
 *   3. **Another provider** — only when the policy allows (`AI_FALLBACK_POLICY`),
 *      only providers with a key, and only models that can take this call
 *      (vision for a biodata photo; a schema-enforcing model preferred for a
 *      JSON call). This is the step that moves spend between accounts, which is
 *      why it is a policy and not a given.
 *
 * Inside each step a model that *just* answered beats the registry's static
 * rank, and a model in cooldown is skipped with its reason recorded — so the
 * trace can say "skipped gemini-3.7-flash: MODEL_UNAVAILABLE (overloaded)"
 * instead of spending two seconds re-learning it.
 */

export type FallbackPolicy = "cross-provider" | "same-provider" | "off";

export type CandidateRole = "primary" | "override" | "same-provider" | "cross-provider" | "last-resort";

export interface RouteCandidate extends AiRoute {
  role: CandidateRole;
}

export interface SkippedCandidate extends AiRoute {
  reason: string;
}

export interface RoutePlanInput {
  feature: AiFeatureKey;
  primary: AiRoute;
  requirements: ModelRequirements;
  configured: Record<AiProviderName, boolean>;
  policy: FallbackPolicy;
  /** Cross-provider order; providers absent from it are never used as fallbacks. */
  providerOrder: AiProviderName[];
  cooldown: (provider: AiProviderName, model: string) => CooldownState;
  lastSuccessAt: (provider: AiProviderName, model: string) => number | null;
  now: number;
  /** A forced model (the dev debug panel's picker) — tried alone, no fallback. */
  override?: AiRoute | null;
  maxAttempts?: number;
  maxSameProvider?: number;
}

export interface RoutePlan {
  attempts: RouteCandidate[];
  skipped: SkippedCandidate[];
}

/** A success this recent is evidence the model is up *now*. Older ones are history. */
const RECENT_SUCCESS_MS = 30 * 60_000;

/** Light/standard split, the same one the bulk switch uses: cheapest half light, the rest standard. */
function tierOf(model: RegisteredModel): "light" | "standard" {
  const pool = modelsOf(model.provider).filter((m) => m.autoAssignable);
  const idx = pool.findIndex((m) => m.id === model.id);
  if (idx === -1) return "standard";
  const half = Math.max(1, Math.floor(pool.length / 2));
  return idx < half ? "light" : "standard";
}

function featureTier(feature: AiFeatureKey): "light" | "standard" {
  return (AI_FEATURE_TIER as Record<string, "light" | "standard">)[feature] ?? "standard";
}

function coolingReason(c: CooldownState): string {
  return `cooldown: ${c.category ?? "unknown"}${c.reason ? ` (${c.reason})` : ""}`;
}

export function planRoute(input: RoutePlanInput): RoutePlan {
  const attempts: RouteCandidate[] = [];
  const skipped: SkippedCandidate[] = [];
  const maxAttempts = input.maxAttempts ?? 4;
  const maxSameProvider = input.maxSameProvider ?? 2;
  const tier = featureTier(input.feature);
  const seen = new Set<string>();
  const key = (r: AiRoute) => `${r.provider}:${r.model}`;

  // ── a forced model is the whole plan ─────────────────────────────────────
  if (input.override) {
    const o = input.override;
    if (!input.configured[o.provider]) {
      skipped.push({ ...o, reason: "not configured" });
      return { attempts, skipped };
    }
    attempts.push({ ...o, role: "override" });
    return { attempts, skipped };
  }

  const usable = (r: AiRoute): string | null => {
    if (!input.configured[r.provider]) return "not configured";
    const reg = registeredModel(r.provider, r.model);
    if (reg && !satisfies(reg, input.requirements)) return "cannot take this input";
    const c = input.cooldown(r.provider, r.model);
    if (c.cooling) return coolingReason(c);
    return null;
  };

  const rank = (m: RegisteredModel) => {
    const success = input.lastSuccessAt(m.provider, m.id);
    const recent = success !== null && input.now - success < RECENT_SUCCESS_MS ? 0 : 1;
    const tierMatch = tierOf(m) === tier ? 0 : 1;
    // A JSON call prefers a model that enforces the schema; a prompted one is
    // still acceptable, just later.
    const json = input.requirements.jsonSchema && m.capabilities.jsonSchema === "prompted" ? 1 : 0;
    return [recent, json, tierMatch, m.fallbackRank] as const;
  };
  const byRank = (a: RegisteredModel, b: RegisteredModel) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  };

  // ── 1. the admin's route ─────────────────────────────────────────────────
  const primaryReason = usable(input.primary);
  seen.add(key(input.primary));
  if (primaryReason === null) attempts.push({ ...input.primary, role: "primary" });
  else skipped.push({ ...input.primary, reason: primaryReason });

  if (input.policy !== "off") {
    // ── 2. same provider, another model ─────────────────────────────────────
    const same = modelsOf(input.primary.provider)
      .filter((m) => m.autoAssignable && !seen.has(`${m.provider}:${m.id}`))
      .sort(byRank);
    let added = 0;
    for (const m of same) {
      if (added >= maxSameProvider) break;
      seen.add(`${m.provider}:${m.id}`);
      const reason = usable({ provider: m.provider, model: m.id });
      if (reason) {
        // Only report the skips that tell someone something; an unconfigured
        // provider was already reported for the primary.
        if (!reason.startsWith("not configured")) skipped.push({ provider: m.provider, model: m.id, reason });
        continue;
      }
      attempts.push({ provider: m.provider, model: m.id, role: "same-provider" });
      added += 1;
    }

    // ── 3. other providers ───────────────────────────────────────────────────
    if (input.policy === "cross-provider") {
      const others = input.providerOrder.filter((p) => p !== input.primary.provider);
      const best: RegisteredModel[] = [];
      for (const provider of others) {
        if (!input.configured[provider]) continue;
        const candidates = modelsOf(provider)
          .filter((m) => m.autoAssignable && satisfies(m, input.requirements))
          .sort(byRank);
        const pick = candidates.find((m) => !input.cooldown(m.provider, m.id).cooling);
        if (pick) best.push(pick);
        else if (candidates[0]) {
          skipped.push({
            provider,
            model: candidates[0].id,
            reason: coolingReason(input.cooldown(provider, candidates[0].id)),
          });
        }
      }
      // Provider order is the policy's; a provider that answered recently
      // still goes first, because "it worked a minute ago" beats a preference.
      best.sort((a, b) => {
        const ra = rank(a)[0];
        const rb = rank(b)[0];
        if (ra !== rb) return ra - rb;
        return others.indexOf(a.provider) - others.indexOf(b.provider);
      });
      for (const m of best) attempts.push({ provider: m.provider, model: m.id, role: "cross-provider" });
    }
  }

  // ── nothing left: one honest attempt rather than a refusal on memory ──────
  //
  // Every candidate is cooling down — which means everything failed a moment
  // ago, not that everything is failing now. Answering "unavailable" without
  // asking would turn a stale observation into a guaranteed outage, so the
  // primary (if it has a key) gets one real try.
  if (attempts.length === 0 && input.configured[input.primary.provider]) {
    const reg = registeredModel(input.primary.provider, input.primary.model);
    if (!reg || satisfies(reg, input.requirements)) {
      attempts.push({ ...input.primary, role: "last-resort" });
    }
  }

  return { attempts: attempts.slice(0, maxAttempts), skipped };
}
