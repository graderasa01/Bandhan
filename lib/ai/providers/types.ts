import type { AiProviderName } from "@/lib/ai/models";

/**
 * Provider-agnostic content — the shape every route builds, so a route never
 * imports an Anthropic/OpenAI/Gemini type directly. `image`/`pdf` cover the
 * biodata-upload path; every other feature only ever sends `text`.
 */
export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; base64: string }
  | { type: "pdf"; base64: string; filename?: string };

export type AiCallParams = {
  model: string;
  system: string;
  content: string | AiContentBlock[];
  maxTokens: number;
  /** When set, the provider is asked to return JSON matching this schema. */
  jsonSchema?: Record<string, unknown>;
  /** OpenAI requires a schema name; ignored by the other providers. */
  schemaName?: string;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type AiErrorKind =
  | "not_configured"
  | "rate_limited"
  | "auth_error"
  | "refusal"
  | "unsupported"
  | "upstream_error";

export type AiCallResult =
  | { ok: true; text: string; usage: AiUsage }
  // `usage` is present on a refusal — the provider still billed the tokens
  // it read before declining, so the log has to carry that cost. It's absent
  // on every other error kind, which means the request never completed.
  | { ok: false; kind: AiErrorKind; message: string; usage?: AiUsage };

/** One provider client implements exactly this. */
export type AiProviderClient = {
  name: AiProviderName;
  call(params: AiCallParams): Promise<AiCallResult>;
};

/**
 * Image-editing request — a photo to transform plus a fixed instruction
 * prompt. Deliberately a separate shape from `AiCallParams`: no `jsonSchema`
 * (nothing to structure), no `maxTokens` in the token-budget sense (image
 * models bill per image, not per token) — this is a different capability
 * class, not a variant of the text one. Only `OPENAI`/`GEMINI` implement it;
 * see `photoUltraEnhance` in `lib/ai/models.ts` for why Anthropic/DeepSeek
 * never will.
 */
export type AiImageEditParams = {
  model: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
};

export type AiImageEditResult =
  | { ok: true; imageBase64: string; mimeType: string }
  | { ok: false; kind: AiErrorKind; message: string };
