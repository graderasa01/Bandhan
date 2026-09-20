import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { assessPartnerPreferences } from "@/lib/services/match/preferenceEvidence";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { canViewerUnlockPhotos, photoLockFor } from "@/lib/services/plans/photoAccess";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { INDIA_PLACES, stateOfCity } from "@/lib/profile/quickPicks";
import {
  DISCOVER_MAX_AGE,
  DISCOVER_MAX_PAGE_SIZE,
  DISCOVER_MIN_AGE,
  DISCOVER_PAGE_SIZE,
  FILTER_BY_KEY,
  MAX_RELAXABLE,
  RELAX_PRIORITY,
  cmToFeetInches,
  oppositeGender,
  type BehaviorStatus,
  type DiscoverFilterKey,
  type DiscoverFilters,
  type DiscoverMode,
  type DiscoverReason,
  type DiscoverResultCard,
  type DiscoverSearchRequest,
  type DiscoverSearchResponse,
  type DiscoverSort,
  type RelaxationSuggestion,
} from "@/lib/discovery/contract";
import { degreesForTier, incomeBucketsFrom, legacyToFilters } from "./filterNormalizer";
import { resolveBehavior, type LearnedDimensionFilter } from "./behaviorSources";

/**
 * Advanced Discovery search — the deterministic, server-side-filtered half of
 * `/user/discover`. Deliberately **not** the ranking pipeline
 * (`lib/services/match/pipeline.ts`): a search is "show me people matching
 * these exact filters, newest first", not a scored/personalised deck, so it
 * never touches D-33's weights and never runs `scoreCandidates`.
 *
 * ## The guards every query carries, in the order they are applied
 *
 *   1. plan gate — `advancedDiscovery`, checked here and not only in the route,
 *      so no new caller can reach a paid result by importing the service;
 *   2. never the viewer, never anyone blocked in either direction;
 *   3. `isVisible`, `deletedAt IS NULL`, status SUBMITTED/VERIFIED (VERIFIED
 *      only under `verifiedOnly`), and the owning user not suspended/deleted;
 *   4. the viewer's gender preference (explicit filter, saved preference, or
 *      the opposite of their own gender — in that order);
 *   5. the filters themselves, every value already canonical (see
 *      `lib/discovery/contract.ts` — nothing free-form reaches a `where`
 *      except `name`/`nativePlace`/`jobTitle`/`gotra`, and those only as a
 *      parameterised `contains`/`equals`);
 *   6. a validated keyset cursor and a capped page size.
 *
 * ## Sensitive filters
 *
 * Religion, caste/community, gotra, manglik and income match only profiles
 * whose owner switched that field on in `ProfileDiscoveryConsent`, *and* whose
 * value is not an unconfirmed AI inference (`ProfileFieldProvenance`). A row
 * that fails either simply is not in the result — the same as a row whose
 * owner never filled the field — so membership in the result leaks nothing
 * the owner did not agree to be found by. These filters are hard in every
 * mode; FLEXIBLE never relaxes them (see `RELAX_PRIORITY`).
 *
 * ## FLEXIBLE mode
 *
 * "At most one relaxable filter missed": the hard filters AND an OR over
 * every all-but-one combination of the relaxable ones. Each returned row is
 * then re-tested in code against every filter so the card can say honestly
 * which ones it matched, missed or has no information for — "6 me se 5
 * preferences mili" is counted, never estimated. Nothing is relaxed silently:
 * STRICT is exact, FLEXIBLE is a mode the user chose, and a zero-result STRICT
 * search only *offers* relaxations (`suggestions`) for the user to accept.
 *
 * ## Visibility of what is returned
 *
 * Every field on a card is L1 (`candidateFacts.ts`). The photo is the one
 * per-row check (match or `photoUnlockAll`), batched below. Locked photos are
 * never fetched into the response — `photoUrl` is null, not a URL the client
 * is asked not to render.
 */

/* ------------------------------------------------------------------ */
/* Legacy shape — kept for the GET route and the partner Client Desk    */
/* ------------------------------------------------------------------ */

export interface DiscoverySearchFilters {
  nameQuery: string | null;
  minAge: number | null;
  maxAge: number | null;
  cities: string[];
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  diet: string | null;
  smoking: string | null;
  drinking: string | null;
  verifiedOnly: boolean;
  minTrustScore: number | null;
  cursor: string | null;
  pageSize: number;
}

export interface DiscoverySearchResult {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoVerified: boolean;
}

export interface DiscoverySearchPage {
  results: DiscoverySearchResult[];
  nextCursor: string | null;
}

export const DISCOVERY_MAX_PAGE_SIZE = DISCOVER_MAX_PAGE_SIZE;

/* ------------------------------------------------------------------ */
/* Row shape                                                           */
/* ------------------------------------------------------------------ */

/**
 * Only what the card shows plus what the reason line needs to re-test the
 * non-sensitive filters. No caste/religion/gotra/manglik/income column is
 * read: a sensitive filter is hard, so a returned row matched it by
 * construction and the reason can name the *requested* value without ever
 * reading the candidate's.
 */
