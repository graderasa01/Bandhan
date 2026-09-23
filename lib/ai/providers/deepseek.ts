import OpenAI from "openai";
import { getProviderKey } from "@/lib/ai/credentials";
import { defaultTimeoutMs, type AiCallParams, type AiCallResult, type AiContentBlock } from "./types";
import { failureFromError, failureOf } from "./failure";

/**
 * DeepSeek's chat completions endpoint is OpenAI-SDK-compatible (same client,
 * different `baseURL`), but its JSON mode is a strict subset of OpenAI's:
 * `response_format: {type: "json_object"}` only — no `json_schema`, no
 * per-field enforcement — and DeepSeek's own docs require the literal word
 * "json" plus a shape example somewhere in the prompt, or the API may return
 * empty content. Every other provider in this app takes a real schema; here
 * we fold the schema into the system prompt text instead so the model still
 * has something concrete to match, even though nothing validates it beyond
 * `JSON.parse` succeeding — the same boundary the routes already apply to
 * every provider's output.
 */
function withJsonInstruction(system: string, jsonSchema: Record<string, unknown> | undefined): string {
  if (!jsonSchema) return system;
  return `${system}\n\nRespond with valid json only, matching this shape exactly (no extra keys, no prose outside the json):\n${JSON.stringify(jsonSchema)}`;
}

/**
 * `AiCallParams.thinking: "off"`, in the shape DeepSeek wants — and the
 * correction of a claim this file used to make.
 *
 * Until 2026-09-23 the comment here said the V4 models "reason on every call
 * … there is no switch to turn it off", and the client compensated by adding
 * 2048 tokens of headroom. Measured that day against the live API on the same
 * two-line lifestyle prompt:
 *
 *   deepseek-flash   default          → 187 output tokens, 154 of them reasoning
 *   deepseek-flash   thinking disabled → 39 output tokens, no reasoning
 *   deepseek-v4-pro  default          → 100 output tokens, 65 reasoning
 *   deepseek-v4-pro  thinking disabled → 29 output tokens, no reasoning
 *
 * Same answer, a fraction of the tokens. So the switch is sent now. The
 * headroom stays as the belt to that brace: a future model that ignores the
 * field would otherwise be back to spending the whole answer budget on
 * reasoning and returning an empty string (the original 2026-08-23 bug), and
 * unused ceiling costs nothing.
 */
const REASONING_HEADROOM_TOKENS = 2048;

function effectiveMaxTokens(params: AiCallParams): number {
  return params.thinking === "off" ? params.maxTokens + REASONING_HEADROOM_TOKENS : params.maxTokens;
}

/** DeepSeek is text-only through this adapter. Vision content never reaches here — see the registry. */
function toText(content: string | AiContentBlock[]): string {
  if (typeof content === "string") return content;
  const nonText = content.find((b) => b.type !== "text");
  if (nonText) {
    throw new Error("DeepSeek is text-only — is feature ke liye image/PDF bhejna support nahi hai.");
  }
  return content.map((b) => (b as Extract<AiContentBlock, { type: "text" }>).text).join("\n\n");
}

export async function callDeepSeek(params: AiCallParams): Promise<AiCallResult> {
  // /admin/ai-settings first, DEEPSEEK_API_KEY as the fallback — see lib/ai/credentials.ts.
  const apiKey = await getProviderKey("DEEPSEEK");
  if (!apiKey) {
    return failureOf(
      "MODEL_NOT_CONFIGURED",
      "DeepSeek key set nahi hai — /admin/ai-settings se daalein ya DEEPSEEK_API_KEY set karein.",
    );
  }

  let userContent: string;
  try {
    userContent = toText(params.content);
  } catch (err) {
    return failureOf("MODEL_UNSUPPORTED", err instanceof Error ? err.message : String(err));
  }

  // `maxRetries: 0` — the SDK would otherwise retry a 503 twice on its own,
  // tripling the wait before the router could move to a model that works.
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
    timeout: defaultTimeoutMs(params),
    maxRetries: 0,
  });

  try {
    const body = {
      model: params.model,
      // DeepSeek mirrors the older OpenAI-compatible surface — `max_tokens`,
      // not the newer `max_completion_tokens` first-party OpenAI uses.
      max_tokens: effectiveMaxTokens(params),
      // Not in the OpenAI SDK's types; the SDK forwards unknown body fields
      // as-is, which is exactly what DeepSeek's API reads.
      ...(params.thinking === "off" ? { thinking: { type: "disabled" } } : {}),
      ...(params.jsonSchema ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        { role: "system" as const, content: withJsonInstruction(params.system, params.jsonSchema) },
        { role: "user" as const, content: userContent },
      ],
    };
    const response = await client.chat.completions.create(
      body as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );

    const choice = response.choices[0];
    if (!choice) {
      return failureOf("MODEL_EMPTY_RESPONSE", "AI se koi choice nahi mili.", { reason: "no-choice" });
    }

    const u = response.usage as
      | (OpenAI.CompletionUsage & { completion_tokens_details?: { reasoning_tokens?: number } })
      | undefined;
    const usage = { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 };

    if (choice.finish_reason === "content_filter") {
      return failureOf("MODEL_REFUSED", "AI ne is input par jawab dene se mana kar diya.", { usage });
    }

    const text = choice.message?.content;
    if (!text) {
      // `finish_reason` is the whole diagnosis. "length" means the budget ran
      // out (reasoning included); "stop" with no content is DeepSeek's
      // documented sporadic JSON-mode blank. Opposite fixes, so both numbers
      // travel with the failure.
      return failureOf(
        "MODEL_EMPTY_RESPONSE",
        `AI se koi content nahi mila (finish_reason=${choice.finish_reason ?? "null"}, reasoning_tokens=${u?.completion_tokens_details?.reasoning_tokens ?? "?"}, output_tokens=${usage.outputTokens}).`,
        { usage, reason: `finish:${choice.finish_reason ?? "null"}` },
      );
    }

    return { ok: true, text, usage, finishReason: choice.finish_reason ?? null };
  } catch (err) {
    return failureFromError("DEEPSEEK", err);
  }
}
