import { GoogleGenerativeAI, GoogleGenerativeAIFetchError, FinishReason, type Part } from "@google/generative-ai";
import { jsonSchemaToGemini } from "./jsonSchemaToGemini";
import type { AiCallParams, AiCallResult, AiContentBlock } from "./types";

function toParts(content: string | AiContentBlock[]): Part[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((block): Part => {
    if (block.type === "text") return { text: block.text };
    if (block.type === "image") return { inlineData: { mimeType: block.mimeType, data: block.base64 } };
    return { inlineData: { mimeType: "application/pdf", data: block.base64 } };
  });
}

export async function callGemini(params: AiCallParams): Promise<AiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: "not_configured", message: "GEMINI_API_KEY set nahi hai." };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: params.model,
      systemInstruction: params.system,
      generationConfig: {
        maxOutputTokens: params.maxTokens,
        ...(params.jsonSchema
          ? { responseMimeType: "application/json", responseSchema: jsonSchemaToGemini(params.jsonSchema) }
          : {}),
      },
    });

    const result = await model.generateContent({ contents: [{ role: "user", parts: toParts(params.content) }] });
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