const ROW_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  dateOfBirth: true,
  gender: true,
  currentCity: true,
  currentState: true,
  currentCountry: true,
  nativePlace: true,
  maritalStatus: true,
  heightCm: true,
  trustScore: true,
  trustScoreLabel: true,
  profileStatus: true,
  profileCompletionScore: true,
  createdAt: true,
  photoPrivacy: true,
  basicDetails: { select: { motherTongue: true } },
  education: { select: { highestEducation: true } },
  profession: { select: { professionCategory: true, jobTitle: true, workCity: true } },
  lifestyle: { select: { diet: true, smoking: true, drinking: true, hobbies: true, languagesKnown: true, relocateWilling: true } },
  family: { select: { familyType: true, familyValues: true } },
  photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true, verificationStatus: true } },
} satisfies Prisma.ProfileSelect;

type Row = Prisma.ProfileGetPayload<{ select: typeof ROW_SELECT }>;

type Verdict = "matched" | "missed" | "unknown";

interface FilterUnit {
  key: DiscoverFilterKey;
  /** Short Hinglish label for the reason line — "Delhi ya Jaipur", "25–29 saal", "non-smoker". */
  label: string;
  where: Prisma.ProfileWhereInput;
  relaxable: boolean;
  test: (row: Row) => Verdict;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function joinNatural(items: string[], conj = "aur"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

function ageBoundsToDobRange(minAge: number | null | undefined, maxAge: number | null | undefined) {
  const now = new Date();
  const maxDob = minAge != null ? new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate()) : undefined;
  const minDob = maxAge != null ? new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1) : undefined;
  return { minDob, maxDob };
}

function inRange(n: number | null, lo: number | undefined, hi: number | undefined): Verdict {
  if (n == null) return "unknown";
  if (lo != null && n < lo) return "missed";
  if (hi != null && n > hi) return "missed";
  return "matched";
}

function inList(value: string | null | undefined, list: string[], insensitive = false): Verdict {
  if (!value) return "unknown";
  const v = insensitive ? value.toLowerCase() : value;
  return list.some((x) => (insensitive ? x.toLowerCase() : x) === v) ? "matched" : "missed";
}

function hasSome(values: string[] | null | undefined, wanted: string[]): Verdict {
  if (!values || values.length === 0) return "unknown";
  return values.some((v) => wanted.includes(v)) ? "matched" : "missed";
}

function containsText(value: string | null | undefined, needle: string): Verdict {
  if (!value) return "unknown";
  return value.toLowerCase().includes(needle.toLowerCase()) ? "matched" : "missed";
}

const OUTSIDE_INDIA: string[] = INDIA_PLACES.find((s) => s.state === "Outside India")?.cities ?? [];

function citiesOfStates(states: string[]): string[] {
  return INDIA_PLACES.filter((s) => states.includes(s.state)).flatMap((s) => s.cities);
}

/** An unconfirmed AI guess is not the candidate's own statement — a sensitive filter may not match on it. */
function notInferred(fieldKey: string): Prisma.ProfileWhereInput {
  return { fieldProvenance: { none: { fieldKey, source: "AI_INFERRED", confirmed: false } } };
}

/* ------------------------------------------------------------------ */
/* Filters → units                                                     */
/* ------------------------------------------------------------------ */

