// The plan ladder's *shape* and its built-in defaults.
//
// ## This file used to be the ladder itself. It isn't any more.
//
// D-11 kept every plan name and every capability here as code precisely so
// they could not be edited from an admin panel — the old header said exactly
// that, and listed `priceInPaise` and `reelPerDay` as the only two cracks.
//
// Devesh reversed that on 2026-08-07, deliberately and after the trade-off was
// put to him: he wants to add a cheaper plan and re-price what each tier
// includes without waiting on a deploy. The catalog now lives in the `plans`
// table (see schema.prisma) and is read through `getPlanCatalog()`.
//
// ## D-90 (2026-09-15): the ladder is gone, the money moves to moments
//
// The three monthly tiers (Basic/Standard/Premium) are retired from sale.
// Almost everything they sold is now on FREE — search, photos (see
// `photoUnlockAll` for the new rule), voice notes, kundli PDF, family seats,
// all 13 Deep Profile dimensions. What still costs money is either a moment
// of real value (opening a chat with one mutual match — a Chat Unlock item,
// not a plan) or a real per-use vendor cost (AI turns, voice, generative
// photo), and the one plan left for sale is **Rishta Pass**: every chat open,
// viewer names + incognito, a bigger AI allowance. Reels and interests are
// deliberately *not* bigger on the Pass — money does not buy spam.
//
// BASIC/STANDARD/PREMIUM stay in this file and in the table because
// subscription rows reference them by value and people are still inside a
// paid month on them. They are inactive and private, so nothing new is sold
// on them, and they keep resolving to exactly what was bought until
// `currentPeriodEnd` (there is no auto-renew, so nobody is charged again).
//
// What this file still owns, and why that matters:
//
//   • `PlanFeatureSet` — the set of capabilities that exist at all. Adding one
//     is still a code change, because something has to *gate* on it.
//   • `PLAN_FEATURE_TYPES` — what a legal value looks like per key, which is
//     what stops "15" arriving over HTTP for a boolean.
//   • `BUILTIN_PLAN_DEFAULTS` — the built-in plans. They seed the table and
//     remain the fallback: a plan row with no `features` JSON, an empty table,
//     or an unreachable DB all resolve to what these say.
//
// So: never read `BUILTIN_PLAN_DEFAULTS[code]` to answer "what can this user
// do" — that skips every admin edit and silently returns nothing at all for a
// plan an admin created. Go through `getPlanCatalog()` / a `PlanContext`.

/**
 * A plan's code. A plain string, not an enum, since 2026-08-07 — an admin can
 * create plans, so there is no closed set to enumerate. Codes are uppercase
 * slugs and are never renamed once live (rows in `subscriptions`, `payments`
 * and `user_entitlement_overrides` reference them by value); a plan is
 * deactivated instead.
 */
import { noopT, type Translate } from "@/lib/i18n/translate";

export type PlanCode = string;

/** The plans that ship with the app and seed the catalog. */
export type BuiltinPlanCode = "FREE" | "BASIC" | "STANDARD" | "PREMIUM" | "PASS";

/**
 * Ladder order of the built-ins. Live ordering comes from `Plan.rank`.
 *
 * PASS sits last on purpose: it is the only plan still sold, so an admin grant
 * of PASS must win `higherOf()` against a lapsed legacy code, and `nextPlanUp()`
 * from any plan resolves to it.
 */
export const BUILTIN_PLAN_ORDER: BuiltinPlanCode[] = ["FREE", "BASIC", "STANDARD", "PREMIUM", "PASS"];

export const BUILTIN_PLAN_NAMES: Record<BuiltinPlanCode, string> = {
  FREE: "Free",
  BASIC: "Basic",
  STANDARD: "Standard",
  PREMIUM: "Premium",
  PASS: "Rishta Pass",
};

export const BUILTIN_PLAN_DURATION_LABEL: Record<BuiltinPlanCode, string> = {
  FREE: "hamesha",
  BASIC: "per month",
  STANDARD: "per month",
  PREMIUM: "per month",
  PASS: "per month",
};

/**
 * Starting prices, used by the seed and by the fallback catalog. The live price
 * is `Plan.priceInPaise`, edited from /admin/pricing.
 */
export const BUILTIN_PLAN_PRICE_PAISE: Record<BuiltinPlanCode, number> = {
  FREE: 0,
  BASIC: 99_900,
  STANDARD: 199_900,
  PREMIUM: 299_900,
  PASS: 49_900,
};

