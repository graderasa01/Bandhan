import OpenAI from "openai";
import type { AiCallParams, AiCallResult, AiContentBlock } from "./types";

function toContentParts(content: string | AiContentBlock[]): OpenAI.Chat.ChatCompletionContentPart[] | string {
  if (typeof content === "string") return content;
  return content.map((block): OpenAI.Chat.ChatCompletionContentPart => {
    if (block.type === "text") return { type: "text", text: block.text };
    if (block.type === "image") {
      return { type: "image_url", image_url: { url: `data:${block.mimeType};base64,${block.base64}` } };
    }
    return {
      type: "file",
      file: { file_data: `data:application/pdf;base64,${block.base64}`, filename: block.filename ?? "document.pdf" },
    };
  });
}

/**
 * `strict: false` on purpose — our schemas were written for Anthropic's
 * subset (additionalProperties: false, optional fields as nullable unions)
 * and OpenAI's `strict: true` additionally requires every property to be
 * listed in `required`, which not all of them satisfy. Non-strict still
 * guarantees syntactically valid JSON and uses the schema as steering, just
 * without the stricter conformance guarantee.
 */
export async function callOpenAi(params: AiCallParams): Promise<AiCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: "not_configured", message: "OPENAI_API_KEY set nahi hai." };
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.chat.completions.create({
      model: params.model,
      max_completion_tokens: params.maxTokens,
      ...(params.jsonSchema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: { name: params.schemaName ?? "result", schema: params.jsonSchema, strict: false },
            },
          }
        : {}),
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: toContentParts(params.content) },
      ],
    });

    const choice = response.choices[0];
    if (!choice) {
      return { ok: false, kind: "upstream_error", message: "AI se koi content nahi mila." };
    }
    if (choice.finish_reason === "content_filter") {
      const u = response.usage;
      return {
        ok: false,
        kind: "refusal",
        message: "AI ne is input par jawab dene se mana kar diya.",
        usage: { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 },
      };
    }
    const u = response.usage;
    const usage = {
      inputTokens: u?.prompt_tokens ?? 0,
      outputTokens: u?.completion_tokens ?? 0,
      cacheReadTokens: u?.prompt_tokens_details?.cached_tokens ?? undefined,
    };

    const text = choice.message?.content;
    if (!text) {
      return { ok: false, kind: "upstream_error", message: "AI se koi content nahi mila.", usage };
    }

    return { ok: true, text, usage };
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      return { ok: false, kind: "rate_limited", message: "Abhi thoda rush hai — ek pal baad try karein." };
    }
    if (err instanceof OpenAI.AuthenticationError) {
      return { ok: false, kind: "auth_error", message: "OPENAI_API_KEY galat hai ya expire ho gayi." };
    }
    return {
      ok: false,
      kind: "upstream_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
