// D-11 locked feature ladder — capability-based, not quantity-only. Names and
// features never change from an admin panel; only Plan.priceInPaise does
// (see lib/services/plans/planService.ts). Keeping the ladder here as code,
// not DB rows, is what makes D-11 actually locked rather than editable.
import type { PlanCode } from "@prisma/client";

export const PLAN_ORDER: PlanCode[] = ["FREE", "BASIC", "STANDARD", "PREMIUM"];

export const PLAN_NAMES: Record<PlanCode, string> = {
  FREE: "Free",
  BASIC: "Basic",
  STANDARD: "Standard",
  PREMIUM: "Premium",
};

export const PLAN_DURATION_LABEL: Record<PlanCode, string> = {
  FREE: "hamesha",
  BASIC: "per month",
  STANDARD: "per month",
  PREMIUM: "per month",
};

export type PlanFeatureSet = {
  reelPerDay: number;
  interestsPerMonth: number | null; // null = unlimited
  chat: boolean;
  aiAskPerDay: number | null; // null = unlimited
  familySeats: number;
  deepDimensions: number; // out of 13
  boost: boolean;
  readReceipts: boolean;
  priorityVerification: boolean;
  assistedMatchmaker: boolean;
  /**
   * Added alongside the profile-activity panel: everyone is told *how many*
   * people shortlisted them, but only paid plans see *who*. The count is the
   * honest signal; the identity is the upgrade. Free tier still never sees a
   * fabricated number — it sees the real count, blurred faces, and nothing else.
   */
  admirerIdentity: boolean;
  /**
   * Whether *viewer* identity (the "Viewed You" stat) can be seen — deliberately
   * a stricter, Premium-only gate than `admirerIdentity`. `viewers` counts every
   * distinct swipe direction including LEFT (rejected), which the original
   * design (`admirerService.ts`) never surfaced by name at any plan — "telling
   * someone who rejected them is cruel and buys nothing." Devesh explicitly
   * overrode that for a Premium-only reveal (2026-08-02, see D-27) rather than
   * opening it at Standard like admirerIdentity — the higher price floor is the
   * deliberate friction on a more sensitive signal, not an oversight (D-15).
   */
  viewerIdentity: boolean;
  /**
   * Whether a *received* voice note can be opened. Sending is not gated here —
   * it costs an Interest from `interestsPerMonth`, which is already the app's
   * one anti-spam budget, and adding a second quota for the same act would
   * just be two numbers to reconcile.
   *
   * Free users are not locked out permanently: a VOICE_UNLOCK reward grant
   * opens one note without an upgrade (see rewardService). That is the
   * deliberate shape — the free tier gets to experience the thing occasionally,
   * which is what makes the paid version legible rather than abstract.
   */
  voiceUnlock: boolean;
  /**
   * Deterministic photo clean-up (brightness/sharpen/denoise via `sharp`) for
   * the Reel — never generative, never fabricated (D-32 spirit: a real
   * computed transform, not a hallucinated one). Free on every plan,
   * including FREE — near-zero marginal cost (`sharp` only, no API call), so
   * there's no real reason to gate it. The paid tier is `photoUltraEnhance`
   * below, not this one.
   */
  photoEnhance: boolean;
  /**
   * Generative "ultra realistic" relight — a real image-generation model
   * (OpenAI or Gemini, never Anthropic/DeepSeek — see `photoUltraEnhance` in
   * lib/ai/models.ts) redraws the lighting on the owner's own photo. Gated
   * separately from and above `photoEnhance`: that one is free on every plan
   * (near-zero marginal cost, `sharp` only), this one bills a real API call
   * per use, so it sits at the top of the ladder with `priorityVerification`/
   * `assistedMatchmaker` rather than being free like `photoEnhance`. Also
   * capped at `ULTRA_ENHANCE_DAILY_LIMIT` (4/day, lib/services/media/
   * photoUltraEnhance.ts) regardless of plan — Premium buys access to the
   * tier, not an unlimited budget for it.
   */
  photoUltraEnhance: boolean;
};

export const PLAN_FEATURES: Record<PlanCode, PlanFeatureSet> = {
  FREE: {
    reelPerDay: 3, interestsPerMonth: 5, chat: false, aiAskPerDay: 3,
    familySeats: 1, deepDimensions: 3, boost: false, readReceipts: false,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: false,
    viewerIdentity: false, voiceUnlock: false, photoEnhance: true, photoUltraEnhance: false,
  },
  BASIC: {
    reelPerDay: 5, interestsPerMonth: 50, chat: true, aiAskPerDay: 15,
    familySeats: 2, deepDimensions: 13, boost: false, readReceipts: false,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: false,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
  },
  STANDARD: {
    reelPerDay: 15, interestsPerMonth: 150, chat: true, aiAskPerDay: null,
    familySeats: 4, deepDimensions: 13, boost: true, readReceipts: true,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: true,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
  },
  PREMIUM: {
    reelPerDay: 30, interestsPerMonth: null, chat: true, aiAskPerDay: null,
    familySeats: 6, deepDimensions: 13, boost: true, readReceipts: true,
    priorityVerification: true, assistedMatchmaker: true, admirerIdentity: true,
    viewerIdentity: true, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: true,
  },
};

/**
 * Runtime type of each ladder key.
 *
 * Needed because an admin can override a single capability from
 * /admin/features, and the value arrives as text over HTTP — something has to
 * say whether "15" is legal for this key and what `null` means. Declared as a
 * `Record<keyof PlanFeatureSet, …>` so adding a ladder key without classifying
 * it is a compile error, not a runtime surprise.
 *
 * `nullableNumber` = null means unlimited (never "zero").
 */