function buildUnits(f: DiscoverFilters): FilterUnit[] {
  const units: FilterUnit[] = [];
  const relax = (key: DiscoverFilterKey) => Boolean(FILTER_BY_KEY[key]?.relaxable);

  if (f.name) {
    const needle = f.name;
    units.push({
      key: "name",
      label: `naam "${needle}"`,
      where: { displayName: { contains: needle, mode: "insensitive" } },
      relaxable: false,
      test: (r) => containsText(r.displayName, needle),
    });
  }

  if (f.minAge != null || f.maxAge != null) {
    const { minDob, maxDob } = ageBoundsToDobRange(f.minAge, f.maxAge);
    const lo = f.minAge;
    const hi = f.maxAge;
    units.push({
      key: "minAge",
      label: lo != null && hi != null ? `${lo}–${hi} saal` : lo != null ? `${lo}+ saal` : `${hi} saal tak`,
      where: { dateOfBirth: { gte: minDob, lte: maxDob } },
      relaxable: relax("minAge"),
      test: (r) => inRange(ageFromDate(r.dateOfBirth), lo, hi),
    });
  }

  if (f.minHeightCm != null || f.maxHeightCm != null) {
    const lo = f.minHeightCm;
    const hi = f.maxHeightCm;
    units.push({
      key: "minHeightCm",
      label: `height ${lo != null ? cmToFeetInches(lo) : ""}${lo != null && hi != null ? "–" : lo != null ? "+" : ""}${hi != null ? `${cmToFeetInches(hi)}${lo == null ? " tak" : ""}` : ""}`,
      where: { heightCm: { gte: lo, lte: hi } },
      relaxable: relax("minHeightCm"),
      test: (r) => inRange(r.heightCm, lo, hi),
    });
  }

  const cities = f.cities ?? [];
  const states = f.states ?? [];
  const countries = f.countries ?? [];
  if (cities.length || states.length || countries.length) {
    // NRIs store the country in `currentCity` ("USA", "UAE / Dubai"), and the
    // profile builder never writes `currentState`/`currentCountry` (the latter
    // defaults to "India" for everyone) — so a place filter checks all three
    // columns and expands a state to its cities.
    const cityList = [...new Set([...cities, ...citiesOfStates(states), ...countries.filter((c) => c !== "India")])];
    const wantsIndia = countries.includes("India");
    const or: Prisma.ProfileWhereInput[] = [];
    if (cityList.length) or.push({ currentCity: { in: cityList, mode: "insensitive" } });
    if (states.length) or.push({ currentState: { in: states, mode: "insensitive" } });
    if (countries.length) or.push({ currentCountry: { in: countries, mode: "insensitive" } });
    if (wantsIndia) or.push({ currentCountry: { equals: "India", mode: "insensitive" }, currentCity: { notIn: OUTSIDE_INDIA } });
    units.push({
      key: "cities",
      label: joinNatural([...cities, ...states, ...countries], "ya"),
      where: { OR: or },
      relaxable: relax("cities"),
      test: (r) => {
        const city = (r.currentCity ?? "").toLowerCase();
        if (!city && !r.currentState) return "unknown";
        if (cityList.some((c) => c.toLowerCase() === city)) return "matched";
        if (r.currentState && states.some((s) => s.toLowerCase() === r.currentState!.toLowerCase())) return "matched";
        if (r.currentCountry && countries.some((c) => c.toLowerCase() === r.currentCountry!.toLowerCase()) && !(wantsIndia && OUTSIDE_INDIA.includes(r.currentCity ?? ""))) return "matched";
        return "missed";
      },
    });
  }

  if (f.nativePlace) {
    const needle = f.nativePlace;
    units.push({
      key: "nativePlace",
      label: `native ${needle}`,
      where: { nativePlace: { contains: needle, mode: "insensitive" } },
      relaxable: relax("nativePlace"),
      test: (r) => containsText(r.nativePlace, needle),
    });
  }

  if (f.maritalStatus?.length) {
    const list = f.maritalStatus;
    units.push({ key: "maritalStatus", label: joinNatural(list, "ya"), where: { maritalStatus: { in: list } }, relaxable: relax("maritalStatus"), test: (r) => inList(r.maritalStatus, list) });
  }

  if (f.motherTongue?.length) {
    const list = f.motherTongue;
    units.push({
      key: "motherTongue",
      label: `${joinNatural(list, "ya")} bolne wale`,
      where: { basicDetails: { motherTongue: { in: list } } },
      relaxable: relax("motherTongue"),
      test: (r) => inList(r.basicDetails?.motherTongue, list),
    });
  }

  // ── Sensitive — consent join + no unconfirmed AI inference, always hard ──
  if (f.religion?.length) {
    const list = f.religion;
    units.push({
      key: "religion",
      label: joinNatural(list, "ya"),
      where: { AND: [{ discoveryConsent: { religionSearchable: true } }, { basicDetails: { religion: { in: list } } }, notInferred("religion")] },
      relaxable: false,
      test: () => "matched",
    });
  }
  if (f.community?.length) {
    const list = f.community;
    units.push({
      key: "community",
      label: joinNatural(list, "ya"),
      where: {
        AND: [
          { discoveryConsent: { casteSearchable: true } },
          { basicDetails: { OR: [{ caste: { in: list, mode: "insensitive" } }, { community: { in: list, mode: "insensitive" } }] } },
          notInferred("caste"),
        ],
      },
      relaxable: false,
      test: () => "matched",
    });
  }
  if (f.gotra) {
    const gotra = f.gotra;
    units.push({
      key: "gotra",
      label: `${gotra} gotra`,
      where: { AND: [{ discoveryConsent: { gotraSearchable: true } }, { basicDetails: { gotra: { equals: gotra, mode: "insensitive" } } }, notInferred("gotra")] },
      relaxable: false,
      test: () => "matched",
    });
  }
  if (f.manglik?.length) {
    const list = f.manglik;
    units.push({
      key: "manglik",
      label: joinNatural(list.map((m) => (m === "Haan" ? "manglik" : m === "Nahi" ? "non-manglik" : "aanshik manglik")), "ya"),
      where: { AND: [{ discoveryConsent: { manglikSearchable: true } }, { basicDetails: { manglikStatus: { in: list } } }, notInferred("manglikStatus")] },
      relaxable: false,
      test: () => "matched",
    });
  }
  if (f.minIncome) {
    const buckets = incomeBucketsFrom(f.minIncome);
    units.push({
      key: "minIncome",
      label: `income ${f.minIncome}+`,
      where: { AND: [{ discoveryConsent: { incomeSearchable: true } }, { profession: { annualIncomeRange: { in: buckets } } }, notInferred("annualIncome")] },
      relaxable: false,
      test: () => "matched",
    });
  }

  // ── Education: specific degrees, a tier, or both ──
  if (f.education?.length || f.educationTier) {
    const tierDegrees = f.educationTier ? degreesForTier(f.educationTier) : [];
    const degrees = f.education ?? [];
    let list: string[];
    if (degrees.length && tierDegrees.length) {
      const both = degrees.filter((d) => tierDegrees.includes(d));
      list = both.length ? both : [...new Set([...degrees, ...tierDegrees])];
    } else list = degrees.length ? degrees : tierDegrees;
    units.push({
      key: "education",
      label: degrees.length ? joinNatural(degrees, "ya") : f.educationTier!,
      where: { education: { highestEducation: { in: list } } },
      relaxable: relax("education"),
      test: (r) => inList(r.education?.highestEducation, list),
    });
  }

  if (f.professionCategory?.length) {
    const list = f.professionCategory;
    units.push({
      key: "professionCategory",
      label: `${joinNatural(list, "ya")} me kaam`,
      where: { profession: { professionCategory: { in: list } } },
      relaxable: relax("professionCategory"),
      test: (r) => inList(r.profession?.professionCategory, list),
    });
  }
  if (f.jobTitle) {
    const needle = f.jobTitle;
    units.push({
      key: "jobTitle",
      label: needle,
      where: { profession: { jobTitle: { contains: needle, mode: "insensitive" } } },
      relaxable: relax("jobTitle"),
      test: (r) => containsText(r.profession?.jobTitle, needle),
    });
  }
  if (f.workCity?.length) {
    const list = f.workCity;
    units.push({
      key: "workCity",
      label: `${joinNatural(list, "ya")} me kaam`,
      where: { profession: { workCity: { in: list, mode: "insensitive" } } },
      relaxable: relax("workCity"),
      test: (r) => inList(r.profession?.workCity, list, true),
    });
  }

  if (f.diet?.length) {
    const list = f.diet;
    units.push({ key: "diet", label: joinNatural(list.map((d) => d.toLowerCase() === "veg" ? "vegetarian" : d), "ya"), where: { lifestyle: { diet: { in: list } } }, relaxable: relax("diet"), test: (r) => inList(r.lifestyle?.diet, list) });
  }
  if (f.smoking?.length) {
    const list = f.smoking;
    units.push({
      key: "smoking",
      label: list.length === 1 && list[0] === "Nahi" ? "non-smoker" : `smoking: ${joinNatural(list, "ya")}`,
      where: { lifestyle: { smoking: { in: list } } },
      relaxable: relax("smoking"),
      test: (r) => inList(r.lifestyle?.smoking, list),
    });
  }
  if (f.drinking?.length) {
    const list = f.drinking;
    units.push({
      key: "drinking",
      label: list.length === 1 && list[0] === "Nahi" ? "non-drinker" : `drinking: ${joinNatural(list, "ya")}`,
      where: { lifestyle: { drinking: { in: list } } },
      relaxable: relax("drinking"),
      test: (r) => inList(r.lifestyle?.drinking, list),
    });
  }
  if (f.languages?.length) {
    const list = f.languages;
    units.push({ key: "languages", label: joinNatural(list, "ya"), where: { lifestyle: { languagesKnown: { hasSome: list } } }, relaxable: relax("languages"), test: (r) => hasSome(r.lifestyle?.languagesKnown, list) });
  }
  if (f.hobbies?.length) {
    const list = f.hobbies;
    units.push({ key: "hobbies", label: joinNatural(list, "ya"), where: { lifestyle: { hobbies: { hasSome: list } } }, relaxable: relax("hobbies"), test: (r) => hasSome(r.lifestyle?.hobbies, list) });
  }
  if (f.relocate?.length) {
    const list = f.relocate;
    units.push({
      key: "relocate",
      label: list.length === 1 && list[0] === "Haan" ? "relocate ready" : `relocation: ${joinNatural(list, "ya")}`,
      where: { lifestyle: { relocateWilling: { in: list } } },
      relaxable: relax("relocate"),
      test: (r) => inList(r.lifestyle?.relocateWilling, list),
    });
  }
  if (f.familyType?.length) {
    const list = f.familyType;
    units.push({ key: "familyType", label: joinNatural(list, "ya"), where: { family: { familyType: { in: list } } }, relaxable: relax("familyType"), test: (r) => inList(r.family?.familyType, list) });
  }
  if (f.familyValues?.length) {
    const list = f.familyValues;
    units.push({ key: "familyValues", label: `${joinNatural(list, "ya")} values`, where: { family: { familyValues: { in: list } } }, relaxable: relax("familyValues"), test: (r) => inList(r.family?.familyValues, list) });
  }

  // ── Trust — always hard ──
  if (f.verifiedOnly) {
    units.push({ key: "verifiedOnly", label: "verified", where: { profileStatus: "VERIFIED" }, relaxable: false, test: (r) => (r.profileStatus === "VERIFIED" ? "matched" : "missed") });
  }
  if (f.minTrustScore != null) {
    const min = f.minTrustScore;
    units.push({ key: "minTrustScore", label: `trust ${min}+`, where: { trustScore: { gte: min } }, relaxable: false, test: (r) => inRange(r.trustScore, min, undefined) });
  }
  if (f.minCompleteness != null) {
    const min = f.minCompleteness;
    units.push({ key: "minCompleteness", label: `profile ${min}%+`, where: { profileCompletionScore: { gte: min } }, relaxable: false, test: (r) => inRange(r.profileCompletionScore, min, undefined) });
  }

  return units;
}

