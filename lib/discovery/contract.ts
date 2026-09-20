/**
 * Advanced Discovery — the one filter vocabulary the client, the search API,
 * the AI intent parser and the check scripts all speak.
 *
 * Client-safe on purpose (no prisma, no `server-only`): the filter sheet renders
 * its options from the same catalog the server validates against, so a value
 * the sheet can produce is by construction a value the server accepts, and a
 * filter the server never declared here cannot be sent, named or displayed.
 * That is the same "the catalog is the boundary" argument `lib/contracts/grio.ts`
 * makes for Grio's action list — an AI that answers with a filter key this file
 * does not know produces nothing, not a surprise.
 *
 * ## What is deliberately *not* a filter
 *
 * Nothing that only the ranking pipeline may weigh (D-33): no behaviour
 * affinity score, no "compatibility". `behaviorMode` is a *mode*, not a score —
 * it swaps in learned dimensions as ordinary filters and the result card says
 * which ones matched. And nothing the profile never stores: there is no
 * "personality", "looks" or "family wealth" key, so an AI reading of a query
 * that asks for those lands in `unresolvedRequests`, never in a filter.
 *
 * ## Sensitive filters
 *
 * Religion, caste/community, gotra, manglik and income are here, but every one
 * is tagged with the consent switch (`ProfileDiscoveryConsent`) a candidate
 * must have turned on before it can match them. The search service enforces
 * that join; this file only records which key needs which switch so the sheet
 * can say so next to the control.
 */

import { z } from "zod";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { COMMUNITY_BY_RELIGION, INDIA_PLACES, PROFESSION_CATEGORIES } from "@/lib/profile/quickPicks";

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/** First page is small and light — twelve cards, no photos for locked rows. */
export const DISCOVER_PAGE_SIZE = 12;
export const DISCOVER_MAX_PAGE_SIZE = 20;
/** A search query is a sentence, not a document. */
export const DISCOVER_QUERY_MAX_CHARS = 400;
/** One character would match a quarter of the table; two is the floor. */
export const DISCOVER_NAME_MIN_CHARS = 2;
export const DISCOVER_NAME_MAX_CHARS = 60;
/** "NRI" alone expands to thirteen countries; sixteen leaves room without inviting a paste of the whole catalog. */
export const DISCOVER_MAX_LIST_VALUES = 16;
export const DISCOVER_MIN_AGE = 18;
export const DISCOVER_MAX_AGE = 80;
/** 4'0" .. 6'6" in cm, matching the height catalog's range. */
export const DISCOVER_MIN_HEIGHT_CM = 122;
export const DISCOVER_MAX_HEIGHT_CM = 199;

/* ------------------------------------------------------------------ */
/* Canonical option lists — every one derived from the profile catalog  */
/* ------------------------------------------------------------------ */

function optionsOf(fieldKey: string): readonly string[] {
  return FIELD_BY_KEY[fieldKey]?.options ?? [];
}

/** The catalog's own opt-out answers — never a filter value, never matched. */
const OPT_OUT_VALUES: ReadonlySet<string> = new Set(["Batana nahi chahte", "Pata nahi", "Hum nahi maante"]);

function filterable(fieldKey: string): readonly string[] {
  return optionsOf(fieldKey).filter((v) => !OPT_OUT_VALUES.has(v));
}

export const GENDER_VALUES = ["Ladka", "Ladki"] as const;
export type LookingForGender = (typeof GENDER_VALUES)[number];

/**
 * Who this member is looking for when they never said — the other gender.
 *
 * Lives here, beside `GENDER_VALUES`, because every surface that puts people
 * in front of people needs the same answer and a second copy of these two
 * lines is how one of them ends up missing. Discovery search has always
 * derived it; the reel pipeline did not, and a member with no stated
 * preference was shown every gender in the app (`candidateWhere`).
 *
 * `undefined` for anything else — a profile with no gender of its own cannot
 * have one inferred for it, and guessing would be worse than the one filter
 * this returns nothing for.
 */
export function oppositeGender(gender: string | null | undefined): LookingForGender | undefined {
  if (gender === "Ladka") return "Ladki";
  if (gender === "Ladki") return "Ladka";
  return undefined;
}

