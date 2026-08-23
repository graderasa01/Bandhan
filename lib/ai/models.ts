/**
 * Model routing in config, never scattered through the code — D-31.
 *
 * Extraction is on Sonnet 5, matching D-31's table.
 *
 * An earlier pass moved it to Haiku 4.5 for cost. Measured side by side on the
 * same Marathi transcript, both models read the fields and named the language
 * correctly, but only Sonnet inferred the two things nobody stated — gender
 * from the feminine verb form, and mother tongue from the language itself.
 * Haiku left 31 fields unresolved where Sonnet left none. On a profile builder
 * those inferences are most of the value, and a one-time ~₹20 against a
 * ₹999/month subscription is not where cost should be optimised.
 *
 * Cheaper routing belongs on the per-swipe paths (intent detection stays on
 * Haiku per D-31), not on the one flow that decides whether a user finishes
 * onboarding at all.
 *
 * Multi-provider (Anthropic/OpenAI/Gemini/DeepSeek): this file is only the
 * *default* route per feature — the live route an admin has set from
 * /admin/ai-settings lives in the `AiFeatureConfig` DB table
 * (lib/ai/aiConfigService.ts) and wins whenever a row exists.
 * `AI_MODEL_DEFAULTS` below is what seeds that table and what a feature falls
 * back to if its row is ever missing — so it still has to be a real, sane
 * choice, not a placeholder. DeepSeek is deliberately not a default anywhere:
 * it's the cheapest option by a wide margin, but it's text-only (no vision)
 * and its JSON mode has no schema enforcement — admin opts in per feature
 * from the settings page once that tradeoff is acceptable for it.
 */

export type AiFeatureKey =
  | "extraction"
  | "biodataExtraction"
  | "questionTranslation"
  | "bioWriter"
  | "matchExplanation"
  | "askProfile"
  | "icebreaker"
  | "contentModeration"
  | "deepProfileAnalysis"
  | "questionRewrite"
  | "rishtaConcierge"
  | "matchExplain"
  | "photoUltraEnhance";

export type AiProviderName = "ANTHROPIC" | "OPENAI" | "GEMINI" | "DEEPSEEK";

export type AiRoute = { provider: AiProviderName; model: string };

