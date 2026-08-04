import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import type { AiImageEditParams, AiImageEditResult } from "./types";

/**
 * Gemini's native multimodal image output — the *same* `generateContent`
 * call shape `callGemini` (text) uses, but on an image-generation-capable
 * model (`gemini-2.5-flash-image`), with the source photo as an `inlineData`
 * part alongside the prompt, and the edited result returned the same way —
 * an `inlineData` part in the response, not text.
 *
 * **Verify before the first funded call**: `responseModalities` and the
 * exact response part shape for image-output models are current as of this
 * writing but this is one of Gemini's newer capabilities — check
 * ai.google.dev/gemini-api/docs/image-generation before relying on this in
 * production. The `@google/generative-ai` package's types may lag the API
 * here, hence the casts.
 */
export async function callGeminiImageEdit(params: AiImageEditParams): Promise<AiImageEditResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: "not_configured", message: "GEMINI_API_KEY set nahi hai." };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: params.model,
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as Record<string, unknown>,
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: params.mimeType, data: params.imageBase64 } }, { text: params.prompt }],
        },
      ],
    });

    const response = result.response;
    const blocked = response.promptFeedback?.blockReason;
    if (blocked) {
      return { ok: false, kind: "refusal", message: "AI ne is input par jawab dene se mana kar diya." };
    }

    type InlineImagePart = { inlineData?: { mimeType: string; data: string } };
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlineImagePart[];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData) {
      return { ok: false, kind: "upstream_error", message: "AI se koi image nahi mili." };
    }

    return { ok: true, imageBase64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
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