/** Learned dimensions as units — same shape, so the reason line treats them like any filter. */
function behaviorUnits(learned: LearnedDimensionFilter[]): FilterUnit[] {
  return learned.map((l): FilterUnit => {
    switch (l.dimension) {
      case "city":
        return { key: "cities", label: l.label, where: { currentCity: { in: l.values } }, relaxable: true, test: (r) => inList(r.currentCity, l.values) };
      case "ageBand": {
        const { minDob, maxDob } = ageBoundsToDobRange(l.ageRange?.min, l.ageRange?.max);
        return { key: "minAge", label: l.label, where: { dateOfBirth: { gte: minDob, lte: maxDob } }, relaxable: true, test: (r) => inRange(ageFromDate(r.dateOfBirth), l.ageRange?.min, l.ageRange?.max) };
      }
      case "education":
        return { key: "education", label: l.label, where: { education: { highestEducation: { in: l.values } } }, relaxable: true, test: (r) => inList(r.education?.highestEducation, l.values) };
      case "professionCategory":
        return { key: "professionCategory", label: l.label, where: { profession: { professionCategory: { in: l.values } } }, relaxable: true, test: (r) => inList(r.profession?.professionCategory, l.values) };
      case "diet":
        return { key: "diet", label: l.label, where: { lifestyle: { diet: { in: l.values } } }, relaxable: true, test: (r) => inList(r.lifestyle?.diet, l.values) };
      case "smoking":
        return { key: "smoking", label: l.label, where: { lifestyle: { smoking: { in: l.values } } }, relaxable: true, test: (r) => inList(r.lifestyle?.smoking, l.values) };
      case "drinking":
        return { key: "drinking", label: l.label, where: { lifestyle: { drinking: { in: l.values } } }, relaxable: true, test: (r) => inList(r.lifestyle?.drinking, l.values) };
      default:
        return { key: "cities", label: l.label, where: {}, relaxable: true, test: () => "unknown" };
    }
  });
}

