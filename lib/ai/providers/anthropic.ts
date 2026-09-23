import Anthropic from "@anthropic-ai/sdk";
import { getProviderKey } from "@/lib/ai/credentials";
import { defaultTimeoutMs, type AiCallParams, type AiCallResult, type AiContentBlock } from "./types";
import { failureFromError, failureOf } from "./failure";

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
    return failureOf(
      "MODEL_NOT_CONFIGURED",
      "Anthropic key set nahi hai — /admin/ai-settings se daalein ya ANTHROPIC_API_KEY set karein.",
    );
  }

  // `maxRetries: 0`: the SDK's own two retries would triple the wait on an
  // overloaded (529) model before the router could move to one that answers.
  const client = new Anthropic({ apiKey, timeout: defaultTimeoutMs(params), maxRetries: 0 });
  const streaming = params.maxTokens > 16_000;

  try {
    const request = {
      model: params.model,
      max_tokens: params.maxTokens,
      /*
       * Thinking is ON by default on the models this app runs (Sonnet 5,
       * Opus 5) and its tokens come out of `max_tokens` — so a caller that
       * sized `maxTokens` for its answer alone gets a response that is all
       * reasoning and no content. Callers who know their output is short and
       * schema-shaped opt out; see `AiCallParams.thinking`.
       *
       * `{type: "disabled"}` and not simply omitting the field: on Sonnet 5
       * and Opus 5 an absent `thinking` runs adaptive, so omission is the
       * opposite of the intent. (Haiku 4.5 doesn't think either way, and the
       * option is accepted there too, so this stays correct across the three
       * models /admin/ai-settings can select.)
       */
      ...(params.thinking === "off" ? { thinking: { type: "disabled" as const } } : {}),
      ...(params.jsonSchema
        ? { output_config: { format: { type: "json_schema" as const, schema: params.jsonSchema } } }
        : {}),
      system: [{ type: "text" as const, text: params.system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: toContentBlocks(params.content) }],
    };

    /*
     * The SDK refuses a plain `create()` whose `max_tokens` implies more
     * than ~10 minutes of generation (its own heuristic, ≈21k tokens) and
     * asks for streaming instead. Growth Saathi's campaign package is the
     * one call in the app that large; every other caller stays on the
     * simple path. `finalMessage()` reassembles the same `Message` shape,
     * so nothing below has to know which path ran.
     */
    const response = streaming
      ? await client.messages.stream(request).finalMessage()
      : await client.messages.create(request);

    if (response.stop_reason === "refusal") {
      const u = response.usage;
      return failureOf("MODEL_REFUSED", "AI ne is input par jawab dene se mana kar diya.", {
        usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens },
      });
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
      return failureOf(
        "MODEL_EMPTY_RESPONSE",
        `AI se koi text content nahi mila (stop_reason=${response.stop_reason ?? "null"}, blocks=${response.content.map((b) => b.type).join(",") || "none"}).`,
        { usage, reason: `finish:${response.stop_reason ?? "null"}` },
      );
    }

    return { ok: true, text, usage, finishReason: response.stop_reason ?? null };
  } catch (err) {
    // A stream that dies part-way has no HTTP status of its own — the request
    // was accepted and then the connection or the event stream broke. Named
    // separately so it is not mistaken for the provider refusing the request.
    const status = (err as { status?: unknown })?.status;
    const name = (err as { constructor?: { name?: string } })?.constructor?.name ?? "";
    if (streaming && typeof status !== "number" && !/Timeout|Connection/i.test(name)) {
      return failureOf("MODEL_STREAM_FAILED", err instanceof Error ? err.message : String(err), {
        reason: "stream-broke",
        retryAfterMs: 20_000,
      });
    }
    // Everything else — including the 400 "credit balance is too low" that
    // used to surface as a generic failure — is classified in one place.
    return failureFromError("ANTHROPIC", err);
  }
}
