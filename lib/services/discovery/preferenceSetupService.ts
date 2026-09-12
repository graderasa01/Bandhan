import "server-only";
import { prisma } from "@/lib/db/prisma";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { saveDraft } from "@/lib/services/profile/draftService";
import { DISCOVER_MAX_AGE, type DiscoverFilters } from "@/lib/discovery/contract";

/**
 * "Isse meri preference me save karein" — the one explicit bridge from a
 * *temporary* Discover search to the *permanent* `ProfilePartnerPreferences`.
 *
 * Kept deliberately narrow. A search filter is scoped to one search; the saved
 * preference feeds the daily Reel, the fit card and Grio's picture of what the
 * user wants. Silently promoting every search into a preference would make a
 * one-off "Delhi ki teacher dhoondho" reshape the reel for weeks, so nothing
 * here runs without the user tapping the save action, and only the three
 * things the first-use card asked for cross over: who they are looking for,
 * the age range, and the location.
 *
 * ## Why the age range is snapped
 *
 * `partnerAgeRange` is a *select* in the profile catalog ("21–25", "23–27",
 * "25–29", "27–32", "30–35", "35+"). `isAnswered` treats a select value that
 * is not one of its options as unanswered — so storing a raw "24–30" would
 * make the profile deck ask the question again and quietly overwrite it
 * (see the 2026-08-31 note on the Smart Profile Deck). The exact numbers the
 * user searched with stay on the search; the *saved* preference is the catalog
 * option with the largest overlap, and the caller tells the user which one.
 */

export interface PreferenceSaveInput {
  lookingForGender?: "Ladka" | "Ladki";
  minAge?: number;
  maxAge?: number;
  cities?: string[];
  states?: string[];
}

export interface PreferenceSaveResult {
  ok: true;
  saved: { lookingForGender: string | null; ageRange: string | null; cities: string[] };
}

function optionBounds(option: string): [number, number] | null {
  const plus = option.match(/^(\d+)\+$/);
  if (plus) return [Number(plus[1]), DISCOVER_MAX_AGE];
  const range = option.match(/^(\d+)[–-](\d+)$/);
  if (range) return [Number(range[1]), Number(range[2])];
  return null;
}

/** The catalog option covering most of [min, max]; ties go to the narrower option. */
export function snapAgeRangeToCatalog(minAge: number | undefined, maxAge: number | undefined): string | null {
  if (minAge == null && maxAge == null) return null;
  const lo = minAge ?? Math.max(18, (maxAge ?? 30) - 5);
  const hi = maxAge ?? Math.min(DISCOVER_MAX_AGE, lo + 5);
  const options = FIELD_BY_KEY.partnerAgeRange?.options ?? [];
  let best: { option: string; overlap: number; width: number } | null = null;
  for (const option of options) {
    const b = optionBounds(option);
    if (!b) continue;
    const overlap = Math.max(0, Math.min(hi, b[1]) - Math.max(lo, b[0]) + 1);
    const width = b[1] - b[0];
    if (!best || overlap > best.overlap || (overlap === best.overlap && width < best.width)) best = { option, overlap, width };
  }
  return best && best.overlap > 0 ? best.option : null;
}

export function preferenceInputFromFilters(filters: DiscoverFilters): PreferenceSaveInput {
  return {
    lookingForGender: filters.lookingForGender,
    minAge: filters.minAge,
    maxAge: filters.maxAge,
    cities: filters.cities,
    states: filters.states,
  };
}

export async function savePartnerPreferenceFromSearch(userId: string, input: PreferenceSaveInput): Promise<PreferenceSaveResult | { ok: false; message: string }> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, message: "Pehle apni profile banaiye." };

  const ageRange = snapAgeRangeToCatalog(input.minAge, input.maxAge);
  // "Delhi NCR" is a catalog option for the city preference; other states are
  // not, so a state-level search saves as its name — `scoreCityMatch` compares
  // strings, and an unmatched string is a soft 40, never an exclusion.
  const cities = [...new Set([...(input.cities ?? []), ...(input.states ?? [])])].slice(0, 12);

  const draft: Record<string, string> = {};
  if (ageRange) draft.partnerAgeRange = ageRange;
  if (cities.length) draft.partnerCityPreference = cities.join(", ");
  if (Object.keys(draft).length > 0) await saveDraft(userId, draft);

  if (input.lookingForGender) {
    await prisma.profilePartnerPreferences.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, lookingForGender: input.lookingForGender },
      update: { lookingForGender: input.lookingForGender },
    });
  }

  const prefs = await prisma.profilePartnerPreferences.findUnique({ where: { profileId: profile.id } });
  return {
    ok: true,
    saved: {
      lookingForGender: prefs?.lookingForGender ?? null,
      ageRange,
      cities: prefs?.preferredCities ?? [],
    },
  };
}
