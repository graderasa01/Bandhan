import { GoogleGenerativeAI, GoogleGenerativeAIFetchError, FinishReason, type Part } from "@google/generative-ai";
import { jsonSchemaToGemini } from "./jsonSchemaToGemini";
import { getProviderKey } from "@/lib/ai/credentials";
import type { AiCallParams, AiCallResult, AiContentBlock } from "./types";

function toParts(content: string | AiContentBlock[]): Part[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((block): Part => {
    if (block.type === "text") return { text: block.text };
    if (block.type === "image") return { inlineData: { mimeType: block.mimeType, data: block.base64 } };
    return { inlineData: { mimeType: "application/pdf", data: block.base64 } };
  });
}

function withSchemaInPrompt(system: string, jsonSchema: Record<string, unknown>): string {
  return `${system}

Respond with valid JSON only, matching this JSON Schema exactly (every required key present, no extra keys, no prose outside the JSON):
${JSON.stringify(jsonSchema)}`;
}

export async function callGemini(params: AiCallParams): Promise<AiCallResult> {
  // /admin/ai-settings first, GEMINI_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("GEMINI");
  if (!apiKey) {
    return {
      ok: false,
      kind: "not_configured",
      message: "Gemini key set nahi hai — /admin/ai-settings se daalein ya GEMINI_API_KEY set karein.",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generate = (enforceSchema: boolean) => {
      const model = genAI.getGenerativeModel({
        model: params.model,
        systemInstruction: enforceSchema || !params.jsonSchema ? params.system : withSchemaInPrompt(params.system, params.jsonSchema),
        generationConfig: {
          maxOutputTokens: params.maxTokens,
          ...(params.jsonSchema
            ? enforceSchema
              ? { responseMimeType: "application/json", responseSchema: jsonSchemaToGemini(params.jsonSchema) }
              : { responseMimeType: "application/json" }
            : {}),
        },
      });
      return model.generateContent({ contents: [{ role: "user", parts: toParts(params.content) }] });
    };

    let result;
    try {
      result = await generate(true);
    } catch (err) {
      /*
       * Gemini compiles `responseSchema` into a grammar with a hard (and
       * undocumented) size ceiling; past it the API answers a bare
       * `400 INVALID_ARGUMENT` with no detail. Growth Saathi's campaign
       * package (~12 KB of schema) is the first call in the app to cross
       * it — every section of that schema is accepted on its own, only the
       * whole is refused. Second attempt: plain JSON mode with the schema
       * folded into the prompt (what DeepSeek always does); the caller still
       * validates the reply, so the enforcement is lost but nothing else is.
       */
      if (params.jsonSchema && err instanceof GoogleGenerativeAIFetchError && err.status === 400) {
        console.warn(`[ai:gemini] ${params.model} rejected the response schema (400); retrying in plain JSON mode with the schema in the prompt.`);
        result = await generate(false);
      } else {
        throw err;
      }
    }
    const response = result.response;

    const blocked =
      response.promptFeedback?.blockReason ||
      response.candidates?.[0]?.finishReason === FinishReason.SAFETY ||
      response.candidates?.[0]?.finishReason === FinishReason.RECITATION;
    if (blocked) {
      const u = response.usageMetadata;
      return {
        ok: false,
        kind: "refusal",
        message: "AI ne is input par jawab dene se mana kar diya.",
        usage: u ? { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount } : undefined,
      };
    }

    const u = response.usageMetadata;
    const usage = {
      inputTokens: u?.promptTokenCount ?? 0,
      outputTokens: u?.candidatesTokenCount ?? 0,
      cacheReadTokens: u?.cachedContentTokenCount ?? undefined,
    };

    const text = response.text();
    if (!text) {
      return { ok: false, kind: "upstream_error", message: "AI se koi content nahi mila.", usage };
    }

    return { ok: true, text, usage };
  } catch (err) {
    if (err instanceof GoogleGenerativeAIFetchError) {
      if (err.status === 429) {
        return { ok: false, kind: "rate_limited", message: "Abhi thoda rush hai — ek pal baad try karein." };
      }
      if (err.status === 401 || err.status === 403) {
        return { ok: false, kind: "auth_error", message: "GEMINI_API_KEY galat hai ya expire ho gayi." };
      }
    }
    return {
      ok: false,
      kind: "upstream_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
