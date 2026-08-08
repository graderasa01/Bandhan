import Anthropic from "@anthropic-ai/sdk";
import { getProviderKey } from "@/lib/ai/credentials";
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
  // /admin/ai-settings first, ANTHROPIC_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("ANTHROPIC");
  if (!apiKey) {
    return {
      ok: false,
      kind: "not_configured",
      message: "Anthropic key set nahi hai — /admin/ai-settings se daalein ya ANTHROPIC_API_KEY set karein.",
    };
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

    /*
     * Every text block, joined — not `.find()`'s first one.
     *
     * A reply is free to arrive as several text blocks, and the old code kept
     * block 0 and silently dropped the rest. That was invisible while every
     * caller sent a short prompt and got back one block, and it surfaced the
     * moment Grio's system prompt grew: replies came back truncated to their
     * first few words, and a response whose blocks happened to lead with a
     * non-text block read as "AI se koi content nahi mila" — a hard failure
     * for a call that had actually succeeded and been paid for.
     */
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");

    if (!text) {
      // `stop_reason` is the whole diagnosis here and used to be thrown away:
      // an empty `content` from `max_tokens` (prompt too long for the budget)
      // and one from an unexpected block type are the same sentence to the
      // caller otherwise, and they need opposite fixes.
      return {
        ok: false,
        kind: "upstream_error",
        message: `AI se koi text content nahi mila (stop_reason=${response.stop_reason ?? "null"}, blocks=${response.content.map((b) => b.type).join(",") || "none"}).`,
        usage,
      };
    }

    return { ok: true, text, usage };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, kind: "rate_limited", message: "Abhi thoda rush hai — ek pal baad try karein." };
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, kind: "auth_error", message: "Anthropic key galat hai ya expire ho gayi." };
    }
    return {
      ok: false,
      kind: "upstream_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
