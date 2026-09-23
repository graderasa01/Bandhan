import {
  GoogleGenerativeAI,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  FinishReason,
  type Part,
} from "@google/generative-ai";
import { jsonSchemaToGemini } from "./jsonSchemaToGemini";
import { getProviderKey } from "@/lib/ai/credentials";
import { defaultTimeoutMs, type AiCallParams, type AiCallResult, type AiContentBlock } from "./types";
import { failureFromError, failureFromFacts, failureOf } from "./failure";

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
 *
 * ## The shape is per model — measured 2026-09-23
 *
 * The first version sent `thinkingBudget: 0` everywhere. On the same key, the
 * same day, with the same one-line prompt:
 *
 *   model                   thinkingBudget: 0     thinkingLevel: "minimal"
 *   gemini-3.5-flash-lite   400 INVALID_ARGUMENT  200, 0 thought tokens
 *   gemini-3.1-flash-lite   200                   200
 *   gemini-3.5-flash        200                   200
 *   gemini-3.6-flash        200                   200
 *   gemini-3.7-flash        200                   400 "MINIMAL is not supported"
 *   gemini-3.8-flash        (503 that day)        400 "MINIMAL is not supported"
 *
 * So no single shape works across the catalog, and the failure is a bare 400
 * — which is how `discoveryIntentParsing` and `questionTranslation`, both
 * routed to 3.5-flash-lite by the bulk switch, came to fail on every call.
 * `THINKING_OFF_SHAPE` records what was measured; `generateWithFallback`
 * below tries the other shape on a 400 and remembers the one that worked, so
 * the next catalog entry nobody measured corrects itself after one call
 * instead of failing forever.
 */
type ThinkingShape = "budget-0" | "level-minimal" | "omit";

const THINKING_OFF_SHAPE: Record<string, ThinkingShape> = {
  "gemini-3.5-flash-lite": "level-minimal",
  "gemini-3.7-flash": "budget-0",
  "gemini-3.8-flash": "budget-0",
};

/** Learned at runtime: the shape a model last accepted. Survives only as long as the process. */
const learnedShape = new Map<string, ThinkingShape>();

/** Exported for the check script — the order a model's thinking shapes are tried in. */
export function shapesToTry(model: string, thinking: AiCallParams["thinking"]): ThinkingShape[] {
  if (thinking !== "off") return ["omit"];
  const first = learnedShape.get(model) ?? THINKING_OFF_SHAPE[model] ?? "budget-0";
  const second: ThinkingShape = first === "budget-0" ? "level-minimal" : "budget-0";
  // "omit" last: reasoning comes back on and shares the budget, which is worse
  // than either explicit shape but better than no answer at all.
  return [first, second, "omit"];
}

function thinkingOverride(shape: ThinkingShape) {
  if (shape === "budget-0") return { thinkingConfig: { thinkingBudget: 0 } } as Record<string, unknown>;
  if (shape === "level-minimal") return { thinkingConfig: { thinkingLevel: "minimal" } } as Record<string, unknown>;
  return {};
}

