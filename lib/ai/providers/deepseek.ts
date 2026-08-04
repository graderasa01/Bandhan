import OpenAI from "openai";
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
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: "not_configured", message: "DEEPSEEK_API_KEY set nahi hai." };
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
      max_tokens: params.maxTokens,
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
      // DeepSeek's own docs warn JSON mode can return empty content sporadically.
      return { ok: false, kind: "upstream_error", message: "AI se koi content nahi mila.", usage };
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