/**
 * The three tiers retired from sale by D-90. Still real codes: a subscription
 * bought before 2026-09-15 keeps resolving to its own feature set until it
 * ends. Never offered, never public.
 */
export const LEGACY_PLAN_CODES: readonly BuiltinPlanCode[] = ["BASIC", "STANDARD", "PREMIUM"];

export function isLegacyPlanCode(code: string): boolean {
  return (LEGACY_PLAN_CODES as readonly string[]).includes(code);
}

export function isBuiltinPlanCode(code: string): code is BuiltinPlanCode {
  return (BUILTIN_PLAN_ORDER as readonly string[]).includes(code);
}

export type PlanFeatureSet = {
  reelPerDay: number;
  interestsPerMonth: number | null; // null = unlimited
  chat: boolean;
  aiAskPerDay: number | null; // null = unlimited
  /**
   * Grio conversation turns that reach a model, per UTC day. `null` = no cap.
   *
   * Added by D-90, when Grio stopped being a paid-plan feature. It used to be
   * gated on `chat`, so FREE never opened it and the paid plans had no cap at
   * all. Opening it to everyone without a number would put every member's
   * conversation on a vendor bill that is metered per call (and, at the time
   * of writing, a free Gemini quota of 20 requests a day per model) — so the
   * door is free and the daily allowance is the honest limit. Turns answered
   * from rows (`matchGrioQuickAnswer`) never reach a model and never count.
   *
   * Counted from `AiInteraction` (`rishta_concierge` + `match_explain`), the
   * same log `aiAskPerDay` counts from — see `getTodayGrioChatCount`.
   */
  grioChatPerDay: number | null;
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
   *
   * D-90: on FREE too. A shortlist is a deliberate, positive act, and "somebody
   * likes you" is the moment a member starts trusting the app — the one moment
   * charging for would feel worst.
   */
  admirerIdentity: boolean;
  /**
   * Whether *viewer* identity (the "Viewed You" stat) can be seen — deliberately
   * a stricter gate than `admirerIdentity`. `viewers` counts every distinct
   * swipe direction including LEFT (rejected), which the original design
   * (`admirerService.ts`) never surfaced by name at any plan — "telling someone
   * who rejected them is cruel and buys nothing." Devesh explicitly overrode
   * that for a Premium-only reveal (2026-08-02, see D-27) rather than opening
   * it at Standard like admirerIdentity — the higher price floor is the
   * deliberate friction on a more sensitive signal, not an oversight (D-15).
   *
   * D-90: Rishta Pass, by Devesh's choice (2026-09-15) — it stays paid rather
   * than going free with everything else, for the same reason it was the
   * strictest gate before.
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
   *
   * D-90: open on FREE. Somebody spent an interest to send it; keeping it shut
   * punished the sender as much as it sold anything to the receiver.
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
   * per use, so it sits on the paid plan rather than being free like
   * `photoEnhance`. Also capped at `ULTRA_ENHANCE_DAILY_LIMIT` (4/day,
   * lib/services/media/photoUltraEnhance.ts) regardless of plan — the plan
   * buys access to the tool, not an unlimited budget for it. (Premium before
   * D-90, Rishta Pass after.)
   */
  photoUltraEnhance: boolean;
  /**
   * The *manual-entry* kundli tool — type a date of birth (+ optional time,
   * place) straight into a form and get a chart back immediately, no profile
   * fields required. The profile-linked kundli at `/user/kundli` (own DOB
   * already on file) and the guna milan shown on a matched profile stay free
   * on every plan, same as they always were. Pure arithmetic over an
   * ephemeris, so D-90 opened it on FREE too.
   */
  kundliManualEntry: boolean;
  /**
   * Take the kundli *off* the screen — a printable PDF of the user's own chart,
   * and the share sheet that sends it to whoever asks for it.
   *
   * Free since D-90: this is exactly the moment a family hands the chart to a
   * pandit, which is the step the app most needs to help rather than meter.
   * Still no reward-credit path — a PDF is a re-export of a chart the user can
   * already read on screen.
   */
  kundliPdfExport: boolean;
  /**
   * See candidates' photos without waiting for a mutual match — **by plan**.
   *
   * History, so nobody re-derives the current rule as a bug: photos first
   * opened *only* at a real mutual match; on 2026-08-07 Devesh opened them to
   * any paid plan (this key). On 2026-09-15 (D-90) he chose the rule that
   * replaced it: a member whose own profile is live and who has an approved
   * photo of their own sees other members' photos, for free, and an owner may
   * keep their own photo to matches only (`Profile.photoPrivacy`). The rule
   * lives in `lib/services/plans/photoAccess.ts`.
   *
   * This key is now `false` on every plan still sold. It stays `true` on the
   * three legacy tiers so a member inside a month they paid for keeps what they
   * bought until it ends — and even then an owner's MATCH_ONLY choice wins.
   *
   * Caste, gotra, manglik and income were never opened by this key and still
   * wait for L3 — see `profileViewData.ts`.
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
   * including FREE. So this key sells understanding, never access: a paying
   * viewer at L1 still cannot learn a candidate's caste or income through Grio,
   * exactly as they cannot on the page.
   *
   * D-90: open on FREE. Its real cost is a multi-turn AI conversation, and that
   * is now bounded by `grioChatPerDay` for everybody rather than by a plan.
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
   * who saved 40 facts on a paid plan and then lapses keeps every one of them
   * — `getMemory` returns the stored list untouched, only `addMemoryFact`
   * refuses the next one. Capping on read would mean a plan change silently
   * deleted things a person deliberately asked to be remembered, which is
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
   * once; voice bills three times for the same turn. (Standard+ before D-90,
   * Rishta Pass after.)
   *
   * FREE is not left mute in the app overall: the profile interview's voice
   * mode is untouched by this key. This gates the *concierge* only.
   */
  grioVoice: boolean;
  /**
   * Browse without appearing in anyone's "Viewed You".
   *
   * The mirror of `viewerIdentity`, and priced at the same place for the same
   * reason: both are about who gets to know that a look happened. Selling one
   * without the other would be the app taking a side.
   *
   * **Symmetric while it is on** — the user also stops seeing viewer identities
   * of their own (`canSeeViewerIdentity`). The one-way version is the industry
   * default and was rejected deliberately (Devesh, 2026-08-07): a paying user
   * collecting names while withholding their own is a one-way mirror, not
   * privacy. It hides browsing only; shortlisting stays attributable, because
   * saving somebody is a deliberate act rather than a look.
   */
  incognitoBrowse: boolean;
  /**
   * The search screen (`/user/discover`) — name/age/city/education/
   * profession/lifestyle filters on top of `ProfilePartnerPreferences`, plus
   * the STRICT/FLEXIBLE and verified-only/min-trust controls in
   * `DiscoverySettings`, plus behaviour-personalised Reel ranking.
   *
   * Paid before D-90 (FREE got a preview of the screen and a refusing API).
   * Open on FREE now: finding people who fit is the first thing anybody comes
   * to a matrimony app for, and a database query has no per-use cost. The AI
   * sentence-to-filters step (`discover_intent`) is the part that does cost,
   * and it counts against `aiAskPerDay`.
   */
  advancedDiscovery: boolean;
};