export const MARITAL_STATUS_VALUES = optionsOf("maritalStatus");
export const MOTHER_TONGUE_VALUES = optionsOf("motherTongue");
export const RELIGION_VALUES = filterable("religion");
export const EDUCATION_VALUES = optionsOf("education").filter((v) => v !== "Other");
/** The `partnerEducation` bars minus its neutral answer — expanded server-side via EDUCATION_FLOORS. */
export const EDUCATION_TIER_VALUES = optionsOf("partnerEducation").filter((v) => v !== "Koi farak nahi");
export const PROFESSION_CATEGORY_VALUES: readonly string[] = PROFESSION_CATEGORIES;
export const DIET_VALUES = optionsOf("diet");
export const SMOKING_VALUES = optionsOf("smoking");
export const DRINKING_VALUES = optionsOf("drinking");
export const LANGUAGE_VALUES = optionsOf("languagesKnown");
export const HOBBY_VALUES = optionsOf("hobbies");
export const RELOCATE_VALUES = optionsOf("relocateWilling");
export const FAMILY_TYPE_VALUES = optionsOf("familyType");
export const FAMILY_VALUES_VALUES = optionsOf("familyValues");
export const MANGLIK_VALUES = filterable("manglikStatus");
/** Ordered low → high; a "minimum income" filter is every bucket from the chosen one up. */
export const INCOME_BUCKETS = filterable("annualIncome");
export const COMMUNITY_VALUES: readonly string[] = [...new Set(Object.values(COMMUNITY_BY_RELIGION).flat())].sort();
export const STATE_VALUES: readonly string[] = INDIA_PLACES.map((s) => s.state);
export const CITY_VALUES: readonly string[] = [...new Set(INDIA_PLACES.flatMap((s) => s.cities))];
/** "Outside India" cities are countries; everything else is in India. */
export const COUNTRY_VALUES: readonly string[] = ["India", ...(INDIA_PLACES.find((s) => s.state === "Outside India")?.cities ?? [])];

export const SORT_VALUES = ["newest", "trust"] as const;
export type DiscoverSort = (typeof SORT_VALUES)[number];
export const MODE_VALUES = ["strict", "flexible"] as const;
export type DiscoverMode = (typeof MODE_VALUES)[number];
export const BEHAVIOR_MODES = ["none", "activity", "shortlist", "positive"] as const;
export type BehaviorMode = (typeof BEHAVIOR_MODES)[number];

/* ------------------------------------------------------------------ */
/* The filter shape                                                    */
/* ------------------------------------------------------------------ */

const list = (allowed?: readonly string[]) => {
  const item = z.string().trim().min(1).max(60);
  return z
    .array(allowed ? item.pipe(z.enum(allowed as [string, ...string[]])) : item)
    .max(DISCOVER_MAX_LIST_VALUES)
    .transform((arr) => [...new Set(arr)])
    .optional();
};
const freeText = (max = 60) => z.string().trim().min(1).max(max).optional();
const intBetween = (min: number, max: number) => z.number().int().min(min).max(max).optional();

/**
 * Lenient on the way in (a client may send `null` for "cleared", an array may
 * repeat a value), strict on the way out: every array is de-duplicated, every
 * enum value is one the catalog knows, every number is inside its range.
 * `null` is normalised to "absent" so the server never has to distinguish the
 * two.
 */
export const DiscoverFiltersSchema = z
  .object({
    lookingForGender: z.enum(GENDER_VALUES).optional(),
    name: z.string().trim().min(DISCOVER_NAME_MIN_CHARS).max(DISCOVER_NAME_MAX_CHARS).optional(),
    minAge: intBetween(DISCOVER_MIN_AGE, DISCOVER_MAX_AGE),
    maxAge: intBetween(DISCOVER_MIN_AGE, DISCOVER_MAX_AGE),
    minHeightCm: intBetween(DISCOVER_MIN_HEIGHT_CM, DISCOVER_MAX_HEIGHT_CM),
    maxHeightCm: intBetween(DISCOVER_MIN_HEIGHT_CM, DISCOVER_MAX_HEIGHT_CM),
    cities: list(),
    states: list(STATE_VALUES),
    countries: list(COUNTRY_VALUES),
    nativePlace: freeText(),
    maritalStatus: list(MARITAL_STATUS_VALUES),
    motherTongue: list(MOTHER_TONGUE_VALUES),
    religion: list(RELIGION_VALUES),
    community: list(),
    gotra: freeText(40),
    educationTier: z.enum(EDUCATION_TIER_VALUES as [string, ...string[]]).optional(),
    education: list(EDUCATION_VALUES),
    professionCategory: list(PROFESSION_CATEGORY_VALUES),
    jobTitle: freeText(),
    workCity: list(),
    minIncome: z.enum(INCOME_BUCKETS as [string, ...string[]]).optional(),
    diet: list(DIET_VALUES),
    smoking: list(SMOKING_VALUES),
    drinking: list(DRINKING_VALUES),
    languages: list(LANGUAGE_VALUES),
    hobbies: list(HOBBY_VALUES),
    relocate: list(RELOCATE_VALUES),
    familyType: list(FAMILY_TYPE_VALUES),
    familyValues: list(FAMILY_VALUES_VALUES),
    manglik: list(MANGLIK_VALUES),
    verifiedOnly: z.boolean().optional(),
    minTrustScore: intBetween(0, 100),
    minCompleteness: intBetween(0, 100),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.minAge != null && f.maxAge != null && f.minAge > f.maxAge) {
      ctx.addIssue({ code: "custom", path: ["minAge"], message: "Min age, max age se zyada nahi ho sakti." });
    }
    if (f.minHeightCm != null && f.maxHeightCm != null && f.minHeightCm > f.maxHeightCm) {
      ctx.addIssue({ code: "custom", path: ["minHeightCm"], message: "Min height, max height se zyada nahi ho sakti." });
    }
  });

