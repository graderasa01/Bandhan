import { prisma } from "@/lib/db/prisma";
import {
  AI_IMAGE_EDIT_FEATURES,
  AI_IMAGE_EDIT_PROVIDER_MODELS,
  AI_MODEL_DEFAULTS,
  AI_PROVIDER_MODELS,
  type AiFeatureKey,
  type AiRoute,
} from "@/lib/ai/models";
import type { Role } from "@prisma/client";

/**
 * In-process cache so every AI call doesn't cost a DB round trip. Short TTL
 * because this is admin-editable from /admin/ai-settings and a saved change
 * should take effect without a server restart.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; routes: Record<AiFeatureKey, AiRoute> } | null = null;

async function loadAllRoutes(): Promise<Record<AiFeatureKey, AiRoute>> {
  const rows = await prisma.aiFeatureConfig.findMany();
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  const routes = {} as Record<AiFeatureKey, AiRoute>;
  for (const feature of Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[]) {
    const row = byFeature.get(feature);
    routes[feature] = row ? { provider: row.provider, model: row.modelId } : AI_MODEL_DEFAULTS[feature];
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
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** For the admin page — every feature, whether or not it has been overridden yet. */
export async function getAllAiRoutes(): Promise<AiRouteRow[]> {
  const rows = await prisma.aiFeatureConfig.findMany();
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  return (Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[]).map((feature) => {
    const row = byFeature.get(feature);
    return {
      feature,
      route: row ? { provider: row.provider, model: row.modelId } : AI_MODEL_DEFAULTS[feature],
      isDefault: !row,
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
