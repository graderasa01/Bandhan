import { prisma } from "@/lib/db/prisma";
import {
  AI_IMAGE_EDIT_FEATURES,
  AI_IMAGE_EDIT_PROVIDER_MODELS,
  AI_MODEL_DEFAULTS,
  AI_PROVIDER_MODELS,
  RETIRED_MODEL_REPLACEMENTS,
  type AiFeatureKey,
  type AiRoute,
} from "@/lib/ai/models";
import { planProviderSwitch, type ProviderSwitchMode } from "@/lib/ai/providerSwitch";
import type { Role } from "@prisma/client";

/**
 * In-process cache so every AI call doesn't cost a DB round trip. Short TTL
 * because this is admin-editable from /admin/ai-settings and a saved change
 * should take effect without a server restart.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; routes: Record<AiFeatureKey, AiRoute> } | null = null;

/** The models a feature may legally use, given its provider. */
function catalogFor(feature: AiFeatureKey, provider: AiRoute["provider"]): { id: string }[] {
  if (AI_IMAGE_EDIT_FEATURES.has(feature)) {
    return provider === "OPENAI" || provider === "GEMINI" ? AI_IMAGE_EDIT_PROVIDER_MODELS[provider] : [];
  }
  return AI_PROVIDER_MODELS[provider];
}

/**
 * A stored route, corrected if the model it names no longer exists.
 *
 * `updateAiRoute` validates against the catalog at write time, so every row
 * was valid when it was saved. Providers retire models afterwards, and nothing
 * revisits the row — that is how three features kept calling a dead Gemini ID
 * until it started throwing 404s inside a dashboard render.
 *
 * The correction keeps the admin's *provider* and only replaces the model:
 * silently moving someone from Gemini to Anthropic would change what they pay
 * per call, which is not a decision this function gets to make. Falling all
 * the way back to the code default only happens when the provider has no
 * usable catalog left for that feature.
 */
function healRoute(feature: AiFeatureKey, stored: AiRoute): { route: AiRoute; retiredModel: string | null } {
  const catalog = catalogFor(feature, stored.provider);
  if (catalog.some((m) => m.id === stored.model)) return { route: stored, retiredModel: null };

  const replacement = RETIRED_MODEL_REPLACEMENTS[stored.model];
  const target = replacement && catalog.some((m) => m.id === replacement) ? replacement : catalog[0]?.id;

  if (!target) {
    console.error(
      `[ai:config] ${feature} is set to ${stored.provider}:${stored.model}, which is not a valid model for this feature. Falling back to the code default.`,
    );
    return { route: AI_MODEL_DEFAULTS[feature], retiredModel: stored.model };
  }

  console.warn(
    `[ai:config] ${feature} was set to the retired model ${stored.model}; using ${target} instead. Re-pick it in /admin/ai-settings to clear this.`,
  );
  return { route: { provider: stored.provider, model: target }, retiredModel: stored.model };
}

async function loadAllRoutes(): Promise<Record<AiFeatureKey, AiRoute>> {
  const rows = await prisma.aiFeatureConfig.findMany();
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  const routes = {} as Record<AiFeatureKey, AiRoute>;
  for (const feature of Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[]) {
    const row = byFeature.get(feature);
    routes[feature] = row
      ? healRoute(feature, { provider: row.provider, model: row.modelId }).route
      : AI_MODEL_DEFAULTS[feature];
  }
  return routes;
}

/** The live route a feature should call right now — DB override if one exists, else the code default. */
export async function getAiRoute(feature: AiFeatureKey): Promise<AiRoute> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.routes[feature];
  try {
    const routes = await loadAllRoutes();
    cache = { at: Date.now(), routes };
    return routes[feature];
  } catch (err) {
    // A DB hiccup must not take every AI feature down — fall back to the
    // code-side default and let the next call retry the DB.
    console.error(
      "[ai:config] DB read failed, falling back to code defaults:",
      err instanceof Error ? err.message : String(err),
    );
    return AI_MODEL_DEFAULTS[feature];
  }
}

