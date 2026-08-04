import Anthropic from "@anthropic-ai/sdk";
import type { AiCallParams, AiCallResult, AiContentBlock } from "./types";

function toContentBlocks(content: string | AiContentBlock[]) {
  if (typeof content === "string") return content;
  return content.map((block) => {
    if (block.type === "text") return { type: "text" as const, text: block.text };
    if (block.type === "image") {
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: block.mimeType as "image/jpeg", data: block.base64 },
      };
    }
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: block.base64 },
    };
  });
}

/** D-31's original provider. Structured outputs via `output_config.format`, prefix caching on `system`. */
export async function callAnthropic(params: AiCallParams): Promise<AiCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: "not_configured", message: "ANTHROPIC_API_KEY set nahi hai." };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      ...(params.jsonSchema
        ? { output_config: { format: { type: "json_schema" as const, schema: params.jsonSchema } } }
        : {}),
      system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: toContentBlocks(params.content) }],
    });

    if (response.stop_reason === "refusal") {
      const u = response.usage;
      return {
        ok: false,
        kind: "refusal",
        message: "AI ne is input par jawab dene se mana kar diya.",
        usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens },
      };
    }

    const u = response.usage;
    const usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? undefined,
      cacheWriteTokens: u.cache_creation_input_tokens ?? undefined,
    };

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { ok: false, kind: "upstream_error", message: "AI se koi content nahi mila.", usage };
    }

    return { ok: true, text: block.text, usage };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, kind: "rate_limited", message: "Abhi thoda rush hai — ek pal baad try karein." };
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, kind: "auth_error", message: "ANTHROPIC_API_KEY galat hai ya expire ho gayi." };
    }
    return {
      ok: false,
      kind: "upstream_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