export type CapabilityValueType = "boolean" | "number" | "nullableNumber";

export const PLAN_FEATURE_TYPES: Record<keyof PlanFeatureSet, CapabilityValueType> = {
  reelPerDay: "number",
  interestsPerMonth: "nullableNumber",
  chat: "boolean",
  aiAskPerDay: "nullableNumber",
  familySeats: "number",
  deepDimensions: "number",
  boost: "boolean",
  readReceipts: "boolean",
  priorityVerification: "boolean",
  assistedMatchmaker: "boolean",
  admirerIdentity: "boolean",
  viewerIdentity: "boolean",
  voiceUnlock: "boolean",
  photoEnhance: "boolean",
  photoUltraEnhance: "boolean",
};

export const PLAN_FEATURE_LABELS: Record<keyof PlanFeatureSet, string> = {
  reelPerDay: "Rishta Reel / din",
  interestsPerMonth: "Interest / month",
  chat: "Chat unlock",
  aiAskPerDay: "AI se poocho / din",
  familySeats: "Family Circle seats",
  deepDimensions: "Deep Profile dimensions",
  boost: "Profile boost",
  readReceipts: "Read receipts",
  priorityVerification: "Priority verification",
  assistedMatchmaker: "Assisted matchmaker",
  admirerIdentity: "Kisne shortlist kiya — naam",
  viewerIdentity: "Kisne profile dekhi — naam",
  voiceUnlock: "Aayi hui Voice Note kholna",
  photoEnhance: "AI Photo Enhance",
  photoUltraEnhance: "AI Ultra Realistic Enhance",
};

export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURE_TYPES) as (keyof PlanFeatureSet)[];

/** Human-readable feature bullets for plan cards, in the order M09 §6 lists them. */
export function planFeatureBullets(code: PlanCode): string[] {
  const f = PLAN_FEATURES[code];
  const bullets = [
    `Roz ${f.reelPerDay} rishtey`,
    f.interestsPerMonth === null ? "Unlimited interest" : `${f.interestsPerMonth} interest/month`,
    f.chat ? "Chat unlock" : "Chat locked",
    f.aiAskPerDay === null ? "AI se unlimited sawaal" : `AI se ${f.aiAskPerDay} sawaal/din`,
    `${f.familySeats} family seat${f.familySeats > 1 ? "s" : ""}`,
  ];
  if (f.boost) bullets.push("Profile boost");
  if (f.photoEnhance) bullets.push("AI Photo Enhance");
  if (f.photoUltraEnhance) bullets.push("AI Ultra Realistic Enhance");
  if (f.priorityVerification) bullets.push("Priority verification");
  if (f.assistedMatchmaker) bullets.push("Assisted matchmaker");
  return bullets;
}

/** D-13: ₹500 off Basic, first month only — derived from the live price so it
 * can never drift if admin changes Basic's price from /admin/pricing. */
export const PARTNER_FIRST_MONTH_DISCOUNT_PAISE = 50000;

/**
 * D-11's comparison matrix, derived from PLAN_FEATURES rather than retyped —
 * a second hand-written copy of the ladder is a second thing to drift.
 * `true`/`false` render as icons; strings render as-is.
 */
export type ComparisonValue = string | boolean;

export const PLAN_COMPARISON_ROWS: { label: string; values: Record<PlanCode, ComparisonValue> }[] = [
  { label: "Rishta Reel / din", values: mapPlans((f) => String(f.reelPerDay)) },
  { label: "Interest / month", values: mapPlans((f) => (f.interestsPerMonth === null ? "Unlimited" : String(f.interestsPerMonth))) },
  { label: "Chat unlock", values: mapPlans((f) => f.chat) },
  { label: "AI se poocho", values: mapPlans((f) => (f.aiAskPerDay === null ? "Unlimited" : `${f.aiAskPerDay}/din`)) },
  { label: "Family Circle seats", values: mapPlans((f) => String(f.familySeats)) },
  { label: "Deep Profile dimensions", values: mapPlans((f) => (f.deepDimensions === 13 ? "Saare 13" : `${f.deepDimensions} of 13`)) },
  { label: "Kisne shortlist kiya — naam", values: mapPlans((f) => f.admirerIdentity) },
  { label: "Kisne profile dekhi — naam", values: mapPlans((f) => f.viewerIdentity) },
  // Listed from Phase B onward, i.e. from the change that shipped the recorder
  // and the unlock flow — never before (§7.7). Sending is free for everyone and
  // costs an Interest; this row is only about opening one you received.
  { label: "Aayi hui Voice Note kholna", values: mapPlans((f) => f.voiceUnlock) },
  { label: "AI Photo Enhance", values: mapPlans((f) => f.photoEnhance) },
  { label: "AI Ultra Realistic Enhance", values: mapPlans((f) => f.photoUltraEnhance) },
  { label: "Profile boost", values: mapPlans((f) => f.boost) },
  { label: "Read receipts", values: mapPlans((f) => f.readReceipts) },
  { label: "Priority verification", values: mapPlans((f) => f.priorityVerification) },
  { label: "Assisted matchmaker", values: mapPlans((f) => f.assistedMatchmaker) },
];

function mapPlans(pick: (f: PlanFeatureSet) => ComparisonValue): Record<PlanCode, ComparisonValue> {
  return {
    FREE: pick(PLAN_FEATURES.FREE),
    BASIC: pick(PLAN_FEATURES.BASIC),
    STANDARD: pick(PLAN_FEATURES.STANDARD),
    PREMIUM: pick(PLAN_FEATURES.PREMIUM),
  };
}
