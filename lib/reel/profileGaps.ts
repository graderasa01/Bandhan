/**
 * Which sections of somebody's profile are mostly empty — the reel card's
 * "3 details missing", decided in one pure place.
 *
 * Pure and client-safe so `scripts/reel-workspace-check.ts` can prove the two
 * rules that matter without a database:
 *
 *  1. **Only a fixed, harmless vocabulary.** A gap is a *section* ("Family
 *     details"), never a field, and caste / religion / gotra / manglik are not
 *     in any section. Telling a viewer "caste nahi batayi" would be the app
 *     reaching for caste on their behalf, which D-33 forbids. Photos are not a
 *     section either — whether a locked profile has a photo is exactly what the
 *     photo gate may not say.
 *  2. **"Mostly empty", not "one blank".** A section is a gap only when more
 *     than half of its fields are unanswered. One skipped question is not news
 *     about a person; an empty family section is.
 *
 * The input is the list of field keys `computeCompletion` already reports as
 * missing (`missingFullFields`), so "missing" here means exactly what it
 * means on the member's own dashboard — and a field somebody filled but kept
 * private is filled, never missing.
 */

import type { ReelProfileGap } from "@/lib/contracts/reel";

/**
 * The sections, in the order a family deciding on a rishta would want to know
 * about them. That order is also the priority when more than three are empty.
 */
export const PROFILE_GAP_SECTIONS: readonly { gap: ReelProfileGap; fields: readonly string[] }[] = [
  { gap: "family", fields: ["familyType", "fatherOccupation", "motherOccupation", "siblings"] },
  { gap: "about", fields: ["aboutMe"] },
  { gap: "expectations", fields: ["partnerAgeRange", "partnerWorkExpectation", "partnerEducation", "partnerCityPreference"] },
  { gap: "values", fields: ["familyValues", "relocateWilling", "dealBreakers"] },
  { gap: "lifestyle", fields: ["hobbies", "smoking", "drinking", "languagesKnown"] },
];

/** Never a gap, whatever the catalog grows into — see rule 1 above. */
export const NEVER_A_GAP_FIELDS: readonly string[] = ["caste", "religion", "gotra", "manglikStatus", "photos"];

const MAX_GAPS = 3;

/**
 * The sections that are mostly empty, most decision-relevant first.
 *
 * @param missingKeys field keys the completion engine reports as unanswered
 */
export function profileGapsFrom(missingKeys: readonly string[]): ReelProfileGap[] {
  const missing = new Set(missingKeys);
  const out: ReelProfileGap[] = [];
  for (const { gap, fields } of PROFILE_GAP_SECTIONS) {
    const empty = fields.filter((f) => missing.has(f)).length;
    // Strictly more than half: a four-field section with two blanks is a
    // profile that answered half of it, and that is not "missing".
    if (empty * 2 > fields.length) out.push(gap);
    if (out.length === MAX_GAPS) break;
  }
  return out;
}
