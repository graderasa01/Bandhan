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

/**
 * `AiCallParams.thinking: "off"`, in the shape Gemini wants.
 *
 * This used to be dropped on the floor — `types.ts` said "OpenAI/Gemini/DeepSeek
 * ignore it today", which was true of the 2.x line and stopped being true the
 * moment the catalog moved to Gemini 3.x. Those models reason by default and
 * bill it against `maxOutputTokens`, exactly like Sonnet 5 does on the Anthropic
 * side — so a 512-token budget sized for a two-line match explanation gets spent
 * deliberating and the caller gets back `{"reason":"Dono profiles Jaipur se hain
 * aur` with the string still open. Invalid JSON, no error, no refusal.
 *
 * That failure only becomes routine when the whole app moves onto Gemini, which
 * is what /admin/ai-settings' bulk switch now makes a one-click operation — so
 * honouring the flag stops being optional. `lib/speech/geminiSpeech.ts` has sent
 * `thinkingBudget: 0` for the same reason since it was written; this brings the
 * main provider client in line with it.
 *
 * Cast because the pinned SDK (`@google/generative-ai@0.24.x`) predates the
 * field and its typed `GenerationConfig` has no room for it — the same gap that
 * pushed the speech calls onto raw `fetch`. The request is what the API docs
 * describe; only the types are behind.
 */
function thinkingOverride(thinking: AiCallParams["thinking"]) {
  return thinking === "off" ? ({ thinkingConfig: { thinkingBudget: 0 } } as Record<string, unknown>) : {};
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
          ...thinkingOverride(params.thinking),
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

    /*
     * A JSON reply that ran out of budget is worse than no reply. Gemini
     * returns it as a normal 200 with `finishReason: MAX_TOKENS` and whatever
     * it had written so far — `{"reason":"Dono profiles Jaipur se hain aur` —
     * and every caller here runs `JSON.parse` on that and throws somewhere
     * further away from the cause. Naming it at the boundary is the difference
     * between a log line that says which model and which budget, and a
     * SyntaxError inside a dashboard render.
     *
     * Only for schema calls: an open-ended one (Grio's chat) hitting the
     * ceiling is a long answer cut short, which is still worth delivering.
     */
    if (params.jsonSchema && response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
      console.error(
        `[ai:gemini] ${params.model} hit maxTokens (${params.maxTokens}) before finishing its JSON — reply discarded.` +
          ` If this call passes thinking:"off" the budget is the answer's alone; raise it. If not, reasoning is sharing it.`,
      );
      return {
        ok: false,
        kind: "upstream_error",
        message: "AI ka jawab poora hone se pehle katt gaya — dobara try karein.",
        usage,
      };
    }

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
