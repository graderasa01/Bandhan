import OpenAI from "openai";
import { getProviderKey } from "@/lib/ai/credentials";
import { defaultTimeoutMs, type AiCallParams, type AiCallResult, type AiContentBlock } from "./types";
import { failureFromError, failureOf } from "./failure";

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
  // /admin/ai-settings first, OPENAI_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("OPENAI");
  if (!apiKey) {
    return failureOf(
      "MODEL_NOT_CONFIGURED",
      "OpenAI key set nahi hai — /admin/ai-settings se daalein ya OPENAI_API_KEY set karein.",
    );
  }

  // Timeout and retries are the router's job — see `AiCallParams.timeoutMs`.
  const client = new OpenAI({ apiKey, timeout: defaultTimeoutMs(params), maxRetries: 0 });

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
      return failureOf("MODEL_EMPTY_RESPONSE", "AI se koi choice nahi mili.", { reason: "no-choice" });
    }
    const u = response.usage;
    const usage = {
      inputTokens: u?.prompt_tokens ?? 0,
      outputTokens: u?.completion_tokens ?? 0,
      cacheReadTokens: u?.prompt_tokens_details?.cached_tokens ?? undefined,
    };
    if (choice.finish_reason === "content_filter") {
      return failureOf("MODEL_REFUSED", "AI ne is input par jawab dene se mana kar diya.", { usage });
    }

    const text = choice.message?.content;
    if (!text) {
      return failureOf("MODEL_EMPTY_RESPONSE", `AI se koi content nahi mila (finish_reason=${choice.finish_reason ?? "null"}).`, {
        usage,
        reason: `finish:${choice.finish_reason ?? "null"}`,
      });
    }

    return { ok: true, text, usage, finishReason: choice.finish_reason ?? null };
  } catch (err) {
    return failureFromError("OPENAI", err);
  }
}
