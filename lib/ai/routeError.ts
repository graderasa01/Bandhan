import type { AiErrorKind } from "@/lib/ai/providers";

/**
 * Every route's own error-code union narrows AI failures down to just two
 * client-facing codes — "not_configured" (nothing will work until env/admin
 * config changes) and "upstream_error" (this call failed, user can retry).
 * Centralized here so the AI call sites don't each re-derive the same
 * status/code pairing from the provider-level `AiErrorKind`.
 */
export function mapAiError(kind: AiErrorKind): { status: number; code: "not_configured" | "upstream_error" } {
  switch (kind) {
    case "not_configured":
    case "auth_error":
      return { status: 503, code: "not_configured" };
    case "rate_limited":
      return { status: 429, code: "upstream_error" };
    case "refusal":
    case "unsupported":
    case "upstream_error":
    default:
      return { status: 502, code: "upstream_error" };
  }
}
