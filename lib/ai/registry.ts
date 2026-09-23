import type { AiProviderName } from "@/lib/ai/models";

/**
 * The model registry — every chat/text model the app can call, with what it
 * can actually do *through this app's adapters*, in one place.
 *
 * ## Why this is its own file
 *
 * Model IDs used to live in `AI_PROVIDER_MODELS` as `{ id, label, vision }`,
 * and every other fact about a model lived in prose: that DeepSeek's JSON mode
 * is not schema-enforced (deepseek.ts), that Gemini 3.x reasons by default
 * (gemini.ts), that Anthropic streams past 16k tokens (anthropic.ts). A router
 * cannot read prose, and a fallback that picks "any other model" without these
 * facts is exactly the blind fallback that sends a biodata photo to a
 * text-only model. So the facts are data now, and `AI_PROVIDER_MODELS` is
 * derived from this list (see models.ts) — one source, not two that drift.
 *
 * ## Where the numbers come from
 *
 * Nothing here is remembered or assumed. Each `verified` line names the call
 * that produced it, made against this project's own keys:
 *
 *   • Gemini    — `GET /v1beta/models` (inputTokenLimit / outputTokenLimit)
 *   • Anthropic — `GET /v1/models` (max_input_tokens / max_tokens)
 *   • DeepSeek  — `GET /models` (context_window / max_output_tokens /
 *                 input_modalities), plus a live measurement that
 *                 `thinking: {type: "disabled"}` is honoured (reasoning 154 → 0
 *                 tokens on the same prompt).
 *   • OpenAI    — *not verified*: this deployment has no OpenAI key, so its
 *                 limits are left null rather than filled from memory. The
 *                 router treats null as "unknown", never as "large".
 *
 * Re-run `npx tsx scripts/ai-model-probe.ts --catalog` after any catalog change.
 *
 * Client-safe on purpose (pure data, type-only imports): the admin dropdowns
 * are client components and read the derived catalog directly.
 */

/** How the adapter gets JSON out of the model when a caller passes `jsonSchema`. */
export type JsonSchemaSupport =
  /** Schema-constrained decoding: the reply cannot violate the schema. */
  | "enforced"
  /** Valid JSON guaranteed, the schema is guidance only (OpenAI non-strict). */
  | "steered"
  /** Plain JSON mode with the schema folded into the prompt (DeepSeek). */
  | "prompted";

/** What `AiCallParams.thinking: "off"` actually does on this model. */
export type ThinkingOffSupport =
  /** The provider turns reasoning off (Anthropic `disabled`, Gemini budget 0, DeepSeek `disabled`). */
  | "honoured"
  /** The model does not reason in the first place. */
  | "not-applicable"
  /** Nobody has measured it on this model yet. */
  | "unverified";

export interface ModelCapabilities {
  /** Accepts image/PDF input **through our adapter** — what the provider supports is not the question. */
  vision: boolean;
  jsonSchema: JsonSchemaSupport;
  thinkingOff: ThinkingOffSupport;
  /** The adapter can stream a long reply (only Anthropic's, and only past 16k tokens). */
  streaming: boolean;
  /**
   * Native function/tool calling. `false` everywhere, deliberately: Grio's
   * tools are code-owned markers resolved on the server and client (see
   * lib/contracts/grio.ts), so no provider's tool-calling format is ever used
   * and a fallback never has to match one.
   */
  toolCalling: false;
}

export interface RegisteredModel {
  provider: AiProviderName;
  id: string;
  /** Hinglish label for the admin dropdown. */
  label: string;
  capabilities: ModelCapabilities;
  /** Input tokens, as the provider's own model list reports it. Null = not verified. */
  contextWindow: number | null;
  maxOutputTokens: number | null;
  /** Which call produced the numbers above, and when. Null when nothing was verified. */
  verified: string | null;
  /** Position inside its provider, cheapest first — the order the admin dropdown has always used. */
  costRank: number;
  /**
   * Lower is tried earlier when this model is a *fallback* candidate.
   * A tiebreaker only: live health (a recent success, an active cooldown)
   * always outranks it — see lib/ai/router.ts.
   */
  fallbackRank: number;
  /**
   * False for previews: a bulk switch or an automatic fallback never lands a
   * feature on one (Google retires previews on its own schedule and gives them
   * the smallest free allowances). Still selectable by hand.
   */
  autoAssignable: boolean;
  /** Set when the ID is only kept alive by the provider as an alias of another. */
  aliasOf?: string;
}