/** Every k-combination of `items`, in a stable order. */
function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/* ------------------------------------------------------------------ */
/* Cursor                                                              */
/* ------------------------------------------------------------------ */

/**
 * Keyset token: `<sort>.<createdAt ms>.<trustScore|n>.<profile id>` — compact
 * enough for the Client Desk's 80-char cursor field, opaque enough that the
 * client never assembles one, and validated strictly on the way back in. A
 * tampered cursor can only move the window; every `where` guard still applies.
 */
const CURSOR_RE = /^(n|t)\.(\d{1,16})\.(n|\d{1,3})\.([A-Za-z0-9-]{1,40})$/;

interface CursorPayload {
  sort: DiscoverSort;
  createdAt: Date;
  trustScore: number | null;
  id: string;
}

export function encodeCursor(sort: DiscoverSort, row: { createdAt: Date; trustScore: number | null; id: string }): string {
  return `${sort === "trust" ? "t" : "n"}.${row.createdAt.getTime()}.${row.trustScore == null ? "n" : row.trustScore}.${row.id}`;
}

export function decodeCursor(token: string, sort: DiscoverSort): CursorPayload | null {
  const m = CURSOR_RE.exec(token);
  if (!m) return null;
  const tokenSort: DiscoverSort = m[1] === "t" ? "trust" : "newest";
  if (tokenSort !== sort) return null;
  const ms = Number(m[2]);
  if (!Number.isFinite(ms)) return null;
  const trust = m[3] === "n" ? null : Number(m[3]);
  if (trust != null && (trust < 0 || trust > 100)) return null;
  return { sort, createdAt: new Date(ms), trustScore: trust, id: m[4] };
}

function cursorWhere(c: CursorPayload): Prisma.ProfileWhereInput {
  const olderThan: Prisma.ProfileWhereInput = { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] };
  if (c.sort === "newest") return olderThan;
  // trust desc, nulls last, then (createdAt, id) desc
  if (c.trustScore == null) return { AND: [{ trustScore: null }, olderThan] };
  return {
    OR: [
      { trustScore: { lt: c.trustScore } },
      { trustScore: null },
      { AND: [{ trustScore: c.trustScore }, olderThan] },
    ],
  };
}

function orderBy(sort: DiscoverSort): Prisma.ProfileOrderByWithRelationInput[] {
  return sort === "trust"
    ? [{ trustScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }]
    : [{ createdAt: "desc" }, { id: "desc" }];
}

/* ------------------------------------------------------------------ */
/* The search                                                          */
/* ------------------------------------------------------------------ */

export type DiscoverSearchOutcome =
  | DiscoverSearchResponse
  | { ok: false; code: "plan" | "validation" | "no_profile"; message: string };

interface BuiltQuery {
  where: Prisma.ProfileWhereInput;
  explicitUnits: FilterUnit[];
  relaxableUnits: FilterUnit[];
  learnedUnits: FilterUnit[];
}

