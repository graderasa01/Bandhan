/**
 * The reel search sheet's four controls, as filters — D-91.
 *
 * Pure, client-safe and deliberately outside the component: what the sheet
 * produces has to be something `/api/discover/search` accepts, and the only
 * way to know that without a browser is to be able to run this function in a
 * check script against `parseDiscoverFilters` (see
 * `scripts/reel-endless-check.ts`). A filter object assembled inline in JSX
 * could only be verified by clicking.
 *
 * It is a subset of `DiscoverFilters` — never a parallel vocabulary. The full
 * filter sheet on `/user/discover` speaks the same language with more words.
 */

import { DISCOVER_NAME_MIN_CHARS, type DiscoverFilters } from "@/lib/discovery/contract";

/**
 * Age bands, as a person picks one rather than as two number inputs.
 *
 * `max: null` means "and above" and produces no `maxAge` at all — an open top
 * end, not an invented ceiling like 80. The bands stay inside
 * DISCOVER_MIN_AGE..DISCOVER_MAX_AGE, which the check script asserts.
 */
export const REEL_SEARCH_AGE_BANDS: readonly { label: string; min: number; max: number | null }[] = [
  { label: "18–25", min: 18, max: 25 },
  { label: "26–30", min: 26, max: 30 },
  { label: "31–35", min: 31, max: 35 },
  { label: "36+", min: 36, max: null },
];

export interface ReelSearchState {
  /** Raw text from the box — trimmed and length-checked here, not by the caller. */
  name: string;
  /** Index into `REEL_SEARCH_AGE_BANDS`, or null for "any age". */
  band: number | null;
  /** The viewer's own city, when they tapped the chip. Null otherwise. */
  city: string | null;
  verifiedOnly: boolean;
}

/**
 * Every control that is *off* contributes nothing.
 *
 * That is the difference between "no filter" and "a filter matching
 * everything": an empty box must not become `name: ""`, which the schema would
 * reject, and an untapped chip must not become `verifiedOnly: false`, which
 * would read as a deliberate choice to include unverified profiles rather than
 * as no opinion at all.
 */
export function buildReelSearchFilters(state: ReelSearchState): DiscoverFilters {
  const filters: DiscoverFilters = {};

  const name = state.name.trim();
  if (name.length >= DISCOVER_NAME_MIN_CHARS) filters.name = name;

  if (state.band !== null) {
    const band = REEL_SEARCH_AGE_BANDS[state.band];
    if (band) {
      filters.minAge = band.min;
      if (band.max !== null) filters.maxAge = band.max;
    }
  }

  const city = state.city?.trim();
  if (city) filters.cities = [city];
  if (state.verifiedOnly) filters.verifiedOnly = true;

  return filters;
}

/** Whether anything at all has been asked for — an empty search runs nothing. */
export function hasReelSearchQuery(state: ReelSearchState): boolean {
  return Object.keys(buildReelSearchFilters(state)).length > 0;
}