const GEMINI_VERIFIED = "2026-09-23 GET /v1beta/models";
const ANTHROPIC_VERIFIED = "2026-09-23 GET /v1/models";
const DEEPSEEK_VERIFIED = "2026-09-23 GET /models + live thinking probe";

const GEMINI_CAPS: ModelCapabilities = {
  vision: true,
  jsonSchema: "enforced",
  thinkingOff: "honoured",
  streaming: false,
  toolCalling: false,
};

const ANTHROPIC_CAPS: ModelCapabilities = {
  vision: true,
  jsonSchema: "enforced",
  thinkingOff: "honoured",
  streaming: true,
  toolCalling: false,
};

/**
 * DeepSeek's `deepseek-flash` lists `image` among its input modalities, but
 * the adapter (deepseek.ts) is text-only and refuses image blocks — so the
 * capability that matters here, "can this app send it a photo", is false.
 * Widening the adapter is a separate change; claiming vision before it exists
 * would route biodata photos to a client that throws on them.
 */
const DEEPSEEK_CAPS: ModelCapabilities = {
  vision: false,
  jsonSchema: "prompted",
  thinkingOff: "honoured",
  streaming: false,
  toolCalling: false,
};

const OPENAI_CAPS: ModelCapabilities = {
  vision: true,
  jsonSchema: "steered",
  thinkingOff: "not-applicable",
  streaming: false,
  toolCalling: false,
};

export const MODEL_REGISTRY: readonly RegisteredModel[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    provider: "ANTHROPIC",
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5 — sabse sasta",
    capabilities: ANTHROPIC_CAPS,
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    verified: ANTHROPIC_VERIFIED,
    costRank: 0,
    fallbackRank: 30,
    autoAssignable: true,
  },
  {
    provider: "ANTHROPIC",
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5 — balanced (default)",
    capabilities: ANTHROPIC_CAPS,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    verified: ANTHROPIC_VERIFIED,
    costRank: 1,
    fallbackRank: 20,
    autoAssignable: true,
  },
  {
    provider: "ANTHROPIC",
    id: "claude-opus-5",
    label: "Claude Opus 5 — sabse capable, mehenga",
    capabilities: ANTHROPIC_CAPS,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    verified: ANTHROPIC_VERIFIED,
    costRank: 2,
    fallbackRank: 40,
    autoAssignable: true,
  },

  // ── OpenAI — no key in this deployment, limits unverified ────────────────
  {
    provider: "OPENAI",
    id: "gpt-4o-mini",
    label: "GPT-4o mini — sasta",
    capabilities: OPENAI_CAPS,
    contextWindow: null,
    maxOutputTokens: null,
    verified: null,
    costRank: 0,
    fallbackRank: 20,
    autoAssignable: true,
  },
  {
    provider: "OPENAI",
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    capabilities: OPENAI_CAPS,
    contextWindow: null,
    maxOutputTokens: null,
    verified: null,
    costRank: 1,
    fallbackRank: 10,
    autoAssignable: true,
  },
  {
    provider: "OPENAI",
    id: "gpt-4o",
    label: "GPT-4o",
    capabilities: OPENAI_CAPS,
    contextWindow: null,
    maxOutputTokens: null,
    verified: null,
    costRank: 2,
    fallbackRank: 30,
    autoAssignable: true,
  },
  {
    provider: "OPENAI",
    id: "gpt-4.1",
    label: "GPT-4.1 — zyada capable",
    capabilities: OPENAI_CAPS,
    contextWindow: null,
    maxOutputTokens: null,
    verified: null,
    costRank: 3,
    fallbackRank: 40,
    autoAssignable: true,
  },

  // ── Gemini ────────────────────────────────────────────────────────────────
  //
  // 2026-08-23: the 2.0 line was retired and three features 404'd in the middle
  // of a dashboard render. 2026-09-12: the whole 2.5 text line answers "no
  // longer available to new users" on this key. `RETIRED_MODEL_REPLACEMENTS`
  // (models.ts) carries stored rows across both. The list below is what
  // `GET /v1beta/models` returned on 2026-09-23 — and note that the list is not
  // proof of life: on the same day 3.7-flash and 3.8-flash answered
  // `503 UNAVAILABLE "high demand"` while 3.6-flash answered 200. That is what
  // the health registry is for; this file only says what *exists*.
  {
    provider: "GEMINI",
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite — sabse sasta",
    capabilities: GEMINI_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 0,
    fallbackRank: 50,
    autoAssignable: true,
  },
  {
    provider: "GEMINI",
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    capabilities: GEMINI_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 1,
    fallbackRank: 60,
    autoAssignable: true,
  },
  {
    provider: "GEMINI",
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    capabilities: GEMINI_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 2,
    fallbackRank: 20,
    autoAssignable: true,
  },
  {
    provider: "GEMINI",
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    capabilities: GEMINI_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 3,
    // First among Gemini fallbacks: the one model that answered on every probe
    // this month (it also carries speech-to-text, see voiceCatalog.ts).
    fallbackRank: 10,
    autoAssignable: true,
  },
  {
    provider: "GEMINI",
    id: "gemini-3.7-flash",
    label: "Gemini 3.7 Flash",
    capabilities: GEMINI_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 4,
    fallbackRank: 30,
    autoAssignable: true,
  },
  {
    provider: "GEMINI",
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash — naya",
    capabilities: GEMINI_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 5,
    fallbackRank: 40,
    autoAssignable: true,
  },
  {
    provider: "GEMINI",
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (preview) — zyada capable",
    // Nobody has measured whether a zero thinking budget is accepted on the
    // Pro preview (2.5 Pro refused one), so this does not claim it.
    capabilities: { ...GEMINI_CAPS, thinkingOff: "unverified" },
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    verified: GEMINI_VERIFIED,
    costRank: 6,
    fallbackRank: 90,
    autoAssignable: false,
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  //
  // 2026-09-23: `GET /models` lists exactly two IDs, `deepseek-flash`
  // (DeepSeek-V4.1-Flash) and `deepseek-v4-pro`. The `deepseek-v4-flash` the
  // catalog used to carry still answers, but the response names its model
  // `deepseek-flash` — it is an alias the provider no longer lists, so stored
  // rows move to the real ID through `RETIRED_MODEL_REPLACEMENTS`.
  {
    provider: "DEEPSEEK",
    id: "deepseek-flash",
    label: "DeepSeek V4.1 Flash — sabse sasta overall",
    capabilities: DEEPSEEK_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 393_216,
    verified: DEEPSEEK_VERIFIED,
    costRank: 0,
    fallbackRank: 20,
    autoAssignable: true,
  },
  {
    provider: "DEEPSEEK",
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    capabilities: DEEPSEEK_CAPS,
    contextWindow: 1_048_576,
    maxOutputTokens: 393_216,
    verified: DEEPSEEK_VERIFIED,
    costRank: 1,
    fallbackRank: 10,
    autoAssignable: true,
  },
];