function baseWhere(viewerUserId: string, blockedUserIds: string[], gender: string | undefined, verifiedOnly: boolean): Prisma.ProfileWhereInput {
  return {
    userId: { not: viewerUserId, notIn: blockedUserIds },
    isVisible: true,
    deletedAt: null,
    profileStatus: verifiedOnly ? "VERIFIED" : { in: ["SUBMITTED", "VERIFIED"] },
    user: { deletedAt: null, status: { notIn: ["SUSPENDED", "BLOCKED", "DELETED"] } },
    ...(gender ? { gender } : {}),
  };
}

function buildQuery(params: {
  viewerUserId: string;
  blockedUserIds: string[];
  gender: string | undefined;
  filters: DiscoverFilters;
  mode: DiscoverMode;
  learned: LearnedDimensionFilter[];
}): BuiltQuery {
  const explicitUnits = buildUnits(params.filters);
  const and: Prisma.ProfileWhereInput[] = [baseWhere(params.viewerUserId, params.blockedUserIds, params.gender, Boolean(params.filters.verifiedOnly))];

  // Relaxable set: the RELAX_PRIORITY order, most-relaxable first, capped.
  const relaxCandidates = params.mode === "flexible" ? explicitUnits.filter((u) => u.relaxable) : [];
  const ordered = [...relaxCandidates].sort((a, b) => RELAX_PRIORITY.indexOf(a.key) - RELAX_PRIORITY.indexOf(b.key));
  const relaxableUnits = ordered.length >= 2 ? ordered.slice(0, MAX_RELAXABLE) : [];
  const relaxableSet = new Set(relaxableUnits);

  for (const u of explicitUnits) if (!relaxableSet.has(u)) and.push(u.where);

  if (relaxableUnits.length >= 2) {
    // At most one miss: OR over every all-but-one combination.
    and.push({ OR: relaxableUnits.map((_, i) => ({ AND: relaxableUnits.filter((__, j) => j !== i).map((u) => u.where) })) });
  }

  const learnedUnits = behaviorUnits(params.learned);
  if (learnedUnits.length > 0) {
    const k = learnedUnits.length >= 3 ? 2 : 1;
    and.push({ OR: combinations(learnedUnits, k).map((combo) => ({ AND: combo.map((u) => u.where) })) });
  }

  return { where: { AND: and }, explicitUnits, relaxableUnits, learnedUnits };
}

function buildReason(row: Row, q: BuiltQuery, mode: DiscoverMode, behaviorActive: boolean, savedPreferenceOnly: boolean): DiscoverReason {
  const matched: string[] = [];
  const missed: string[] = [];
  const unknown: string[] = [];
  const relaxable = new Set(q.relaxableUnits);
  let relaxableMatched = 0;

  for (const u of q.explicitUnits) {
    const v = u.test(row);
    if (v === "matched") {
      matched.push(u.label);
      if (relaxable.has(u)) relaxableMatched++;
    } else if (v === "missed") missed.push(u.label);
    else unknown.push(u.label);
  }

  const behaviorMatched = q.learnedUnits.filter((u) => u.test(row) === "matched").map((u) => u.label);

  let kind: DiscoverReason["kind"] = "none";
  let text: string;
  if (behaviorActive) {
    kind = "behavior";
    text = behaviorMatched.length
      ? `Aapki recent choices se milta-julta — ${behaviorMatched.join(", ")}.`
      : "Aapki recent choices se milta-julta.";
    if (matched.length) text += ` Aapke ${joinNatural(matched)} filter bhi mile.`;
  } else if (mode === "flexible" && relaxable.size >= 2) {
    kind = "flexible";
    const total = relaxable.size;
    text = `${total} me se ${relaxableMatched} preferences mili`;
    const softMissed = q.relaxableUnits.filter((u) => u.test(row) === "missed").map((u) => u.label);
    const softUnknown = q.relaxableUnits.filter((u) => u.test(row) === "unknown").map((u) => u.label);
    if (softMissed.length) text += ` — ${joinNatural(softMissed)} nahi mila`;
    if (softUnknown.length) text += `${softMissed.length ? ";" : " —"} ${joinNatural(softUnknown)}: information nahi bhari`;
    text += ".";
  } else if (matched.length) {
    kind = "strict";
    text = `Aapke ${joinNatural(matched)} filter${matched.length > 1 ? "s" : ""} se mila.`;
  } else if (savedPreferenceOnly) {
    text = "Aapki saved preference (gender) se mila — aur koi filter nahi lagaya.";
  } else {
    text = "Koi filter nahi lagaya — sabhi visible profiles.";
  }

  return {
    kind,
    text,
    matched,
    missed,
    unknown,
    total: relaxable.size,
    matchedCount: relaxableMatched,
    behaviorMatched,
  };
}

/**
 * Relaxations a zero-result STRICT search may *offer*. Each is checked with a
 * cheap existence query so the user is only shown options that would actually
 * produce a result — "Nearby cities bhi dekhein" with nothing behind it would
 * be a second empty screen.
 */