export async function callGemini(params: AiCallParams): Promise<AiCallResult> {
  // /admin/ai-settings first, GEMINI_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("GEMINI");
  if (!apiKey) {
    return failureOf(
      "MODEL_NOT_CONFIGURED",
      "Gemini key set nahi hai — /admin/ai-settings se daalein ya GEMINI_API_KEY set karein.",
    );
  }

  // Without a timeout the SDK waits as long as the socket does — the "Soch
  // rahe hain…" that never ends. The router decides what "too long" means.
  const timeout = defaultTimeoutMs(params);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generate = (enforceSchema: boolean, shape: ThinkingShape) => {
      const model = genAI.getGenerativeModel({
        model: params.model,
        systemInstruction: enforceSchema || !params.jsonSchema ? params.system : withSchemaInPrompt(params.system, params.jsonSchema),
        generationConfig: {
          maxOutputTokens: params.maxTokens,
          ...thinkingOverride(shape),
          ...(params.jsonSchema
            ? enforceSchema
              ? { responseMimeType: "application/json", responseSchema: jsonSchemaToGemini(params.jsonSchema) }
              : { responseMimeType: "application/json" }
            : {}),
        },
      });
      return model.generateContent({ contents: [{ role: "user", parts: toParts(params.content) }] }, { timeout });
    };

    const isBadRequest = (err: unknown) => err instanceof GoogleGenerativeAIFetchError && err.status === 400;

    /*
     * Two things can earn a bare `400 INVALID_ARGUMENT` here, and the API does
     * not say which: a thinking shape this model refuses (see the table
     * above), or a response schema too big for Gemini's grammar compiler
     * (Growth Saathi's ~12 KB campaign schema is the one that crosses it —
     * every section is accepted alone, only the whole is refused).
     *
     * So the ladder is: every thinking shape with the schema enforced, then —
     * only for schema calls — every shape again with plain JSON mode and the
     * schema folded into the prompt (what DeepSeek always does; the caller
     * still validates the reply). A non-400 error leaves the ladder at once:
     * a 503 or a 429 is about the model, and the router handles those.
     */
    const schemaModes = params.jsonSchema ? [true, false] : [true];
    const shapes = shapesToTry(params.model, params.thinking);
    let result: Awaited<ReturnType<typeof generate>> | null = null;
    let lastErr: unknown = null;
    ladder: for (const enforceSchema of schemaModes) {
      for (const shape of shapes) {
        try {
          result = await generate(enforceSchema, shape);
          if (shape !== shapes[0] || !enforceSchema) {
            console.warn(
              `[ai:gemini] ${params.model} accepted thinking=${shape}${params.jsonSchema ? `, schema ${enforceSchema ? "enforced" : "in prompt"}` : ""} after a 400 — remembered for this process.`,
            );
          }
          if (params.thinking === "off") learnedShape.set(params.model, shape);
          break ladder;
        } catch (err) {
          lastErr = err;
          if (!isBadRequest(err)) throw err;
        }
      }
    }
    if (!result) throw lastErr;
    const response = result.response;

    const blocked =
      response.promptFeedback?.blockReason ||
      response.candidates?.[0]?.finishReason === FinishReason.SAFETY ||
      response.candidates?.[0]?.finishReason === FinishReason.RECITATION;
    if (blocked) {
      const u = response.usageMetadata;
      return failureOf("MODEL_REFUSED", "AI ne is input par jawab dene se mana kar diya.", {
        usage: u ? { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount } : undefined,
      });
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
    const finishReason = response.candidates?.[0]?.finishReason ?? null;

    if (params.jsonSchema && finishReason === FinishReason.MAX_TOKENS) {
      console.error(
        `[ai:gemini] ${params.model} hit maxTokens (${params.maxTokens}) before finishing its JSON — reply discarded.` +
          ` If this call passes thinking:"off" the budget is the answer's alone; raise it. If not, reasoning is sharing it.`,
      );
      // Named as a parse failure because that is what it is to every caller:
      // `{"reason":"Dono profiles Jaipur se hain aur` does not parse.
      return failureOf(
        "MODEL_RESPONSE_PARSE_FAILED",
        `AI ka JSON jawab poora hone se pehle katt gaya (finishReason=MAX_TOKENS, maxTokens=${params.maxTokens}).`,
        { usage, reason: "finish:MAX_TOKENS" },
      );
    }

    const text = response.text();
    if (!text) {
      return failureOf("MODEL_EMPTY_RESPONSE", `AI se koi content nahi mila (finishReason=${finishReason ?? "null"}).`, {
        usage,
        reason: `finish:${finishReason ?? "null"}`,
      });
    }

    return { ok: true, text, usage, finishReason };
  } catch (err) {
    if (err instanceof GoogleGenerativeAIAbortError) {
      return failureFromFacts({
        provider: "GEMINI",
        status: null,
        message: `Gemini ${params.model} ne ${timeout}ms me jawab nahi diya (timeout).`,
        errorName: "GoogleGenerativeAIAbortError",
      });
    }
    if (err instanceof GoogleGenerativeAIFetchError) {
      // `errorDetails` is where Google says *which* quota ran out (per minute
      // vs per day) — the difference between "try again in 40 seconds" and
      // "this model is done until midnight Pacific".
      return failureFromFacts({
        provider: "GEMINI",
        status: err.status ?? null,
        message: err.message,
        details: err.errorDetails,
        errorName: "GoogleGenerativeAIFetchError",
      });
    }
    return failureFromError("GEMINI", err);
  }
}
