import { prisma } from "@/lib/db/prisma";
import { getAiRoute } from "@/lib/ai/aiConfigService";
import type { AiFeatureKey, AiRoute } from "@/lib/ai/models";
import { callAnthropic } from "./anthropic";
import { callOpenAi } from "./openai";
import { callGemini } from "./gemini";
import { callDeepSeek } from "./deepseek";
import type { AiCallResult, AiContentBlock } from "./types";

export type { AiCallResult, AiContentBlock, AiCallParams, AiUsage, AiErrorKind } from "./types";

export type CallAiParams = {
  /** Key into AI_MODEL_DEFAULTS / AiFeatureConfig — decides provider + model. */
  configFeature: AiFeatureKey;
  /** Free-form tag written to AiInteraction.feature — same strings the routes used before. */
  logFeature: string;
  userId: string | null;
  system: string;
  content: string | AiContentBlock[];
  maxTokens: number;
  /** See `AiCallParams.thinking` — short, schema-shaped calls pass `"off"`. */
  thinking?: "off";
  jsonSchema?: Record<string, unknown>;
  /** OpenAI's response_format needs a schema name; ignored by the other providers. */
  schemaName?: string;
};

/**
 * The one place every AI feature calls through. Resolves the admin-editable
 * provider+model for `configFeature`, dispatches to that provider's client,
 * and writes the AiInteraction cost row — so the 7 call sites never touch a
 * provider SDK or repeat the logging/error-mapping that used to be
 * copy-pasted into each of them.
 */
export async function callAi(params: CallAiParams): Promise<AiCallResult & { route: AiRoute }> {
  const route = await getAiRoute(params.configFeature);

  const call =
    route.provider === "ANTHROPIC"
      ? callAnthropic
      : route.provider === "OPENAI"
        ? callOpenAi
        : route.provider === "GEMINI"
          ? callGemini
          : callDeepSeek;

  const result = await call({
    model: route.model,
    system: params.system,
    content: params.content,
    maxTokens: params.maxTokens,
    thinking: params.thinking,
    jsonSchema: params.jsonSchema,
    schemaName: params.schemaName,
  });

  // `usage` is only set when the request actually reached the provider
  // (success, or a billed refusal) — not on not_configured/auth/rate-limit/
  // connection failures, which never got that far.
  const usage = result.ok ? result.usage : result.usage;
  if (usage) {
    try {
      await prisma.aiInteraction.create({
        data: {
          userId: params.userId,
          feature: params.logFeature,
          modelId: route.model,
          provider: route.provider,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          wasBlocked: !result.ok && result.kind === "refusal",
          blockReason: !result.ok && result.kind === "refusal" ? result.message : null,
        },
      });
    } catch (err) {
      // A logging failure must never take down the actual AI response.
      console.error("[ai:log] aiInteraction write failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return { ...result, route };
}