export type DiscoverFilters = z.infer<typeof DiscoverFiltersSchema>;
export type DiscoverFilterKey = keyof DiscoverFilters;

/** Accepts a loose object (nulls, empty strings, empty arrays) and returns clean filters or the first error. */
export function parseDiscoverFilters(raw: unknown): { ok: true; filters: DiscoverFilters } | { ok: false; message: string } {
  const cleaned = stripEmpty(raw);
  const parsed = DiscoverFiltersSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "";
    return { ok: false, message: `${path ? `${path}: ` : ""}${issue?.message ?? "Filters valid nahi hain."}` };
  }
  return { ok: true, filters: parsed.data };
}

function stripEmpty(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v)) {
      const items = v.filter((x) => typeof x === "string" && x.trim().length > 0);
      if (items.length === 0) continue;
      out[k] = items;
      continue;
    }
    if (typeof v === "string" && v.trim().length === 0) continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Catalog metadata — labels, groups, consent, relaxability            */
/* ------------------------------------------------------------------ */

export type DiscoverFilterGroup = "basic" | "background" | "education" | "lifestyle" | "family" | "astrology" | "trust";
export type SensitiveConsentKey = "religion" | "caste" | "gotra" | "manglik" | "income";
export type FilterControlKind = "single" | "multi" | "text" | "number" | "bool";

export interface FilterCatalogEntry {
  key: DiscoverFilterKey;
  /** Hinglish label — the chip and the sheet both use it. */
  label: string;
  group: DiscoverFilterGroup;
  kind: FilterControlKind;
  options?: readonly string[];
  /** Which `ProfileDiscoveryConsent` switch a candidate must have on. */
  sensitive?: SensitiveConsentKey;
  /**
   * In FLEXIBLE mode, may this filter be the one a candidate misses? Hard
   * filters (identity, trust, every sensitive one) never relax — relaxing a
   * consent-gated filter would put non-matching, non-consenting rows in the
   * result under a label that names the field.
   */
  relaxable: boolean;
}