/**
 * The built-in plans.
 *
 * These seed the `plans` table and are the fallback whenever a plan row has no
 * `features` JSON. `getPlanCatalog()` merges a plan's stored features *over*
 * these, which also means a key added to `PlanFeatureSet` later can never read
 * `undefined` at a gate for a plan that predates it.
 *
 * FREE and PASS are D-90's. BASIC/STANDARD/PREMIUM are the D-11 tiers exactly
 * as they were sold, plus `grioChatPerDay: null` — they never had a Grio cap,
 * and a month somebody already paid for does not grow one.
 */
export const BUILTIN_PLAN_DEFAULTS: Record<BuiltinPlanCode, PlanFeatureSet> = {
  FREE: {
    reelPerDay: 15, interestsPerMonth: 60, chat: false, aiAskPerDay: 10, grioChatPerDay: 10,
    familySeats: 6, deepDimensions: 13, boost: false, readReceipts: true,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: true,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
    kundliManualEntry: true, kundliPdfExport: true, photoUnlockAll: false, matchExplain: true,
    grioMemoryFacts: 20, grioVoice: false, incognitoBrowse: false, advancedDiscovery: true,
  },
  BASIC: {
    reelPerDay: 5, interestsPerMonth: 50, chat: true, aiAskPerDay: 15, grioChatPerDay: null,
    familySeats: 2, deepDimensions: 13, boost: false, readReceipts: false,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: false,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
    kundliManualEntry: true, kundliPdfExport: true, photoUnlockAll: true, matchExplain: false,
    grioMemoryFacts: 8, grioVoice: false, incognitoBrowse: false, advancedDiscovery: true,
  },
  STANDARD: {
    reelPerDay: 15, interestsPerMonth: 150, chat: true, aiAskPerDay: null, grioChatPerDay: null,
    familySeats: 4, deepDimensions: 13, boost: true, readReceipts: true,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: true,
    viewerIdentity: false, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: false,
    kundliManualEntry: true, kundliPdfExport: true, photoUnlockAll: true, matchExplain: false,
    grioMemoryFacts: 20, grioVoice: true, incognitoBrowse: false, advancedDiscovery: true,
  },
  PREMIUM: {
    reelPerDay: 30, interestsPerMonth: null, chat: true, aiAskPerDay: null, grioChatPerDay: null,
    familySeats: 6, deepDimensions: 13, boost: true, readReceipts: true,
    priorityVerification: true, assistedMatchmaker: true, admirerIdentity: true,
    viewerIdentity: true, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: true,
    kundliManualEntry: true, kundliPdfExport: true, photoUnlockAll: true, matchExplain: true,
    grioMemoryFacts: 40, grioVoice: true, incognitoBrowse: true, advancedDiscovery: true,
  },
  // Same reel and interest numbers as FREE, on purpose — see the header.
  PASS: {
    reelPerDay: 15, interestsPerMonth: 60, chat: true, aiAskPerDay: 40, grioChatPerDay: 60,
    familySeats: 6, deepDimensions: 13, boost: false, readReceipts: true,
    priorityVerification: false, assistedMatchmaker: false, admirerIdentity: true,
    viewerIdentity: true, voiceUnlock: true, photoEnhance: true, photoUltraEnhance: true,
    kundliManualEntry: true, kundliPdfExport: true, photoUnlockAll: false, matchExplain: true,
    grioMemoryFacts: 40, grioVoice: true, incognitoBrowse: true, advancedDiscovery: true,
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
  grioChatPerDay: "nullableNumber",
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
  kundliPdfExport: "boolean",
  photoUnlockAll: "boolean",
  matchExplain: "boolean",
  grioMemoryFacts: "number",
  grioVoice: "boolean",
  incognitoBrowse: "boolean",
  advancedDiscovery: "boolean",
};

export const PLAN_FEATURE_LABELS: Record<keyof PlanFeatureSet, string> = {
  reelPerDay: "Rishta Reel / din",
  interestsPerMonth: "Interest / month",
  chat: "Sab chats khuli (bina Chat Unlock)",
  aiAskPerDay: "AI se poocho / din",
  grioChatPerDay: "Grio se sawaal / din",
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
  kundliPdfExport: "Kundli PDF download aur share",
  photoUnlockAll: "Photo bina match ke dekhein (purane plan)",
  matchExplain: "Grio se ek rishtey par baat",
  grioMemoryFacts: "Grio kitni baatein yaad rakhega",
  grioVoice: "Grio se bol kar baat",
  incognitoBrowse: "Incognito — bina dikhe dekhein",
  advancedDiscovery: "Advanced Discovery (search + smart Reel)",
};

export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURE_TYPES) as (keyof PlanFeatureSet)[];