async function suggestRelaxations(params: {
  viewerUserId: string;
  blockedUserIds: string[];
  gender: string | undefined;
  filters: DiscoverFilters;
  mode: DiscoverMode;
}): Promise<RelaxationSuggestion[]> {
  const f = params.filters;
  const candidates: RelaxationSuggestion[] = [];

  if (f.cities?.length) {
    const states = [...new Set(f.cities.map((c) => stateOfCity(c)).filter((s): s is string => Boolean(s) && s !== "Outside India"))];
    if (states.length) {
      const next: DiscoverFilters = { ...f, states: [...new Set([...(f.states ?? []), ...states])] };
      delete next.cities;
      candidates.push({ id: "nearbyCities", label: `Aas-paas ke sheher bhi dekhein (${joinNatural(states, "aur")})`, filters: next, mode: params.mode });
    }
  }
  if (f.minAge != null || f.maxAge != null) {
    const next: DiscoverFilters = { ...f };
    if (f.minAge != null) next.minAge = Math.max(DISCOVER_MIN_AGE, f.minAge - 2);
    if (f.maxAge != null) next.maxAge = Math.min(DISCOVER_MAX_AGE, f.maxAge + 2);
    candidates.push({ id: "widenAge", label: "Age range 2 saal badhayein", filters: next, mode: params.mode });
  }
  if (f.verifiedOnly) {
    const next: DiscoverFilters = { ...f };
    delete next.verifiedOnly;
    candidates.push({ id: "dropVerified", label: "Verified-only hata kar dekhein", filters: next, mode: params.mode });
  }
  if (f.minTrustScore != null) {
    const next: DiscoverFilters = { ...f };
    delete next.minTrustScore;
    candidates.push({ id: "dropTrust", label: "Trust score ki limit hata kar dekhein", filters: next, mode: params.mode });
  }
  if (params.mode === "strict" && buildUnits(f).filter((u) => u.relaxable).length >= 2) {
    candidates.push({ id: "flexibleMode", label: "Flexible mode — ek preference chhoot jaye to bhi dikhayein", filters: f, mode: "flexible" });
  }

  const kept: RelaxationSuggestion[] = [];
  for (const s of candidates.slice(0, 4)) {
    const q = buildQuery({ viewerUserId: params.viewerUserId, blockedUserIds: params.blockedUserIds, gender: params.gender, filters: s.filters, mode: s.mode, learned: [] });
    const hit = await prisma.profile.findFirst({ where: q.where, select: { id: true } });
    if (hit) kept.push(s);
  }
  return kept;
}

export interface RunDiscoverSearchOptions {
  /**
   * Off only for the legacy wrapper, whose two callers gate differently: the
   * GET route checks the plan itself (as it always has) and the partner Client
   * Desk runs *as* the member under a delegated permission — a partner's
   * search is the member's own reach, plan included, and that is decided in
   * `clientSearchService`, not here.
   */
  enforcePlanGate?: boolean;
}

