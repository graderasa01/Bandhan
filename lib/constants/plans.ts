// D-11 locked feature ladder — capability-based, not quantity-only. Keeping it
// here as code, not DB rows, is what makes D-11 actually locked rather than
// editable: plan *names* and every *capability* (chat, boost, identity
// reveals, deep dimensions) are settled here and cannot be moved from an
// admin panel.
//
// Two values are exceptions, both stored on the `Plan` row and both editable
// from /admin/pricing:
//   • `priceInPaise`  — always was (see planService.updatePlanPrice).
//   • `reelPerDay`    — added 2026-08-07 (planService.updatePlanReelPerDay).
//
// `reelPerDay` is a deliberate, narrow crack in the rule, not a precedent for
// opening the rest: how many rishtey a day the reel hands out is the one
// number that has to be tuned against a live candidate pool and a real
// swipe-through rate, and needing a deploy to move it is the wrong loop. The
// numbers below stay the ladder's defaults — a plan with no admin value set
// still reads its count from here, and /admin/pricing's Reset returns it.
// Read the effective value through `getPlanReelLimits()` or a PlanContext,
// never `PLAN_FEATURES[code].reelPerDay` directly, or you will quote the
// default at a user the admin has already moved.
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
  /**
   * The *manual-entry* kundli tool — type a date of birth (+ optional time,
   * place) straight into a form and get a chart back immediately, no profile
   * fields required. The profile-linked kundli at `/user/kundli` (own DOB
   * already on file) and the guna milan shown on a matched profile stay free
   * on every plan, same as they always were — this gates only the shortcut of
   * generating one on the spot for *anyone* without first answering the
   * profile builder's stage-3 birth questions. Same tier split as
   * `voiceUnlock`: locked on FREE, open from BASIC up, with a KUNDLI_UNLOCK
   * reward credit as the same one-time way in FREE already has for a voice
   * note (see rewardService.ts).
   */
  kundliManualEntry: boolean;
  /**
   * See candidates' photos without waiting for a mutual match.
   *
   * This reverses the app's original trust posture, and the reversal was a
   * deliberate call by Devesh (2026-08-07), made after the trade-off was put
   * to him explicitly. What it used to be, so nobody re-derives it as a bug:
   * a photo unlocked *only* at a real mutual match, everywhere — reel,
   * shortlist, profile page, family portal, Circle — on the reasoning that
   * shortlisting or viewing someone is invisible to them, so it could not be
   * allowed to buy a look at them. He was offered an owner-opt-in variant
   * (photo opens only for members whose owner said yes) and a blur-only
   * variant, and chose neither: any paid plan sees every photo.
   *
   * Two things this deliberately did NOT open, because he asked about photos
   * and only photos:
   *   • Caste, gotra, manglik and income still wait for L3 — see
   *     `profileViewData.ts`, where the photo gate is now a separate flag
   *     from `showL3` for exactly this reason.
   *   • The owner's own curated slides and bio note follow the photo, since
   *     they are the same picture set, but nothing else in the L3 field list.
   *
   * FREE still waits for a match. That is the whole product of this key.
   */
  photoUnlockAll: boolean;
  /**
   * Talk to Grio about **one specific rishta** — the "Rishta Lens".
   *
   * What this does and does not buy is the whole point, because the obvious
   * reading of it would break D-32. It does **not** let an AI rank, recommend,
   * or pick anybody: ranking already happened in `pipeline.ts`, deterministically,
   * and Grio never sees more than one candidate in a request (the endpoint takes
   * a single `candidateProfileId`, so comparison is structurally impossible
   * rather than forbidden in prose). What it buys is *interpretation* of a
   * ranking that already ran, in the user's own language.
   *
   * The load-bearing rule is that Grio's dossier can only contain what the
   * viewer can already see with their own eyes on that profile page — the same
   * L1/L2/L3 split `lib/services/profile/visibility.ts` enforces, plus the
   * deterministic score breakdown that `MatchFitCard` shows to **every** plan
   * including FREE. So this key sells understanding, never access: a Premium
   * viewer at L1 still cannot learn a candidate's caste or income through Grio,
   * exactly as they cannot on the page.
   *
   * Premium-only rather than Standard+ because it is the one feature whose
   * marginal cost is a real multi-turn AI conversation per rishta (the free
   * breakdown card costs four queries and no tokens), and because it sits with
   * `assistedMatchmaker` in what it actually is — a matchmaker explaining a
   * match to you, at the tier that already sells human help.
   */
  matchExplain: boolean;
  /**
   * How many new facts Grio will save about this user (`GrioMemory.facts`).
   *
   * A number rather than a boolean because memory is the one Grio capability
   * that gets *better* with depth rather than merely being on or off — eight
   * facts is a matchmaker who has met you a few times, forty is one who has
   * known you for a year, and both are useful.
   *
   * The ladder is a **write** cap only, never a read cap, and that distinction
   * is the whole reason this is documented here rather than inlined. A user
   * who saved 40 facts on Premium and then downgrades keeps every one of them
   * — `getMemory` returns the stored list untouched, only `addMemoryFact`
   * refuses the next one. Capping on read would mean a plan change silently
   * deleted 32 things a person deliberately asked to be remembered, which is
   * data loss dressed as pricing. See `lib/services/grio/memory.ts`.
   *
   * `GRIO_MEMORY_MAX_FACTS` stays the absolute ceiling above this ladder.
   */
  grioMemoryFacts: number;
  /**
   * Talking to Grio out loud — mic in, spoken replies out.
   *
   * Gated where it is because it is the one Grio surface with a *per-utterance*
   * vendor cost: every question is a Sarvam STT call and every spoken answer a
   * TTS call, on top of the model call that already happens. Text chat bills
   * once; voice bills three times for the same turn.
   *
   * Standard rather than Premium because Standard already buys unlimited AI
   * questions (`aiAskPerDay: null`) — voice is how those get *asked* on a phone,
   * so putting it a tier higher would sell someone unlimited questions and then
   * charge again for the natural way to ask them. Premium's own hooks are
   * `matchExplain`, `assistedMatchmaker` and `photoUltraEnhance`.
   *
   * FREE/BASIC are not left mute in the app overall: the profile interview's
   * voice mode is untouched by this key. This gates the *concierge* only.
   */
  grioVoice: boolean;
  /**
   * Browse without appearing in anyone's "Viewed You".
   *
   * The mirror of `viewerIdentity`, and priced at the same tier for the same
   * reason: both are about who gets to know that a look happened. Selling one
   * without the other would be the app taking a side.
   *
   * **Symmetric while it is on** — the user also stops seeing viewer identities
   * of their own (`canSeeViewerIdentity`). The one-way version is the industry
   * default and was rejected deliberately (Devesh, 2026-08-07): a Premium user
   * collecting names while withholding their own is a one-way mirror, not
   * privacy. It hides browsing only; shortlisting stays attributable, because
   * saving somebody is a deliberate act rather than a look.
   */
  incognitoBrowse: boolean;
};

