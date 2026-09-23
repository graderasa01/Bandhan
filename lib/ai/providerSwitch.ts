import {
  AI_FEATURE_TIER,
  AI_IMAGE_EDIT_FEATURES,
  AI_IMAGE_EDIT_PROVIDER_MODELS,
  AI_MODEL_DEFAULTS,
  AI_PROVIDER_MODELS,
  AI_VISION_FEATURES,
  type AiFeatureKey,
  type AiProviderName,
} from "@/lib/ai/models";

/**
 * "Move the whole app onto one provider" — worked out as a plan before
 * anything is written.
 *
 * /admin/ai-settings has always been one dropdown per feature, which is the
 * right shape for tuning a single call and the wrong shape for the thing that
 * actually happens: a provider's credit runs out, and sixteen features have to
 * move at once. Sixteen dropdowns and sixteen confirm dialogs is how half of
 * them end up forgotten on a dead provider — which is exactly the state this
 * deployment was found in.
 *
 * Two rules this planner exists to enforce, both of which a human clicking
 * through sixteen dropdowns in a hurry gets wrong:
 *
 *  1. **Tier survives the move.** Every `AI_MODEL_DEFAULTS` entry carries a
 *     paragraph of reasoning about why that feature is not on the cheapest
 *     model. Switching provider must not silently discard it, so assignments
 *     are made per `AI_FEATURE_TIER`, never "cheapest for everything".
 *
 *  2. **Rate limits are per model, not per key.** Gemini's free tier counts
 *     requests per model ID, so sixteen features sharing one model share one
 *     daily allowance — the state this deployment was already in, with six
 *     features stacked on `gemini-3.5-flash-lite`. `"spread"` deals them
 *     across the catalog instead, which multiplies the headroom at identical
 *     token cost.
 */

export type ProviderSwitchMode =
  /** One model per tier: cheapest for `light`, a mid-catalog model for `standard`. */
  | "tier"
  /** Deal features across the tier's models so no single rate-limit bucket carries the app. */
  | "spread";

export type ProviderSwitchPlan = {
  assignments: { feature: AiFeatureKey; model: string }[];
  /** Features this provider cannot serve at all, with the reason to show the admin. */
  skipped: { feature: AiFeatureKey; reason: string }[];
};

/**
 * Models this planner is willing to assign on its own.
 *
 * A `-preview` ID is a deliberate manual choice — Google retires them on its
 * own schedule and their free-tier allowances are the smallest in the catalog,
 * so landing the reel's per-card explanation on one because a round-robin
 * counter happened to point there is not a decision a bulk button should make.
 * They stay fully selectable from the per-feature dropdown.
 */
function autoAssignable(models: { id: string; label: string; vision: boolean }[]) {
  const stable = models.filter((m) => !m.id.includes("preview"));
  return stable.length > 0 ? stable : models;
}

/** Cheapest-first, so index 0 is the cheapest and the tail is the most capable. */
function poolsFor(models: { id: string; label: string; vision: boolean }[]) {
  const pool = autoAssignable(models);
  const half = Math.max(1, Math.floor(pool.length / 2));
  const light = pool.slice(0, half);
  const standard = pool.slice(half);
  return { pool, light, standard: standard.length > 0 ? standard : pool };
}

export function planProviderSwitch(provider: AiProviderName, mode: ProviderSwitchMode): ProviderSwitchPlan {
  const assignments: ProviderSwitchPlan["assignments"] = [];
  const skipped: ProviderSwitchPlan["skipped"] = [];

  // One counter per tier rather than one overall: otherwise the four `light`
  // features would shift which `standard` model each subsequent feature lands
  // on, and the plan would stop being readable as "these go here".
  const cursor: Record<"light" | "standard", number> = { light: 0, standard: 0 };

  for (const feature of Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[]) {
    if (AI_IMAGE_EDIT_FEATURES.has(feature)) {
      if (provider !== "OPENAI" && provider !== "GEMINI") {
        skipped.push({
          feature,
          reason: "Naya photo generate karta hai — sirf GPT ya Gemini ke paas image-output model hai.",
        });
        continue;
      }
      // No tier axis here: this catalog is one model per capability level, and
      // the first entry is the current one by construction.
      assignments.push({ feature, model: AI_IMAGE_EDIT_PROVIDER_MODELS[provider][0].id });
      continue;
    }

    const all = AI_PROVIDER_MODELS[provider];
    const usable = AI_VISION_FEATURES.has(feature) ? all.filter((m) => m.vision) : all;
    if (usable.length === 0) {
      skipped.push({
        feature,
        reason: "Photo/PDF padhta hai — is provider ke paas koi vision-capable model nahi hai.",
      });
      continue;
    }

    const tier = AI_FEATURE_TIER[feature as Exclude<AiFeatureKey, "photoUltraEnhance">];
    const { pool, light, standard } = poolsFor(usable);
    const tierPool = tier === "light" ? light : standard;

    if (mode === "spread") {
      assignments.push({ feature, model: tierPool[cursor[tier] % tierPool.length].id });
      cursor[tier] += 1;
      continue;
    }

    // "tier" mode. `light` takes the cheapest model outright. `standard` takes
    // the middle of the catalog — which, on Anthropic's three-model list,
    // reproduces `AI_MODEL_DEFAULTS` exactly (haiku for light, sonnet for
    // standard), so switching to Anthropic and back is a no-op rather than a
    // quiet downgrade.
    const model = tier === "light" ? pool[0] : pool[Math.min(pool.length - 1, Math.floor(pool.length / 2))];
    assignments.push({ feature, model: model.id });
  }

  return { assignments, skipped };
}