/**
 * Human-readable feature bullets for plan cards.
 *
 * Takes the resolved feature set rather than a plan code: the caller has
 * already been through `getPlanCatalog()`, and looking the code up again here
 * would re-introduce exactly the bug this file's header warns about — a
 * pricing page advertising ladder defaults over an admin's edits, and nothing
 * at all for an admin-created plan.
 *
 * Since D-90 only the Rishta Pass is shown with bullets, so the list leads with
 * what the Pass actually adds on top of FREE rather than restating FREE.
 */
export function planFeatureBullets(f: PlanFeatureSet, t: Translate = noopT): string[] {
  const bullets: string[] = [];
  if (f.chat) bullets.push(t("plans.bullets.allChats", "Har mutual match ki chat khuli — alag se unlock nahi"));
  if (f.viewerIdentity) bullets.push(t("plans.bullets.viewerIdentity", "Kisne aapki profile dekhi — naam ke saath"));
  if (f.incognitoBrowse) bullets.push(t("plans.bullets.incognitoBrowse", "Incognito browsing"));
  bullets.push(
    f.grioChatPerDay === null
      ? t("plans.bullets.grioUnlimited", "Grio se jitne chahein sawaal")
      : `${t("plans.bullets.grioPerDayPrefix", "Grio se")} ${f.grioChatPerDay} ${t("plans.bullets.grioPerDaySuffix", "sawaal/din")}`.trim(),
  );
  if (f.grioVoice) bullets.push(t("plans.bullets.grioVoice", "Grio se bol kar baat"));
  if (f.photoUltraEnhance) bullets.push(t("plans.bullets.photoUltraEnhance", "AI Ultra Realistic Enhance"));
  bullets.push(
    f.aiAskPerDay === null
      ? t("plans.bullets.aiUnlimited", "AI se unlimited sawaal")
      : `${t("plans.bullets.aiPerDayPrefix", "AI se")} ${f.aiAskPerDay} ${t("plans.bullets.aiPerDaySuffix", "sawaal/din")}`.trim(),
  );
  return bullets;
}

