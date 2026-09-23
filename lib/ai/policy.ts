import type { AiProviderName } from "@/lib/ai/models";
import { AI_PROVIDERS } from "@/lib/ai/registry";
import type { FallbackPolicy } from "@/lib/ai/routePlan";

/**
 * The two switches that decide how far a failed AI call may travel.
 *
 *   AI_FALLBACK_POLICY     cross-provider (default) | same-provider | off
 *   AI_FALLBACK_PROVIDERS  comma list, e.g. "GEMINI,DEEPSEEK" — the order
 *                          other providers are tried in, and an allow-list:
 *                          a provider left out is never a fallback.
 *
 * Read in one place so the router that acts on them and the admin page that
 * describes them cannot disagree.
 */

export const DEFAULT_PROVIDER_ORDER: AiProviderName[] = ["GEMINI", "DEEPSEEK", "ANTHROPIC", "OPENAI"];

type EnvReader = (name: string) => string | undefined;

export function fallbackPolicyFromEnv(env: EnvReader): FallbackPolicy {
  const raw = (env("AI_FALLBACK_POLICY") ?? "").trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "same-provider") return "same-provider";
  return "cross-provider";
}

/** A caller may narrow the global policy for one call, never widen it. */
export function narrowPolicy(global: FallbackPolicy, narrow?: FallbackPolicy): FallbackPolicy {
  if (!narrow) return global;
  const order: FallbackPolicy[] = ["off", "same-provider", "cross-provider"];
  return order[Math.min(order.indexOf(global), order.indexOf(narrow))];
}

export function providerOrderFromEnv(env: EnvReader): AiProviderName[] {
  const raw = env("AI_FALLBACK_PROVIDERS");
  if (!raw) return DEFAULT_PROVIDER_ORDER;
  const listed = raw
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p): p is AiProviderName => (AI_PROVIDERS as readonly string[]).includes(p));
  return listed.length > 0 ? listed : DEFAULT_PROVIDER_ORDER;
}
