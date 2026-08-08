import OpenAI, { toFile } from "openai";
import { getProviderKey } from "@/lib/ai/credentials";
import type { AiImageEditParams, AiImageEditResult } from "./types";

/**
 * OpenAI's Images API (`images.edit`) — a genuinely different endpoint from
 * `chat.completions.create` used by `callOpenAi`. `gpt-image-1` always
 * returns base64 (`b64_json`); there is no `response_format`/URL option to
 * request, unlike the older dall-e-2/3 models — do not add one.
 *
 * **Verify before the first funded call**: exact accepted params (`size`,
 * `quality`, `n`) and the response shape are current as of this writing but
 * OpenAI's image API has moved faster than the chat models — check
 * platform.openai.com/docs/api-reference/images before relying on this in
 * production.
 */
export async function callOpenAiImageEdit(params: AiImageEditParams): Promise<AiImageEditResult> {
  // /admin/ai-settings first, OPENAI_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("OPENAI");
  if (!apiKey) {
    return {
      ok: false,
      kind: "not_configured",
      message: "OpenAI key set nahi hai — /admin/ai-settings se daalein ya OPENAI_API_KEY set karein.",
    };
  }

  const client = new OpenAI({ apiKey });

  try {
    const imageFile = await toFile(Buffer.from(params.imageBase64, "base64"), "source.jpg", {
      type: params.mimeType,
    });

    const response = await client.images.edit({
      model: params.model,
      image: imageFile,
      prompt: params.prompt,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      return { ok: false, kind: "upstream_error", message: "AI se koi image nahi mili." };
    }

    return { ok: true, imageBase64: b64, mimeType: "image/png" };
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