/**
 * The comparison matrix, as row *definitions* rather than a fixed column
 * table.
 *
 * It used to be `Record<PlanCode, ComparisonValue>` per row, built by a
 * `mapPlans()` helper that named FREE/BASIC/STANDARD/PREMIUM literally. That
 * shape cannot express an admin-created plan at all. Each row now carries a
 * `pick` function, and the table component maps it across whatever plans it is
 * handed — two, or nine.
 *
 * `true`/`false` render as icons; strings render as-is.
 */
export type ComparisonValue = string | boolean;

/** The one comparison row an admin can move — see this file's header. Exported
 *  so `PlanComparisonTable` can find it by identity instead of retyping the
 *  string and silently missing it if the label is ever reworded. */
export const REEL_PER_DAY_ROW_LABEL = "Rishta Reel / din";

export type ComparisonRowDef = { label: string; pick: (f: PlanFeatureSet) => ComparisonValue };

export const PLAN_COMPARISON_ROWS: ComparisonRowDef[] = [
  { label: REEL_PER_DAY_ROW_LABEL, pick: (f) => String(f.reelPerDay) },
  { label: "Interest / month", pick: (f) => (f.interestsPerMonth === null ? "Unlimited" : String(f.interestsPerMonth)) },
  { label: "Sab chats khuli (bina Chat Unlock)", pick: (f) => f.chat },
  { label: "Grio se sawaal", pick: (f) => (f.grioChatPerDay === null ? "Unlimited" : `${f.grioChatPerDay}/din`) },
  { label: "AI se poocho", pick: (f) => (f.aiAskPerDay === null ? "Unlimited" : `${f.aiAskPerDay}/din`) },
  { label: "Family Circle seats", pick: (f) => String(f.familySeats) },
  { label: "Deep Profile dimensions", pick: (f) => (f.deepDimensions === 13 ? "Saare 13" : `${f.deepDimensions} of 13`) },
  { label: "Advanced Discovery (search + smart Reel)", pick: (f) => f.advancedDiscovery },
  { label: "Kisne shortlist kiya — naam", pick: (f) => f.admirerIdentity },
  { label: "Kisne profile dekhi — naam", pick: (f) => f.viewerIdentity },
  // Sending is free for everyone and costs an Interest; this row is only about
  // opening one you received.
  { label: "Aayi hui Voice Note kholna", pick: (f) => f.voiceUnlock },
  { label: "AI Photo Enhance", pick: (f) => f.photoEnhance },
  { label: "AI Ultra Realistic Enhance", pick: (f) => f.photoUltraEnhance },
  { label: "Turant Kundli Banayen (manual entry)", pick: (f) => f.kundliManualEntry },
  // The chart on screen is free forever; this row is only the PDF you can hand
  // to someone else.
  { label: "Kundli PDF download aur share", pick: (f) => f.kundliPdfExport },
  // Every plan sees the deterministic "ye rishta kyun dikha" card; this row is
  // only the AI conversation on top of it.
  { label: "Grio se ek rishtey par baat", pick: (f) => f.matchExplain },
  { label: "Grio kitni baatein yaad rakhega", pick: (f) => `${f.grioMemoryFacts} baatein` },
  { label: "Grio se bol kar baat", pick: (f) => f.grioVoice },
  { label: "Incognito — bina dikhe dekhein", pick: (f) => f.incognitoBrowse },
  { label: "Read receipts", pick: (f) => f.readReceipts },
];