export const FILTER_CATALOG: readonly FilterCatalogEntry[] = [
  { key: "lookingForGender", label: "Looking for", group: "basic", kind: "single", options: GENDER_VALUES, relaxable: false },
  { key: "name", label: "Name", group: "basic", kind: "text", relaxable: false },
  { key: "minAge", label: "Min age", group: "basic", kind: "number", relaxable: true },
  { key: "maxAge", label: "Max age", group: "basic", kind: "number", relaxable: true },
  { key: "minHeightCm", label: "Min height", group: "basic", kind: "number", relaxable: true },
  { key: "maxHeightCm", label: "Max height", group: "basic", kind: "number", relaxable: true },
  { key: "cities", label: "City", group: "basic", kind: "multi", options: CITY_VALUES, relaxable: true },
  { key: "states", label: "State", group: "basic", kind: "multi", options: STATE_VALUES, relaxable: true },
  { key: "countries", label: "Country", group: "basic", kind: "multi", options: COUNTRY_VALUES, relaxable: true },
  { key: "nativePlace", label: "Native place", group: "basic", kind: "text", relaxable: true },
  { key: "maritalStatus", label: "Marital status", group: "basic", kind: "multi", options: MARITAL_STATUS_VALUES, relaxable: true },
  { key: "motherTongue", label: "Mother tongue", group: "background", kind: "multi", options: MOTHER_TONGUE_VALUES, relaxable: true },
  { key: "religion", label: "Religion", group: "background", kind: "multi", options: RELIGION_VALUES, sensitive: "religion", relaxable: false },
  { key: "community", label: "Caste / Community", group: "background", kind: "multi", options: COMMUNITY_VALUES, sensitive: "caste", relaxable: false },
  { key: "gotra", label: "Gotra", group: "background", kind: "text", sensitive: "gotra", relaxable: false },
  { key: "educationTier", label: "Highest education", group: "education", kind: "single", options: EDUCATION_TIER_VALUES, relaxable: true },
  { key: "education", label: "Degree", group: "education", kind: "multi", options: EDUCATION_VALUES, relaxable: true },
  { key: "professionCategory", label: "Profession", group: "education", kind: "multi", options: PROFESSION_CATEGORY_VALUES, relaxable: true },
  { key: "jobTitle", label: "Job title", group: "education", kind: "text", relaxable: true },
  { key: "workCity", label: "Work city", group: "education", kind: "multi", options: CITY_VALUES, relaxable: true },
  { key: "minIncome", label: "Minimum income", group: "education", kind: "single", options: INCOME_BUCKETS, sensitive: "income", relaxable: false },
  { key: "diet", label: "Diet", group: "lifestyle", kind: "multi", options: DIET_VALUES, relaxable: true },
  { key: "smoking", label: "Smoking", group: "lifestyle", kind: "multi", options: SMOKING_VALUES, relaxable: true },
  { key: "drinking", label: "Drinking", group: "lifestyle", kind: "multi", options: DRINKING_VALUES, relaxable: true },
  { key: "languages", label: "Languages", group: "lifestyle", kind: "multi", options: LANGUAGE_VALUES, relaxable: true },
  { key: "hobbies", label: "Hobbies", group: "lifestyle", kind: "multi", options: HOBBY_VALUES, relaxable: true },
  { key: "relocate", label: "Relocation", group: "lifestyle", kind: "multi", options: RELOCATE_VALUES, relaxable: true },
  { key: "familyType", label: "Family type", group: "family", kind: "multi", options: FAMILY_TYPE_VALUES, relaxable: true },
  { key: "familyValues", label: "Family values", group: "family", kind: "multi", options: FAMILY_VALUES_VALUES, relaxable: true },
  { key: "manglik", label: "Manglik", group: "astrology", kind: "multi", options: MANGLIK_VALUES, sensitive: "manglik", relaxable: false },
  { key: "verifiedOnly", label: "Verified only", group: "trust", kind: "bool", relaxable: false },
  { key: "minTrustScore", label: "Min trust score", group: "trust", kind: "number", relaxable: false },
  { key: "minCompleteness", label: "Min profile completeness", group: "trust", kind: "number", relaxable: false },
];

export const FILTER_BY_KEY: Record<string, FilterCatalogEntry> = Object.fromEntries(FILTER_CATALOG.map((f) => [f.key, f]));

export const FILTER_GROUP_LABELS: Record<DiscoverFilterGroup, string> = {
  basic: "Basic",
  background: "Background",
  education: "Education & career",
  lifestyle: "Lifestyle",
  family: "Family",
  astrology: "Astrology",
  trust: "Trust",
};

export const SENSITIVE_CONSENT_LABELS: Record<SensitiveConsentKey, string> = {
  religion: "Religion",
  caste: "Caste / Community",
  gotra: "Gotra",
  manglik: "Manglik status",
  income: "Annual income",
};

/**
 * Relaxation order for FLEXIBLE mode — the filter a candidate is *most*
 * allowed to miss comes first. Bounded because the query grows with the
 * square of the relaxable count; beyond `MAX_RELAXABLE` the most important
 * ones (end of this list) stay hard. Deterministic, so two searches with the
 * same filters always relax the same ones.
 */
export const RELAX_PRIORITY: readonly DiscoverFilterKey[] = [
  "hobbies",
  "languages",
  "familyValues",
  "familyType",
  "nativePlace",
  "workCity",
  "jobTitle",
  "minHeightCm",
  "maxHeightCm",
  "motherTongue",
  "drinking",
  "smoking",
  "diet",
  "relocate",
  "maritalStatus",
  "professionCategory",
  "education",
  "educationTier",
  "countries",
  "states",
  "cities",
  "minAge",
  "maxAge",
];
export const MAX_RELAXABLE = 8;

/* ------------------------------------------------------------------ */
/* Requests and responses                                              */
/* ------------------------------------------------------------------ */

export const DiscoverSearchRequestSchema = z
  .object({
    filters: z.unknown().optional(),
    mode: z.enum(MODE_VALUES).optional(),
    sort: z.enum(SORT_VALUES).optional(),
    behaviorMode: z.enum(BEHAVIOR_MODES).optional(),
    cursor: z.string().min(1).max(400).nullable().optional(),
    pageSize: z.number().int().min(1).max(DISCOVER_MAX_PAGE_SIZE).optional(),
  })
  .strict();

