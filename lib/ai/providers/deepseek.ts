import OpenAI from "openai";
import { getProviderKey } from "@/lib/ai/credentials";
import type { AiCallParams, AiCallResult, AiContentBlock } from "./types";

/**
 * DeepSeek's chat completions endpoint is OpenAI-SDK-compatible (same client,
 * different `baseURL`), but its JSON mode is a strict subset of OpenAI's:
 * `response_format: {type: "json_object"}` only — no `json_schema`, no
 * per-field enforcement — and DeepSeek's own docs require the literal word
 * "json" plus a shape example somewhere in the prompt, or the API may return
 * empty content. Every other provider in this app takes a real schema; here
 * we fold the schema into the system prompt text instead so the model still
 * has something concrete to match, even though nothing validates it beyond
 * `JSON.parse` succeeding — the same boundary the routes already apply to
 * every provider's output.
 */
function withJsonInstruction(system: string, jsonSchema: Record<string, unknown> | undefined): string {
  if (!jsonSchema) return system;
  return `${system}\n\nRespond with valid json only, matching this shape exactly (no extra keys, no prose outside the json):\n${JSON.stringify(jsonSchema)}`;
}

/**
 * Room for reasoning tokens on top of the caller's answer budget.
 *
 * The V4 models reason on every call, the reasoning comes out of `max_tokens`,
 * and — unlike Anthropic — there is no switch to turn it off, so
 * `AiCallParams.thinking: "off"` cannot be honoured here. Measured against the
 * real API (2026-08-23) with `matchExplanation`'s exact prompt:
 *
 *   max_tokens 512  → finish_reason "length", reasoning_tokens 512, content ""
 *   max_tokens 2048 → finish_reason "stop",   reasoning_tokens 340, content OK
 *
 * That empty string is what surfaced as "[ai:match_explanation] failed: AI se
 * koi content nahi mila" on every single reel generation. A caller that says
 * `thinking: "off"` has sized `maxTokens` for its answer alone, so this adds
 * the reasoning allowance it could not know it needed. Reasoning is billed for
 * what it uses, not for the ceiling, so the headroom costs nothing on calls
 * that think less.
 */
const REASONING_HEADROOM_TOKENS = 2048;

function effectiveMaxTokens(params: AiCallParams): number {
  return params.thinking === "off" ? params.maxTokens + REASONING_HEADROOM_TOKENS : params.maxTokens;
}

/** DeepSeek's current models are text-only. Vision content never reaches here — see AI_VISION_FEATURES. */
function toText(content: string | AiContentBlock[]): string {
  if (typeof content === "string") return content;
  const nonText = content.find((b) => b.type !== "text");
  if (nonText) {
    throw new Error("DeepSeek is text-only — is feature ke liye image/PDF bhejna support nahi hai.");
  }
  return content.map((b) => (b as Extract<AiContentBlock, { type: "text" }>).text).join("\n\n");
}

export async function callDeepSeek(params: AiCallParams): Promise<AiCallResult> {
  // /admin/ai-settings first, DEEPSEEK_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("DEEPSEEK");
  if (!apiKey) {
    return {
      ok: false,
      kind: "not_configured",
      message: "DeepSeek key set nahi hai — /admin/ai-settings se daalein ya DEEPSEEK_API_KEY set karein.",
    };
  }

  let userContent: string;
  try {
    userContent = toText(params.content);
  } catch (err) {
    return { ok: false, kind: "unsupported", message: err instanceof Error ? err.message : String(err) };
  }

  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });

  try {
    const response = await client.chat.completions.create({
      model: params.model,
      // DeepSeek mirrors the older OpenAI-compatible surface — `max_tokens`,
      // not the newer `max_completion_tokens` first-party OpenAI uses.
      max_tokens: effectiveMaxTokens(params),
      ...(params.jsonSchema ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        { role: "system", content: withJsonInstruction(params.system, params.jsonSchema) },
        { role: "user", content: userContent },
      ],
    });

    const choice = response.choices[0];
    if (!choice) {
      return { ok: false, kind: "upstream_error", message: "AI se koi content nahi mila." };
    }

    const u = response.usage;
    const usage = { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 };

    if (choice.finish_reason === "content_filter") {
      return { ok: false, kind: "refusal", message: "AI ne is input par jawab dene se mana kar diya.", usage };
    }

    const text = choice.message?.content;
    if (!text) {
      // `finish_reason` is the whole diagnosis and used to be thrown away.
      // "length" means the reasoning ate the budget (see
      // REASONING_HEADROOM_TOKENS); "stop" with no content is DeepSeek's
      // documented sporadic JSON-mode blank. They need opposite fixes, and a
      // bare "koi content nahi mila" told nobody which one had happened.
      return {
        ok: false,
        kind: "upstream_error",
        message: `AI se koi content nahi mila (finish_reason=${choice.finish_reason ?? "null"}, reasoning_tokens=${usage.outputTokens}).`,
        usage,
      };
    }

    return { ok: true, text, usage };
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      return { ok: false, kind: "rate_limited", message: "Abhi thoda rush hai — ek pal baad try karein." };
    }
    if (err instanceof OpenAI.AuthenticationError) {
      return { ok: false, kind: "auth_error", message: "DEEPSEEK_API_KEY galat hai ya expire ho gayi." };
    }
    return {
      ok: false,
      kind: "upstream_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