export const PLAN_FEATURES: Record<PlanCode, PlanFeatureSet> = {
  FREE: {
    reelPerDay: 3, interestsPerMonth: 5, chat: false, aiAskPerDay: 3,
    familySeats: 1, deepDimensions: 3, boost: false, readReceipts: false,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: false,
    viewerIdentity: false, voiceUnlock: false, photoEnhance: true, photoUltraEnhance: false,
    kundliManualEntry: false, photoUnlockAll: false, matchExplain: false,
    grioMemoryFacts: 3, grioVoice: false, incognitoBrowse: false,
  },
  BASIC: {
    reelPerDay: 5, interestsPerMonth: 50, chat: true, aiAskPerDay: 15,
    familySeats: 2, deepDimensions: 13, boost: false, readReceipts: false,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: false,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
    kundliManualEntry: true, photoUnlockAll: true, matchExplain: false,
    grioMemoryFacts: 8, grioVoice: false, incognitoBrowse: false,
  },
  STANDARD: {
    reelPerDay: 15, interestsPerMonth: 150, chat: true, aiAskPerDay: null,
    familySeats: 4, deepDimensions: 13, boost: true, readReceipts: true,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: true,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
    kundliManualEntry: true, photoUnlockAll: true, matchExplain: false,
    grioMemoryFacts: 20, grioVoice: true, incognitoBrowse: false,
  },
  PREMIUM: {
    reelPerDay: 30, interestsPerMonth: null, chat: true, aiAskPerDay: null,
    familySeats: 6, deepDimensions: 13, boost: true, readReceipts: true,
    priorityVerification: true, assistedMatchmaker: true, admirerIdentity: true,
    viewerIdentity: true, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: true,
    kundliManualEntry: true, photoUnlockAll: true, matchExplain: true,
    grioMemoryFacts: 40, grioVoice: true, incognitoBrowse: true,
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
  kundliManualEntry: "boolean",
  photoUnlockAll: "boolean",
  matchExplain: "boolean",
  grioMemoryFacts: "number",
  grioVoice: "boolean",
  incognitoBrowse: "boolean",
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
  kundliManualEntry: "Turant Kundli Banayen (manual entry)",
  photoUnlockAll: "Photo bina match ke dekhein",
  matchExplain: "Grio se ek rishtey par baat",
  grioMemoryFacts: "Grio kitni baatein yaad rakhega",
  grioVoice: "Grio se bol kar baat",
  incognitoBrowse: "Incognito — bina dikhe dekhein",
};

export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURE_TYPES) as (keyof PlanFeatureSet)[];