export interface DiscoverSearchRequest {
  filters: DiscoverFilters;
  mode: DiscoverMode;
  sort: DiscoverSort;
  behaviorMode: BehaviorMode;
  cursor: string | null;
  pageSize: number;
}

export type DiscoverReasonKind = "strict" | "flexible" | "behavior" | "none";

/**
 * "Kyun dikhaya" — computed from the candidate's stored values against the
 * filters that ran, never from a model. `matched`/`missed`/`unknown` hold the
 * catalog labels so the card can list them; `text` is the one-line Hinglish
 * sentence built from the same lists.
 */
export interface DiscoverReason {
  kind: DiscoverReasonKind;
  text: string;
  matched: string[];
  missed: string[];
  unknown: string[];
  /** Relaxable filters counted — "6 me se 5" is `matchedCount` of `total`. */
  total: number;
  matchedCount: number;
  /** Learned-dimension labels this candidate shares with the viewer's choices (behaviour mode only). */
  behaviorMatched: string[];
}

export interface DiscoverResultCard {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  verified: boolean;
  trustScore: number | null;
  trustLabel: string | null;
  /** Only set when `photoUnlocked` — a locked photo is never fetched or sent. */
  photoUrl: string | null;
  photoUnlocked: boolean;
  /** Why it is locked — see lib/contracts/photoLock.ts (D-90). */
  photoLock: import("@/lib/contracts/photoLock").PhotoLock;
  photoVerified: boolean;
  shortlisted: boolean;
  reason: DiscoverReason;
}

export type BehaviorLearningState = "off" | "paused" | "collecting" | "active";

export interface BehaviorStatus {
  mode: BehaviorMode;
  state: BehaviorLearningState;
  sampleSize: number;
  positiveCount: number;
  /** What "enough" means for this mode, so the UI never hard-codes 20. */
  threshold: { decisions: number; positive: number };
  /** Human labels of the learned values that were applied as filters. Empty unless active. */
  appliedDimensions: string[];
  message: string;
}

export interface RelaxationSuggestion {
  id: "nearbyCities" | "widenAge" | "dropVerified" | "dropTrust" | "flexibleMode" | "dropName";
  label: string;
  filters: DiscoverFilters;
  mode: DiscoverMode;
}

export type PreferenceEvidence = "NOT_PROVIDED" | "PARTIAL" | "COMPARABLE";

export interface DiscoverSearchResponse {
  ok: true;
  results: DiscoverResultCard[];
  nextCursor: string | null;
  /** "12+ profiles" while a next page exists — never a fabricated exact total. */
  countLabel: string;
  applied: {
    filters: DiscoverFilters;
    mode: DiscoverMode;
    sort: DiscoverSort;
    /** Which of the relaxable filters actually ran as soft (FLEXIBLE) — labels. */
    relaxable: string[];
    behavior: BehaviorStatus;
  };
  suggestions: RelaxationSuggestion[];
  preference: { state: PreferenceEvidence };
}

export interface DiscoverIntentResponse {
  ok: true;
  /** Deterministic Hinglish restatement of `filters` (see `describeFilters`) — not model prose. */
  summary: string;
  filters: DiscoverFilters;
  /** Parts of the request no filter can express — surfaced, never silently dropped. */
  unresolvedRequests: string[];
  /** At most one short question, only when confidence is low. */
  clarificationQuestion: string | null;
  confidence: number;
  behaviorMode: BehaviorMode;
}