export const AI_PROVIDERS: readonly AiProviderName[] = ["ANTHROPIC", "OPENAI", "GEMINI", "DEEPSEEK"];

export function registeredModel(provider: AiProviderName, id: string): RegisteredModel | null {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.id === id) ?? null;
}

export function modelsOf(provider: AiProviderName): RegisteredModel[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider).sort((a, b) => a.costRank - b.costRank);
}

/** The `{ id, label, vision }` shape the admin dropdown and the bulk switch have always read. */
export function providerCatalog(): Record<AiProviderName, { id: string; label: string; vision: boolean }[]> {
  return Object.fromEntries(
    AI_PROVIDERS.map((p) => [p, modelsOf(p).map((m) => ({ id: m.id, label: m.label, vision: m.capabilities.vision }))]),
  ) as Record<AiProviderName, { id: string; label: string; vision: boolean }[]>;
}

/** What a call needs from a model — the router's filter. */
export interface ModelRequirements {
  vision: boolean;
  /** Prefer schema-enforcing models, but accept a prompted one when nothing else is left. */
  jsonSchema: boolean;
  /** A rough size of the prompt in tokens, checked against a *known* context window only. */
  approxInputTokens?: number;
}

/** Can this model take this call at all? Unknown limits are not treated as a reason to refuse. */
export function satisfies(model: RegisteredModel, req: ModelRequirements): boolean {
  if (req.vision && !model.capabilities.vision) return false;
  if (req.approxInputTokens && model.contextWindow !== null && req.approxInputTokens > model.contextWindow * 0.9) {
    return false;
  }
  return true;
}