/**
 * Human-readable feature bullets for plan cards, in the order M09 §6 lists them.
 *
 * `effective` carries the one capability an admin can retune (`reelPerDay`,
 * stored on `Plan`) so a pricing page never advertises the ladder default
 * after someone has moved it. Optional on purpose: callers with no DB access
 * still get the honest code-ladder answer rather than a required argument
 * they'd have to invent.
 */
export function planFeatureBullets(
  code: PlanCode,
  effective?: { reelPerDay?: number },
): string[] {
  const f = { ...PLAN_FEATURES[code], ...(effective?.reelPerDay !== undefined ? { reelPerDay: effective.reelPerDay } : {}) };
  const bullets = [
    `Roz ${f.reelPerDay} rishtey`,
    f.interestsPerMonth === null ? "Unlimited interest" : `${f.interestsPerMonth} interest/month`,
    f.chat ? "Chat unlock" : "Chat locked",
    f.aiAskPerDay === null ? "AI se unlimited sawaal" : `AI se ${f.aiAskPerDay} sawaal/din`,
    `${f.familySeats} family seat${f.familySeats > 1 ? "s" : ""}`,
  ];
  // High in the list on purpose — after the reel count this is the most
  // concrete thing a paid plan now buys, and burying it under the AI bullets
  // would undersell the change.
  if (f.photoUnlockAll) bullets.push("Sabki photo — match ka intezaar nahi");
  if (f.boost) bullets.push("Profile boost");
  if (f.photoEnhance) bullets.push("AI Photo Enhance");
  if (f.photoUltraEnhance) bullets.push("AI Ultra Realistic Enhance");
  if (f.grioVoice) bullets.push("Grio se bol kar baat");
  if (f.matchExplain) bullets.push("Grio se ek rishtey par baat");
  if (f.incognitoBrowse) bullets.push("Incognito browsing");
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

/** The one comparison row an admin can move — see this file's header. Exported
 *  so `PlanComparisonTable` can find it by identity instead of retyping the
 *  string and silently missing it if the label is ever reworded. */
export const REEL_PER_DAY_ROW_LABEL = "Rishta Reel / din";

export const PLAN_COMPARISON_ROWS: { label: string; values: Record<PlanCode, ComparisonValue> }[] = [
  { label: REEL_PER_DAY_ROW_LABEL, values: mapPlans((f) => String(f.reelPerDay)) },
  { label: "Interest / month", values: mapPlans((f) => (f.interestsPerMonth === null ? "Unlimited" : String(f.interestsPerMonth))) },
  { label: "Chat unlock", values: mapPlans((f) => f.chat) },
  { label: "AI se poocho", values: mapPlans((f) => (f.aiAskPerDay === null ? "Unlimited" : `${f.aiAskPerDay}/din`)) },
  { label: "Family Circle seats", values: mapPlans((f) => String(f.familySeats)) },
  { label: "Deep Profile dimensions", values: mapPlans((f) => (f.deepDimensions === 13 ? "Saare 13" : `${f.deepDimensions} of 13`)) },
  { label: "Photo bina match ke dekhein", values: mapPlans((f) => f.photoUnlockAll) },
  { label: "Kisne shortlist kiya — naam", values: mapPlans((f) => f.admirerIdentity) },
  { label: "Kisne profile dekhi — naam", values: mapPlans((f) => f.viewerIdentity) },
  // Listed from Phase B onward, i.e. from the change that shipped the recorder
  // and the unlock flow — never before (§7.7). Sending is free for everyone and
  // costs an Interest; this row is only about opening one you received.
  { label: "Aayi hui Voice Note kholna", values: mapPlans((f) => f.voiceUnlock) },
  { label: "AI Photo Enhance", values: mapPlans((f) => f.photoEnhance) },
  { label: "AI Ultra Realistic Enhance", values: mapPlans((f) => f.photoUltraEnhance) },
  { label: "Turant Kundli Banayen (manual entry)", values: mapPlans((f) => f.kundliManualEntry) },
  // Deliberately *below* the free breakdown it builds on: every plan sees the
  // deterministic "ye rishta kyun dikha" card, this row is only the AI
  // conversation on top of it.
  { label: "Grio se ek rishtey par baat", values: mapPlans((f) => f.matchExplain) },
  { label: "Grio kitni baatein yaad rakhega", values: mapPlans((f) => `${f.grioMemoryFacts} baatein`) },
  { label: "Grio se bol kar baat", values: mapPlans((f) => f.grioVoice) },
  { label: "Incognito — bina dikhe dekhein", values: mapPlans((f) => f.incognitoBrowse) },
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
