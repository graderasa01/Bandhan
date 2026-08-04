import { prisma } from "@/lib/db/prisma";
import { getAiRoute } from "@/lib/ai/aiConfigService";
import { callOpenAiImageEdit } from "./providers/openaiImageEdit";
import { callGeminiImageEdit } from "./providers/geminiImageEdit";
import type { AiImageEditResult } from "./providers/types";

export type CallAiImageEditParams = {
  userId: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
};

/**
 * The image-editing sibling of `callAi()` — separate because the request/
 * response shape genuinely differs (image bytes, not text/JSON), not because
 * the routing philosophy does. Still resolves the admin-editable route from
 * the same `AiFeatureConfig` table via `getAiRoute("photoUltraEnhance")`, and
 * still writes to `AiInteraction` so the admin audit trail and the daily-cap
 * counter (`getUltraEnhanceUsageToday`) both work off one source of truth.
 */
export async function callAiImageEdit(params: CallAiImageEditParams): Promise<AiImageEditResult> {
  const route = await getAiRoute("photoUltraEnhance");

  // updateAiRoute() already rejects ANTHROPIC/DEEPSEEK for this feature, so
  // this should only ever resolve OPENAI or GEMINI — GEMINI is the only
  // explicit branch, everything else (including a config row that somehow
  // slipped through) falls to OpenAI's caller, which fails loudly with
  // `not_configured`/`auth_error` rather than silently doing nothing.
  const call = route.provider === "GEMINI" ? callGeminiImageEdit : callOpenAiImageEdit;

  const result = await call({
    model: route.model,
    prompt: params.prompt,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
  });

  // Image models bill per-image, not per-token — no input/output token count
  // to log. This row exists to drive the daily-cap count and the admin audit
  // trail, not per-token cost analytics, so inputTokens/outputTokens are 0.
  // Only logged when the call genuinely reached the provider (success or a
  // billed refusal) — same convention as callAi() — so a transient
  // not_configured/rate_limited/auth failure never costs the user one of
  // their 4 daily attempts.
  const reachedProvider = result.ok || result.kind === "refusal";
  if (reachedProvider) {
    try {
      await prisma.aiInteraction.create({
        data: {
          userId: params.userId,
          feature: "photoUltraEnhance",
          modelId: route.model,
          provider: route.provider,
          inputTokens: 0,
          outputTokens: 0,
          wasBlocked: !result.ok && result.kind === "refusal",
          blockReason: !result.ok && result.kind === "refusal" ? result.message : null,
        },
      });
    } catch (err) {
      console.error("[ai:log] aiInteraction write failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return result;
}