export const AI_MODEL_DEFAULTS: Record<AiFeatureKey, AiRoute> = {
  /** Voice / chat transcript → profile fields. */
  extraction: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /** Biodata PDF or photo → profile fields. Vision-capable model required. */
  biodataExtraction: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /**
   * Re-wording an already-chosen question into the user's language. Small,
   * cached after first use, and sits in front of someone waiting for the next
   * question — so this one defaults to the cheapest tier.
   */
  questionTranslation: { provider: "ANTHROPIC", model: "claude-haiku-4-5" },
  /**
   * Writing the "apne baare me" bio. Defaults to the mid tier because the
   * failure mode here is flattery — inventing "mehnati, zimmedaar, family
   * oriented" that the user never said. Holding a line about what *not* to
   * write is exactly where the cheapest model gives way, and this text goes
   * on a profile strangers judge.
   */
  bioWriter: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /** L3 match reasoning (D-33) — explanation only, never ranking (D-32). */
  matchExplanation: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /** "AI se poocho" (swipe up) — interactive, per D-31. */
  askProfile: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /**
   * Drafts an optional opening line after an Interest is sent. Same tier as
   * matchExplanation/askProfile — short, interactive, and the failure mode is
   * still inventing a detail neither profile stated.
   */
  icebreaker: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /**
   * Screening a voice-note transcript or a typed question before it reaches a
   * stranger. Runs on every send, so it has to be the cheapest thing that can
   * still read Hinglish — and it is a *second* line of defence, behind a
   * deterministic blocklist that already catches contact details and slurs
   * (lib/services/moderation/contentModeration.ts). The model only has to
   * catch what a regex can't: coercion, dowry talk, sexual content phrased
   * politely.
   *
   * Defaults to Haiku rather than DeepSeek despite DeepSeek being cheaper:
   * this call decides whether one real person's words reach another, and
   * DeepSeek's JSON mode has no schema enforcement. Admin can still switch it
   * from /admin/ai-settings once that tradeoff has been measured.
   */
  contentModeration: { provider: "ANTHROPIC", model: "claude-haiku-4-5" },
  /**
   * D-11's `deepDimensions` — 05_ai_spec.md §15's 13 dimension scores,
   * derived from a profile's own fields (bio, lifestyle, family, mindset).
   * Sonnet, not Haiku: the failure mode here is the same one `bioWriter`
   * guards against — inventing confidence from thin signal. §15.3 mandates
   * UNKNOWN when there isn't enough to go on, and that is exactly the
   * discipline a cheaper model is more likely to skip. This score sits on a
   * profile strangers and family judge, same reasoning as `bioWriter`.
   */
  deepProfileAnalysis: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /**
   * Ask Bridge (P7) — softens a typed question's wording before it reaches a
   * stranger. Runs only after `contentModeration` has already approved the
   * text, so like `contentModeration` this is a cheap, high-volume call and
   * defaults to Haiku. Purely cosmetic: a failed or unavailable rewrite still
   * delivers the original, already-safety-checked questionText, so this key
   * never gates delivery the way contentModeration does.
   */
  questionRewrite: { provider: "ANTHROPIC", model: "claude-haiku-4-5" },
  /**
   * AI Rishta Concierge (Phase E) — general matchmaking guidance, not tied to
   * any one profile. Sonnet, same tier as askProfile/icebreaker: this is a
   * back-and-forth conversation a paying user is actively reading, and the
   * failure mode of a cheaper model here is the same one those two guard
   * against — sounding confident about something it has no basis for.
   */
  rishtaConcierge: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /**
   * Rishta Lens — the same Grio chat, scoped to one candidate profile.
   *
   * Its own key rather than sharing `rishtaConcierge`'s for two reasons that
   * both matter operationally: the prompt is several times larger (a whole
   * dossier rides in the volatile half, uncached by design), so folding its
   * spend into the general chat's line would make `/admin/ai-settings` unable
   * to answer "what is the Premium feature actually costing us"; and it is the
   * one Grio surface where a weaker model degrades into inventing reasons for a
   * score, which is the exact failure D-32 exists to prevent.
   */
  matchExplain: { provider: "ANTHROPIC", model: "claude-sonnet-5" },
  /**
   * Generative "ultra realistic" photo relight (Premium-only, separate from
   * the free-ish deterministic `photoEnhance`) — an actual image-editing
   * model redraws pixels from a fixed lighting-fix prompt. **Anthropic is not
   * a valid choice here and never will be**: Claude has no image-output
   * capability on any model (vision is input-only) — this is a hard
   * capability gap, not a cost/quality tradeoff the admin panel can route
   * around. DeepSeek is excluded for the same reason. Only OPENAI and GEMINI
   * ever appear in this feature's admin dropdown — see
   * `AI_IMAGE_EDIT_FEATURES`/`AI_IMAGE_EDIT_PROVIDER_MODELS` below, which is
   * a *separate* catalog from `AI_PROVIDER_MODELS` because these are
   * image-generation models (OpenAI's Images API, Gemini's native image
   * output), not chat-completions models — mixing them into the shared
   * per-provider list would make them wrongly selectable for every text
   * feature too. Model IDs here are current as of this writing but move
   * faster than the chat models above — re-verify against
   * platform.openai.com/docs/models and ai.google.dev/gemini-api/docs/models
   * before the first real (funded) call.
   */
  photoUltraEnhance: { provider: "OPENAI", model: "gpt-image-1" },
};

/** Which features send images/PDFs and therefore need a vision-capable model. */
export const AI_VISION_FEATURES: ReadonlySet<AiFeatureKey> = new Set(["biodataExtraction"]);

export const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = {
  extraction: "Interview transcript → profile fields",
  biodataExtraction: "Biodata PDF/photo → profile fields",
  questionTranslation: "Interview sawaal ka translation",
  bioWriter: `"Apne baare me" bio writer`,
  matchExplanation: "Match reasoning (Rishta Reel)",
  askProfile: `"AI se poocho" (swipe up)`,
  icebreaker: "Interest opening-line suggestion",
  contentModeration: "Voice note / sawaal ki screening",
  deepProfileAnalysis: "Deep Profile — 13 dimension scores",
  questionRewrite: "Ask Bridge — sawaal ki polite rewording",
  rishtaConcierge: "AI Rishta Concierge — matchmaking guidance chat",
  matchExplain: "Rishta Lens — ek rishtey par Grio chat (Premium)",
  photoUltraEnhance: "Photo Ultra Enhance — generative AI relight (Premium)",
};