export type AiRouteRow = {
  feature: AiFeatureKey;
  route: AiRoute;
  isDefault: boolean;
  /**
   * Set when the saved row named a model the provider has since retired. The
   * `route` above is already the corrected one — this is what the admin page
   * shows so somebody can pick a replacement deliberately instead of living on
   * an automatic one forever.
   */
  retiredModel: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** For the admin page — every feature, whether or not it has been overridden yet. */
export async function getAllAiRoutes(): Promise<AiRouteRow[]> {
  const rows = await prisma.aiFeatureConfig.findMany();
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  return (Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[]).map((feature) => {
    const row = byFeature.get(feature);
    const healed = row
      ? healRoute(feature, { provider: row.provider, model: row.modelId })
      : { route: AI_MODEL_DEFAULTS[feature], retiredModel: null };
    return {
      feature,
      route: healed.route,
      isDefault: !row,
      retiredModel: healed.retiredModel,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export type AiRouteUpdateResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

export async function updateAiRoute(params: {
  feature: AiFeatureKey;
  provider: AiRoute["provider"];
  model: string;
  actorId: string;
  actorRole: Role;
}): Promise<AiRouteUpdateResult> {
  const { feature, provider, model, actorId, actorRole } = params;

  if (!(feature in AI_MODEL_DEFAULTS)) {
    return { ok: false, error: "NOT_FOUND", message: "Aisa koi AI feature nahi hai.", status: 404 };
  }

  // Image-generation features (photoUltraEnhance) draw from a completely
  // separate catalog than chat-completions features — Anthropic/DeepSeek
  // have no image-output model at all, so they're rejected here even though
  // they're valid enum values on `AiProvider` generally.
  if (AI_IMAGE_EDIT_FEATURES.has(feature)) {
    if (provider !== "OPENAI" && provider !== "GEMINI") {
      return {
        ok: false,
        error: "INVALID_PROVIDER",
        message: "Ye feature sirf GPT (OpenAI) ya Gemini support karta hai — image generate karne wala model chahiye.",
        status: 422,
      };
    }
    const validImageModelIds = AI_IMAGE_EDIT_PROVIDER_MODELS[provider].map((m) => m.id);
    if (!validImageModelIds.includes(model)) {
      return { ok: false, error: "INVALID_MODEL", message: "Ye model is provider ke liye supported nahi hai.", status: 422 };
    }
  } else {
    const validModelIds = AI_PROVIDER_MODELS[provider].map((m) => m.id);
    if (!validModelIds.includes(model)) {
      return { ok: false, error: "INVALID_MODEL", message: "Ye model is provider ke liye supported nahi hai.", status: 422 };
    }
  }

  const existing = await prisma.aiFeatureConfig.findUnique({ where: { feature } });
  const previousValue = existing
    ? `${existing.provider}:${existing.modelId}`
    : `${AI_MODEL_DEFAULTS[feature].provider}:${AI_MODEL_DEFAULTS[feature].model} (default)`;

  await prisma.$transaction(async (tx) => {
    await tx.aiFeatureConfig.upsert({
      where: { feature },
      create: { feature, provider, modelId: model, updatedBy: actorId },
      update: { provider, modelId: model, updatedBy: actorId },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "AI_ROUTE_UPDATED",
        targetType: "ai_feature_config",
        targetId: feature,
        previousValue,
        newValue: `${provider}:${model}`,
      },
    });
  });

  cache = null; // next getAiRoute() call re-reads the DB
  return { ok: true };
}

export type ProviderSwitchResult =
  | {
      ok: true;
      provider: AiRoute["provider"];
      /** What each feature now points at, in the order the admin page lists them. */
      applied: { feature: AiFeatureKey; model: string }[];
      /** Features this provider cannot serve — left on whatever they were. */
      skipped: { feature: AiFeatureKey; reason: string }[];
      /** Distinct model IDs in use after the switch — the rate-limit bucket count. */
      modelsUsed: number;
    }
  | { ok: false; error: string; message: string; status: number };

/**
 * Move every feature this provider can serve onto it, in one transaction.
 *
 * Deliberately all-or-nothing. A partial bulk switch is strictly worse than no
 * bulk switch: the admin reaches for this precisely when a provider has gone
 * dead, and being told "eleven of sixteen moved" leaves them with a split they
 * now have to reconstruct by hand from a toast message.
 *
 * Features the provider cannot serve are *skipped*, not failed — `photoUltraEnhance`
 * on Anthropic has no image-output model to move to, and refusing the whole
 * switch over it would mean the one provider with no image model can never be
 * selected in bulk at all. They are returned so the UI can name them.
 *
 * One audit row rather than sixteen: this was one decision by one person at one
 * moment, and sixteen rows would push the rest of the day's admin activity off
 * the first page of /admin/audit-logs.
 */
export async function applyProviderSwitch(params: {
  provider: AiRoute["provider"];
  mode: ProviderSwitchMode;
  actorId: string;
  actorRole: Role;
}): Promise<ProviderSwitchResult> {
  const { provider, mode, actorId, actorRole } = params;

  const plan = planProviderSwitch(provider, mode);
  if (plan.assignments.length === 0) {
    return {
      ok: false,
      error: "NOTHING_TO_APPLY",
      message: "Is provider par koi bhi feature nahi chal sakta.",
      status: 422,
    };
  }

  const existing = await prisma.aiFeatureConfig.findMany();
  const byFeature = new Map(existing.map((r) => [r.feature, r]));
  const before = (Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[])
    .map((f) => {
      const row = byFeature.get(f);
      return row ? `${row.provider}:${row.modelId}` : `${AI_MODEL_DEFAULTS[f].provider}:${AI_MODEL_DEFAULTS[f].model}`;
    })
    .reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});

  await prisma.$transaction(async (tx) => {
    for (const { feature, model } of plan.assignments) {
      await tx.aiFeatureConfig.upsert({
        where: { feature },
        create: { feature, provider, modelId: model, updatedBy: actorId },
        update: { provider, modelId: model, updatedBy: actorId },
      });
    }

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "AI_ROUTES_BULK_SWITCHED",
        targetType: "ai_feature_config",
        targetId: `ALL:${provider}`,
        previousValue: Object.entries(before)
          .map(([route, count]) => `${route} ×${count}`)
          .join(", "),
        newValue: `${provider} (${mode}) — ${plan.assignments.map((a) => `${a.feature}:${a.model}`).join(", ")}`,
      },
    });
  });

  cache = null;
  return {
    ok: true,
    provider,
    applied: plan.assignments,
    skipped: plan.skipped,
    modelsUsed: new Set(plan.assignments.map((a) => a.model)).size,
  };
}
