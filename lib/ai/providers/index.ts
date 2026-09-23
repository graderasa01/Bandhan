import type { AiFeatureKey, AiRoute } from "@/lib/ai/models";
import { routeAiCall, type RoutedAiResult } from "@/lib/ai/router";
import type { FallbackPolicy } from "@/lib/ai/routePlan";
import type { AiContentBlock } from "./types";

export type { AiCallResult, AiContentBlock, AiCallParams, AiUsage, AiErrorKind, AiCallFailure } from "./types";
export type { AiRouteTrace, AiAttemptTrace, RoutedAiResult } from "@/lib/ai/router";

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
  /** Dev-only: force one model, no fallback (the Grio debug panel). */
  override?: AiRoute | null;
  /** Narrow the global fallback policy for this call. */
  fallback?: FallbackPolicy;
  timeoutMs?: number;
  deadlineMs?: number;
  /** Whose name a member-facing failure sentence uses ("Grio" / "AI"). */
  subject?: string;
};

/**
 * The one place every AI feature calls through.
 *
 * Resolves the admin-editable route for `configFeature`, then hands the call
 * to the gateway (lib/ai/router.ts), which tries that model first and — when
 * it is down, rate-limited or out of balance — a capability-compatible
 * fallback, logging an AiInteraction row for every attempt that was billed.
 *
 * The result keeps the shape the fourteen call sites were written against
 * (`ok`, `text`, `kind`, `message`, `usage`, `route`) and adds `category` and
 * a `trace`. On failure `message` is now always member-safe; the provider's
 * own words are in `detail`.
 */
export async function callAi(params: CallAiParams): Promise<RoutedAiResult> {
  return routeAiCall(params);
}