/**
 * Features whose model is an image-*generation* model (image in + prompt →
 * new image out), not a chat-completions model. These never draw from
 * `AI_PROVIDER_MODELS`/its providers — see `AI_IMAGE_EDIT_PROVIDER_MODELS`.
 */
export const AI_IMAGE_EDIT_FEATURES: ReadonlySet<AiFeatureKey> = new Set(["photoUltraEnhance"]);

/**
 * Separate from `AI_PROVIDER_MODELS` on purpose: these are OpenAI's Images
 * API model and Gemini's native image-output model, called through a
 * completely different endpoint shape (image bytes in, image bytes out) than
 * every chat-completions model above. Only two providers can do this at all
 * (see `photoUltraEnhance`'s comment in AI_MODEL_DEFAULTS) — Anthropic and
 * DeepSeek are never valid here, not merely un-preferred.
 */
export const AI_IMAGE_EDIT_PROVIDER_MODELS: Record<"OPENAI" | "GEMINI", { id: string; label: string }[]> = {
  OPENAI: [{ id: "gpt-image-1", label: "GPT Image 1 (default)" }],
  GEMINI: [{ id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" }],
};

/**
 * Curated per-provider catalog for the /admin/ai-settings dropdown — cheapest
 * first. Anthropic's IDs are pinned against the current model table; OpenAI's,
 * Gemini's, and DeepSeek's are not version-locked the same way here, so
 * re-verify against platform.openai.com/docs/models,
 * ai.google.dev/gemini-api/docs/models, and api-docs.deepseek.com before
 * assuming a listed price tier still matches reality.
 */
export const AI_PROVIDER_MODELS: Record<AiProviderName, { id: string; label: string; vision: boolean }[]> = {
  ANTHROPIC: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — sabse sasta", vision: true },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 — balanced (default)", vision: true },
    { id: "claude-opus-5", label: "Claude Opus 5 — sabse capable, mehenga", vision: true },
  ],
  OPENAI: [
    { id: "gpt-4o-mini", label: "GPT-4o mini — sasta", vision: true },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", vision: true },
    { id: "gpt-4o", label: "GPT-4o", vision: true },
    { id: "gpt-4.1", label: "GPT-4.1 — zyada capable", vision: true },
  ],
  // 2026-08-23: the 2.0 line was retired by Google and started returning
  // "404 … no longer available" on every call — which surfaced as a red error
  // on the dashboard, because three features had been routed to
  // `gemini-2.0-flash-lite` from /admin/ai-settings. These five are what
  // `GET /v1beta/models` actually returned for this project's key on that
  // date; `RETIRED_MODEL_REPLACEMENTS` below handles the stored rows that
  // still pointed at the dead IDs.
  GEMINI: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite — sabse sasta", vision: true },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", vision: true },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", vision: true },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — zyada capable", vision: true },
  ],
  // Text-only (no vision) — never a valid pick for biodataExtraction, see
  // AI_VISION_FEATURES. By far the cheapest tokens of any provider here;
  // JSON mode has no schema enforcement (lib/ai/providers/deepseek.ts),
  // just a guaranteed-valid-JSON best effort.
  DEEPSEEK: [
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash — sabse sasta overall", vision: false },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", vision: false },
  ],
};

/**
 * Models a provider has retired, and what to use instead.
 *
 * A model ID lives in two places: this catalog, and whatever an admin picked
 * and we stored in `ai_feature_config`. Editing the catalog fixes the dropdown
 * and fixes nothing that is already running — which is exactly how three
 * features kept calling `gemini-2.0-flash-lite` for weeks after Google
 * retired it, and how the failure finally showed up: a 404 thrown in the
 * middle of rendering a user's dashboard.
 *
 * `aiConfigService` consults this on every route read, so a retired ID heals
 * itself on the next call rather than waiting for someone to notice. The DB
 * row is migrated too (prisma/migrations) — this map is the safety net for
 * rows written before the migration, and for the next retirement.
 */
export const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-pro",
};

export const AI_LIMITS = {
  extractionMaxTokens: 4096,
  /** A biodata page yields more fields at once than a spoken turn does. */
  biodataMaxTokens: 8192,
  /** Anything larger is a scan, not a biodata — reject before paying for it. */
  biodataMaxBytes: 10 * 1024 * 1024,
} as const;