export async function runDiscoverSearch(
  viewerUserId: string,
  request: DiscoverSearchRequest,
  options: RunDiscoverSearchOptions = {},
): Promise<DiscoverSearchOutcome> {
  const enforce = options.enforcePlanGate ?? true;
  if (enforce) {
    const gate = await isFeatureAvailable(viewerUserId, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery);
    if (!gate.allowed) return { ok: false, code: "plan", message: "Advanced Discovery search abhi aapke plan me available nahi hai." };
  }

  const pageSize = Math.min(Math.max(1, request.pageSize || DISCOVER_PAGE_SIZE), DISCOVER_MAX_PAGE_SIZE);
  const cursor = request.cursor ? decodeCursor(request.cursor, request.sort) : null;
  if (request.cursor && !cursor) return { ok: false, code: "validation", message: "Page cursor valid nahi hai — search dobara chalayein." };

  const [viewer, blockedUserIds, canUnlockAll] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: viewerUserId },
      select: { id: true, userId: true, gender: true, partnerPreferences: true },
    }),
    getBlockedUserIds(viewerUserId),
    canViewerUnlockPhotos(viewerUserId),
  ]);
  if (!viewer) return { ok: false, code: "no_profile", message: "Pehle apni profile banaiye, phir search chalegi." };

  // Explicit filter → saved preference → the opposite of the viewer's own
  // gender → (a viewer with none of the three) no gender filter at all.
  const savedLookingFor = viewer.partnerPreferences?.lookingForGender;
  const gender: "Ladka" | "Ladki" | undefined =
    request.filters.lookingForGender ??
    (savedLookingFor === "Ladka" || savedLookingFor === "Ladki" ? savedLookingFor : undefined) ??
    oppositeGender(viewer.gender);
  const appliedFilters: DiscoverFilters = { ...request.filters, ...(gender ? { lookingForGender: gender } : {}) };

  const behavior = await resolveBehavior(viewerUserId, request.behaviorMode, appliedFilters);
  const behaviorActive = behavior.status.state === "active" && behavior.learned.length > 0;

  const q = buildQuery({
    viewerUserId,
    blockedUserIds,
    gender,
    filters: appliedFilters,
    mode: request.mode,
    learned: behaviorActive ? behavior.learned : [],
  });

  const rows = await prisma.profile.findMany({
    where: cursor ? { AND: [q.where, cursorWhere(cursor)] } : q.where,
    orderBy: orderBy(request.sort),
    take: pageSize + 1,
    select: ROW_SELECT,
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  const candidateUserIds = page.map((p) => p.userId);
  const candidateProfileIds = page.map((p) => p.id);
  const [matches, shortlisted] = await Promise.all([
    candidateUserIds.length
      ? prisma.match.findMany({
          where: { OR: [{ userAId: viewerUserId, userBId: { in: candidateUserIds } }, { userBId: viewerUserId, userAId: { in: candidateUserIds } }] },
          select: { userAId: true, userBId: true },
        })
      : Promise.resolve([]),
    candidateProfileIds.length
      ? prisma.shortlist.findMany({ where: { userId: viewerUserId, targetProfileId: { in: candidateProfileIds } }, select: { targetProfileId: true } })
      : Promise.resolve([]),
  ]);
  const matchedUserIds = new Set(matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== viewerUserId));
  const shortlistedIds = new Set(shortlisted.map((s) => s.targetProfileId));

  const explicitCount = q.explicitUnits.length;
  const results: DiscoverResultCard[] = page.map((p) => {
    const photo = p.photos[0];
    const photoLock = photoLockFor({
      matched: matchedUserIds.has(p.userId),
      viewerCanUnlockAll: canUnlockAll,
      ownerPhotoPrivacy: p.photoPrivacy,
    });
    const photoOpen = photoLock === "open";
    return {
      profileId: p.id,
      displayName: p.displayName ?? "Profile",
      age: ageFromDate(p.dateOfBirth),
      city: p.currentCity,
      education: p.education?.highestEducation ?? null,
      profession: p.profession?.jobTitle ?? p.profession?.professionCategory ?? null,
      professionCategory: p.profession?.professionCategory ?? null,
      maritalStatus: p.maritalStatus,
      verified: p.profileStatus === "VERIFIED",
      trustScore: p.trustScore,
      trustLabel: p.trustScoreLabel,
      photoUrl: photoOpen ? (photo?.fileUrl ?? null) : null,
      photoUnlocked: photoOpen,
      photoLock,
      photoVerified: photo?.verificationStatus === "APPROVED",
      shortlisted: shortlistedIds.has(p.id),
      reason: buildReason(p, q, request.mode, behaviorActive, explicitCount === 0 && Boolean(gender)),
    };
  });

  const suggestions =
    results.length === 0 && !cursor && !behaviorActive
      ? await suggestRelaxations({ viewerUserId, blockedUserIds, gender, filters: appliedFilters, mode: request.mode })
      : [];

  const last = page[page.length - 1];
  const preference = assessPartnerPreferences({ partnerPreferences: viewer.partnerPreferences });

  const status: BehaviorStatus = behavior.status;
  return {
    ok: true,
    results,
    nextCursor: hasMore && last ? encodeCursor(request.sort, last) : null,
    countLabel: `${results.length}${hasMore ? "+" : ""} ${results.length === 1 && !hasMore ? "profile" : "profiles"}`,
    applied: {
      filters: appliedFilters,
      mode: request.mode,
      sort: request.sort,
      relaxable: q.relaxableUnits.map((u) => u.label),
      behavior: status,
    },
    suggestions,
    preference: { state: preference.state },
  };
}

/* ------------------------------------------------------------------ */
/* Legacy wrapper                                                      */
/* ------------------------------------------------------------------ */

/**
 * The pre-redesign signature, kept so `app/api/discover/search` GET and the
 * partner Client Desk (`clientSearchService.ts`) keep working unchanged. Maps
 * the flat single-value shape onto `DiscoverFilters` (through the normaliser,
 * so a tier like "Graduate ya upar" becomes the degrees it admits instead of
 * an exact match nothing stores) and runs a STRICT, newest-first search with
 * no behaviour mode. Callers of this shape cannot express a sensitive filter —
 * the legacy type has no field for one — which is exactly the property the
 * Client Desk's route documents and relies on.
 */
export async function searchDiscoveryCandidates(viewerUserId: string, filters: DiscoverySearchFilters): Promise<DiscoverySearchPage> {
  const outcome = await runDiscoverSearch(
    viewerUserId,
    {
      filters: legacyToFilters(filters),
      mode: "strict",
      sort: "newest",
      behaviorMode: "none",
      cursor: filters.cursor,
      pageSize: filters.pageSize,
    },
    { enforcePlanGate: false },
  );
  if (!outcome.ok) return { results: [], nextCursor: null };
  return {
    results: outcome.results.map((r) => ({
      profileId: r.profileId,
      displayName: r.displayName,
      age: r.age,
      city: r.city,
      education: r.education,
      professionCategory: r.professionCategory,
      maritalStatus: r.maritalStatus,
      trustScore: r.trustScore,
      photoUrl: r.photoUrl,
      photoUnlocked: r.photoUnlocked,
      photoVerified: r.photoVerified,
    })),
    nextCursor: outcome.nextCursor,
  };
}