export interface DiscoverApiError {
  ok: false;
  code: "plan" | "validation" | "rate_limited" | "ai_unavailable" | "unauthorized" | "unknown";
  message: string;
  retryAfterSeconds?: number;
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export interface FilterChip {
  /** Stable id for React keys and removal — `${key}` or `${key}:${value}`. */
  id: string;
  key: DiscoverFilterKey;
  label: string;
  /** Present for one value of a multi-value filter. */
  value?: string;
  sensitive: boolean;
}

export function cmToFeetInches(cm: number): string {
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

export function countActiveFilters(filters: DiscoverFilters): number {
  return filtersToChips(filters).length;
}

/** Age and height pairs collapse into one chip each; everything else is one chip per value. */
export function filtersToChips(filters: DiscoverFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  const push = (key: DiscoverFilterKey, label: string, value?: string) => {
    chips.push({ id: value ? `${key}:${value}` : key, key, label, value, sensitive: Boolean(FILTER_BY_KEY[key]?.sensitive) });
  };

  if (filters.lookingForGender) push("lookingForGender", filters.lookingForGender === "Ladki" ? "Ladki" : "Ladka");
  if (filters.name) push("name", `Naam: ${filters.name}`);
  if (filters.minAge != null || filters.maxAge != null) {
    push("minAge", `Age ${filters.minAge ?? DISCOVER_MIN_AGE}–${filters.maxAge ?? DISCOVER_MAX_AGE}`);
  }
  if (filters.minHeightCm != null || filters.maxHeightCm != null) {
    const lo = filters.minHeightCm != null ? cmToFeetInches(filters.minHeightCm) : null;
    const hi = filters.maxHeightCm != null ? cmToFeetInches(filters.maxHeightCm) : null;
    push("minHeightCm", `Height ${lo && hi ? `${lo}–${hi}` : lo ? `${lo}+` : `${hi} tak`}`);
  }
  const multi: [DiscoverFilterKey, string[] | undefined][] = [
    ["cities", filters.cities],
    ["states", filters.states],
    ["countries", filters.countries],
    ["maritalStatus", filters.maritalStatus],
    ["motherTongue", filters.motherTongue],
    ["religion", filters.religion],
    ["community", filters.community],
    ["education", filters.education],
    ["professionCategory", filters.professionCategory],
    ["workCity", filters.workCity?.map((c) => `Work: ${c}`)],
    ["diet", filters.diet],
    ["smoking", filters.smoking?.map((v) => `Smoking: ${v}`)],
    ["drinking", filters.drinking?.map((v) => `Drinking: ${v}`)],
    ["languages", filters.languages],
    ["hobbies", filters.hobbies],
    ["relocate", filters.relocate?.map((v) => `Relocate: ${v}`)],
    ["familyType", filters.familyType],
    ["familyValues", filters.familyValues?.map((v) => `Values: ${v}`)],
    ["manglik", filters.manglik?.map((v) => `Manglik: ${v}`)],
  ];
  for (const [key, values] of multi) {
    const raw = filters[key] as string[] | undefined;
    if (!values || !raw) continue;
    values.forEach((label, i) => push(key, label, raw[i]));
  }
  if (filters.nativePlace) push("nativePlace", `Native: ${filters.nativePlace}`);
  if (filters.gotra) push("gotra", `Gotra: ${filters.gotra}`);
  if (filters.educationTier) push("educationTier", filters.educationTier);
  if (filters.jobTitle) push("jobTitle", `Job: ${filters.jobTitle}`);
  if (filters.minIncome) push("minIncome", `Income ${filters.minIncome}+`);
  if (filters.verifiedOnly) push("verifiedOnly", "Verified only");
  if (filters.minTrustScore != null) push("minTrustScore", `Trust ${filters.minTrustScore}+`);
  if (filters.minCompleteness != null) push("minCompleteness", `Profile ${filters.minCompleteness}%+`);
  return chips;
}

/** The filter set with one chip removed — pairs (age, height) go together. */
export function removeChip(filters: DiscoverFilters, chip: FilterChip): DiscoverFilters {
  const next: DiscoverFilters = { ...filters };
  if (chip.key === "minAge" || chip.key === "maxAge") {
    delete next.minAge;
    delete next.maxAge;
    return next;
  }
  if (chip.key === "minHeightCm" || chip.key === "maxHeightCm") {
    delete next.minHeightCm;
    delete next.maxHeightCm;
    return next;
  }
  if (chip.value !== undefined) {
    const current = next[chip.key];
    if (Array.isArray(current)) {
      const remaining = current.filter((v) => v !== chip.value);
      if (remaining.length === 0) delete next[chip.key];
      else (next as Record<string, unknown>)[chip.key] = remaining;
      return next;
    }
  }
  delete next[chip.key];
  return next;
}

/* ------------------------------------------------------------------ */
/* Deterministic Hinglish summary                                      */
/* ------------------------------------------------------------------ */

function joinNatural(items: string[], conj = "aur"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

const DIET_WORD: Record<string, string> = {
  Veg: "vegetarian",
  "Non-veg": "non-vegetarian",
  "Egg khate hain": "eggetarian",
  "Jain veg": "Jain vegetarian",
  Vegan: "vegan",
};

/**
 * "25–29 saal ki, Jaipur ya Delhi me rehne wali, MBA, non-smoker aur manglik
 * ladki" — built from the canonical filters and nothing else, so the sentence
 * the user confirms is exactly the query that will run. Grammar follows the
 * gender being searched for; with no gender it stays neutral ("profiles").
 */
export function describeFilters(filters: DiscoverFilters): string {
  const g = filters.lookingForGender;
  const fem = g === "Ladki";
  const neutral = !g;
  const wali = neutral ? "wale" : fem ? "wali" : "wala";
  const ki = neutral ? "ke" : fem ? "ki" : "ka";
  const noun = neutral ? "profiles" : fem ? "ladki" : "ladka";

  const parts: string[] = [];
  if (filters.name) parts.push(`"${filters.name}" naam ${ki}`);
  if (filters.minAge != null || filters.maxAge != null) {
    const lo = filters.minAge;
    const hi = filters.maxAge;
    parts.push(lo != null && hi != null ? `${lo}–${hi} saal ${ki}` : lo != null ? `${lo} saal ya usse badi umar ${ki}` : `${hi} saal tak ${ki}`);
  }
  if (filters.minHeightCm != null || filters.maxHeightCm != null) {
    const lo = filters.minHeightCm != null ? cmToFeetInches(filters.minHeightCm) : null;
    const hi = filters.maxHeightCm != null ? cmToFeetInches(filters.maxHeightCm) : null;
    parts.push(`${lo && hi ? `${lo} se ${hi}` : lo ? `${lo} ya usse lambi` : `${hi} tak`} height ${ki}`);
  }
  const places = [...(filters.cities ?? []), ...(filters.states ?? []), ...(filters.countries ?? [])];
  if (places.length) parts.push(`${joinNatural(places, "ya")} me rehne ${wali}`);
  if (filters.nativePlace) parts.push(`${filters.nativePlace} ${ki} native`);
  if (filters.maritalStatus?.length) parts.push(joinNatural(filters.maritalStatus, "ya"));
  if (filters.motherTongue?.length) parts.push(`${joinNatural(filters.motherTongue, "ya")} bolne ${wali}`);
  if (filters.religion?.length) parts.push(joinNatural(filters.religion, "ya"));
  if (filters.community?.length) parts.push(joinNatural(filters.community, "ya"));
  if (filters.gotra) parts.push(`${filters.gotra} gotra ${ki}`);
  if (filters.educationTier) parts.push(filters.educationTier);
  if (filters.education?.length) parts.push(joinNatural(filters.education, "ya"));
  if (filters.professionCategory?.length) parts.push(`${joinNatural(filters.professionCategory, "ya")} me kaam karne ${wali}`);
  if (filters.jobTitle) parts.push(filters.jobTitle);
  if (filters.workCity?.length) parts.push(`${joinNatural(filters.workCity, "ya")} me kaam karne ${wali}`);
  if (filters.minIncome) parts.push(`${filters.minIncome} ya usse zyada income ${wali}`);
  if (filters.diet?.length) parts.push(joinNatural(filters.diet.map((d) => DIET_WORD[d] ?? d), "ya"));
  if (filters.smoking?.length) {
    parts.push(filters.smoking.length === 1 && filters.smoking[0] === "Nahi" ? "non-smoker" : `smoking: ${joinNatural(filters.smoking, "ya")}`);
  }
  if (filters.drinking?.length) {
    parts.push(filters.drinking.length === 1 && filters.drinking[0] === "Nahi" ? "non-drinker" : `drinking: ${joinNatural(filters.drinking, "ya")}`);
  }
  if (filters.languages?.length) parts.push(`${joinNatural(filters.languages, "aur")} jaanne ${wali}`);
  if (filters.hobbies?.length) parts.push(`${joinNatural(filters.hobbies, "ya")} ${ki} shaukeen`);
  if (filters.relocate?.length) {
    parts.push(filters.relocate.length === 1 && filters.relocate[0] === "Haan" ? "relocate karne ke liye ready" : `relocation: ${joinNatural(filters.relocate, "ya")}`);
  }
  if (filters.familyType?.length) parts.push(`${joinNatural(filters.familyType, "ya")} se`);
  if (filters.familyValues?.length) parts.push(`${joinNatural(filters.familyValues, "ya")} family values ${wali}`);
  if (filters.manglik?.length) {
    const words = filters.manglik.map((m) => (m === "Haan" ? "manglik" : m === "Nahi" ? "non-manglik" : "aanshik manglik"));
    parts.push(joinNatural(words, "ya"));
  }
  if (filters.verifiedOnly) parts.push("verified");
  if (filters.minTrustScore != null) parts.push(`trust score ${filters.minTrustScore}+ ${wali}`);
  if (filters.minCompleteness != null) parts.push(`${filters.minCompleteness}% se zyada bhari profile ${wali}`);

  if (parts.length === 0) return neutral ? "sabhi profiles" : `koi bhi ${noun}`;
  return `${joinNatural(parts)} ${noun}`;
}

/* ------------------------------------------------------------------ */
/* URL state                                                           */
/* ------------------------------------------------------------------ */

const URL_LIST_KEYS: DiscoverFilterKey[] = [
  "cities", "states", "countries", "maritalStatus", "motherTongue", "religion", "community", "education",
  "professionCategory", "workCity", "diet", "smoking", "drinking", "languages", "hobbies", "relocate",
  "familyType", "familyValues", "manglik",
];
const URL_SCALAR_KEYS: DiscoverFilterKey[] = [
  "lookingForGender", "name", "minAge", "maxAge", "minHeightCm", "maxHeightCm", "nativePlace", "gotra",
  "educationTier", "jobTitle", "minIncome", "verifiedOnly", "minTrustScore", "minCompleteness",
];
const NUMERIC_KEYS = new Set<DiscoverFilterKey>(["minAge", "maxAge", "minHeightCm", "maxHeightCm", "minTrustScore", "minCompleteness"]);

export interface DiscoverUrlState {
  filters: DiscoverFilters;
  mode: DiscoverMode;
  sort: DiscoverSort;
  behaviorMode: BehaviorMode;
  /** The typed/spoken sentence, kept so a refresh shows what was asked. */
  query: string;
}

/** Readable query parameters — `?cities=Jaipur,Delhi&minAge=25` — so back/refresh restore the search. */
export function stateToSearchParams(state: DiscoverUrlState): URLSearchParams {
  const p = new URLSearchParams();
  for (const key of URL_SCALAR_KEYS) {
    const v = state.filters[key];
    if (v === undefined || v === null || v === false) continue;
    p.set(key, String(v));
  }
  for (const key of URL_LIST_KEYS) {
    const v = state.filters[key] as string[] | undefined;
    if (v && v.length) p.set(key, v.join(","));
  }
  if (state.mode !== "strict") p.set("mode", state.mode);
  if (state.sort !== "newest") p.set("sort", state.sort);
  if (state.behaviorMode !== "none") p.set("behavior", state.behaviorMode);
  if (state.query) p.set("q", state.query.slice(0, DISCOVER_QUERY_MAX_CHARS));
  return p;
}

/** Tolerant: an unknown or malformed parameter is dropped rather than failing the whole page. */
export function stateFromSearchParams(params: URLSearchParams | Record<string, string | string[] | undefined>): DiscoverUrlState {
  const get = (k: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const raw: Record<string, unknown> = {};
  for (const key of URL_SCALAR_KEYS) {
    const v = get(key);
    if (v === undefined) continue;
    if (key === "verifiedOnly") raw[key] = v === "true" || v === "1";
    else if (NUMERIC_KEYS.has(key)) {
      const n = Number(v);
      if (Number.isFinite(n)) raw[key] = Math.round(n);
    } else raw[key] = v;
  }
  for (const key of URL_LIST_KEYS) {
    const v = get(key);
    if (v) raw[key] = v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Validate key by key so one bad value drops itself, not the whole set.
  const filters: DiscoverFilters = {};
  for (const [k, v] of Object.entries(raw)) {
    const single = DiscoverFiltersSchema.safeParse({ [k]: v });
    if (single.success) Object.assign(filters, single.data);
  }
  if (filters.minAge != null && filters.maxAge != null && filters.minAge > filters.maxAge) delete filters.maxAge;
  if (filters.minHeightCm != null && filters.maxHeightCm != null && filters.minHeightCm > filters.maxHeightCm) delete filters.maxHeightCm;

  const mode = get("mode");
  const sort = get("sort");
  const behavior = get("behavior");
  return {
    filters,
    mode: MODE_VALUES.includes(mode as DiscoverMode) ? (mode as DiscoverMode) : "strict",
    sort: SORT_VALUES.includes(sort as DiscoverSort) ? (sort as DiscoverSort) : "newest",
    behaviorMode: BEHAVIOR_MODES.includes(behavior as BehaviorMode) ? (behavior as BehaviorMode) : "none",
    query: (get("q") ?? "").slice(0, DISCOVER_QUERY_MAX_CHARS),
  };
}

/** True when a URL carried any search at all — the page then runs it instead of the first-use card. */
export function hasAnySearchState(state: DiscoverUrlState): boolean {
  return countActiveFilters(state.filters) > 0 || state.behaviorMode !== "none" || state.query.length > 0;
}
