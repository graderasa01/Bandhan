import { asList, firstValue, type SignalAnswerMap } from "@/lib/profile/signalAnswers";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * "Has this person actually told us what they want?" — answered once, here.
 *
 * Pure TypeScript: no prisma, no AI, no `server-only`, for the same reason
 * `preferenceScore.ts` is — the reel's ranking loop, the fit card, Grio's
 * Samajh Map and a check script all need the same answer and none of them
 * may disagree with the others.
 *
 * ## Why a row is not a preference
 *
 * `ProfilePartnerPreferences` is created on the very first draft save
 * (`fieldMapping.ts` fills `lookingForGender` from the person's own gender),
 * so every live profile has a row. For a long time the app read the row's
 * *existence* as "preferences filled" — Samajh Map said "Aapki pasand bhari
 * hui hai", and every per-component scorer answered "no preference stated"
 * with 100. A viewer who had said nothing therefore matched everybody at
 * "100% Preferences", which is not a score, it is the absence of one.
 *
 * So this module counts *stated* preferences — values a person chose that
 * actually constrain who they want — and ignores:
 *
 *   - the auto-derived `lookingForGender`;
 *   - the neutral answers the catalog offers on purpose ("Kahin bhi",
 *     "Koi farak nahi", "Unki choice"): real answers, zero constraint;
 *   - empty strings, empty arrays, nulls.
 *
 * ## Three states, never a percentage
 *
 *   NOT_PROVIDED — nothing stated. No preference score exists for this person;
 *                  the reel shows general suggestions and says so.
 *   PARTIAL      — something stated, but fewer than `MIN_COMPARABLE_SIGNALS`
 *                  signals could be compared. Still no percentage: one
 *                  comparison is an anecdote, not a match rate.
 *   COMPARABLE   — enough real signals compared to show a calculated result.
 *
 * The viewer-level assessment (`assessPartnerPreferences`) only knows what
 * was *stated*; whether a given pair is COMPARABLE also depends on what the
 * candidate has filled, which is why `scorePreferenceMatch` re-derives the
 * state per pair with `preferenceEvidenceState`.
 */

export type PreferenceEvidenceState = "NOT_PROVIDED" | "PARTIAL" | "COMPARABLE";

/**
 * Every preference signal the ranking can compare. Kept as a closed union so
 * the fit card, the check script and the reel banner can name them without
 * inventing labels of their own.
 */
export type PreferenceSignalKey =
  | "age"
  | "city"
  | "education"
  | "religion"
  | "caste"
  | "manglik"
  | "dealBreakers"
  | "children"
  | "living"
  | "relocation"
  | "partnerCareer";

export const PREFERENCE_SIGNAL_LABEL: Record<PreferenceSignalKey, string> = {
  age: "Partner ki umar",
  city: "Sheher",
  education: "Shiksha",
  religion: "Dharm",
  caste: "Jaati / community",
  manglik: "Manglik",
  dealBreakers: "Non-negotiables",
  children: "Bachche",
  living: "Shaadi ke baad ghar",
  relocation: "Relocation",
  partnerCareer: "Partner ka career",
};

/**
 * Comparisons needed before a percentage may be shown or used in ranking.
 *
 * Two, not one: the "2 pasand batayein" prompt asks for exactly an age range
 * and a city preference, and both compare against nearly every live profile
 * (date of birth and city are required to go live). Answering that prompt is
 * therefore enough to turn a NOT_PROVIDED reel into a COMPARABLE one — a
 * threshold the user cannot reach with two answers would make the prompt a lie.
 */
export const MIN_COMPARABLE_SIGNALS = 2;

/**
 * The catalog's own "I have no preference" answers. A person who picked one of
 * these answered the question — and the answer was "anyone". That is a real
 * choice to respect, not evidence to score on.
 */
export const NEUTRAL_PREFERENCE_VALUES: ReadonlySet<string> = new Set([
  "Kahin bhi",
  "Koi farak nahi",
  "koi farak nahi",
  // partnerCareerExpectation's two deliberate non-opinions
  "Unki choice",
  "Discuss together",
  // partnerWorkExpectation's two
  "Unki marzi",
  "Baat kar ke tay karenge",
]);

export function isNeutralPreference(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length === 0 || NEUTRAL_PREFERENCE_VALUES.has(v) || NEUTRAL_PREFERENCE_VALUES.has(v.toLowerCase());
}

/** Cities the viewer named, minus the "anywhere" answer. Empty means no city preference. */
export function statedCities(prefs: ProfileWithSubTables["partnerPreferences"]): string[] {
  return (prefs?.preferredCities ?? []).map((c) => c.trim()).filter((c) => c.length > 0 && !isNeutralPreference(c));
}

export interface StatedPreference {
  key: PreferenceSignalKey;
  label: string;
}

/**
 * What the viewer has told the app about the partner they want — pair-
 * independent, so it can be shown on their own screens ("aapne 3 pasand
 * batayi hain") and used to decide whether the reel may claim a preference
 * match at all.
 *
 * `viewerSignals` is optional because some callers (Samajh Map's cheap read)
 * only hold the profile row; without it the four Marriage Intelligence
 * preferences simply are not counted, which errs on the side of NOT_PROVIDED —
 * the honest direction.
 */
export function statedPartnerPreferences(
  profile: Pick<ProfileWithSubTables, "partnerPreferences">,
  viewerSignals?: SignalAnswerMap,
): StatedPreference[] {
  const prefs = profile.partnerPreferences;
  const out: StatedPreference[] = [];
  const add = (key: PreferenceSignalKey) => out.push({ key, label: PREFERENCE_SIGNAL_LABEL[key] });

  if (prefs?.minAge != null || prefs?.maxAge != null) add("age");
  if (statedCities(prefs).length > 0) add("city");
  if (!isNeutralPreference(prefs?.educationPreference)) add("education");
  if (!isNeutralPreference(prefs?.religionPreference)) add("religion");
  if (!isNeutralPreference(prefs?.castePreference)) add("caste");
  if (!isNeutralPreference(prefs?.manglikPreference)) add("manglik");

  const dealBreakerText = (prefs?.dealBreakers ?? []).join(" ").trim();
  const dealBreakerCodes = viewerSignals ? asList(viewerSignals.get("dealBreakerCodes")?.value) : [];
  if (dealBreakerText.length > 0 || dealBreakerCodes.length > 0) add("dealBreakers");

  if (viewerSignals) {
    if (firstValue(viewerSignals.get("childrenPreference")?.value)) add("children");
    if (firstValue(viewerSignals.get("postMarriageLivingPlan")?.value)) add("living");
    if (firstValue(viewerSignals.get("relocationBoundary")?.value)) add("relocation");
    if (!isNeutralPreference(firstValue(viewerSignals.get("partnerCareerExpectation")?.value))) add("partnerCareer");
  }
  // The older `partnerWorkExpectation` field maps onto the same career
  // question (see `derivedSignals`); when a caller has no signal map it is the
  // only place that answer lives, so read it directly rather than lose it.
  else if (!isNeutralPreference(prefs?.partnerWorkExpectation)) add("partnerCareer");

  return out;
}

/** The one-line question every surface used to answer by testing `partnerPreferences !== null`. */
export function hasMeaningfulPartnerPreferences(
  profile: Pick<ProfileWithSubTables, "partnerPreferences">,
  viewerSignals?: SignalAnswerMap,
): boolean {
  return statedPartnerPreferences(profile, viewerSignals).length > 0;
}

/** Stated → compared → state. The same rule for the viewer-level and the per-pair answer. */
export function preferenceEvidenceState(statedCount: number, comparedCount: number): PreferenceEvidenceState {
  if (statedCount === 0) return "NOT_PROVIDED";
  return comparedCount >= MIN_COMPARABLE_SIGNALS ? "COMPARABLE" : "PARTIAL";
}

export interface PreferenceAssessment {
  state: PreferenceEvidenceState;
  stated: StatedPreference[];
}

/**
 * The viewer's own standing, before any candidate is involved: how many
 * preferences they have stated, and whether that is enough for the reel to
 * ever compute a preference match. A COMPARABLE viewer can still meet a
 * PARTIAL pair (a candidate who left the compared fields blank).
 */
export function assessPartnerPreferences(
  profile: Pick<ProfileWithSubTables, "partnerPreferences">,
  viewerSignals?: SignalAnswerMap,
): PreferenceAssessment {
  const stated = statedPartnerPreferences(profile, viewerSignals);
  return { state: preferenceEvidenceState(stated.length, stated.length), stated };
}
