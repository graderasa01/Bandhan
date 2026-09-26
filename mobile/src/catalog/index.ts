import { isValidFieldValue } from "~/shared/readiness";
import raw from "./catalog.generated.json";
import { FIELD_BY_KEY, PROFILE_FIELDS, type FieldDef } from "./fields";

/**
 * The web app's profile + search catalog, as the app bundles it — see
 * `scripts/sync-catalog.ts`. The fields live in `./fields` (a leaf, under the
 * web's own names); the rules that judge an answer — `isValidFieldValue`, the
 * eight a live profile needs — are the web's own `readiness.ts`, copied into
 * `src/shared/` rather than restated here. The small functions below mirror
 * their web namesakes (named on each). The server re-validates everything.
 */

export { FIELD_BY_KEY, type FieldDef, type FieldType } from "./fields";
export { MINIMUM_LIVE_FIELDS, MINIMUM_LIVE_KEYS, isValidFieldValue } from "~/shared/readiness";

export interface QuickNode {
  label: string;
  value?: string;
  ask?: string;
  children?: QuickNode[];
  icon?: string;
  category?: string;
}

export interface QuickEscape {
  label: string;
  value: string | null;
  icon?: string;
}

export type QuickInput =
  | { kind: "chips"; nodes: QuickNode[]; multi?: boolean; columns?: 1 | 2; dynamic?: "community" }
  | { kind: "wheel"; values: string[] }
  | { kind: "date" }
  | { kind: "time" }
  | { kind: "place"; shortcuts?: QuickNode[] }
  | { kind: "stepper"; stops: string[] }
  | { kind: "compose" }
  | { kind: "text" };

export interface QuickSpec {
  input: QuickInput;
  hint?: string;
  escapes?: QuickEscape[];
  other?: boolean;
  popular?: string[];
}

export interface Category {
  key: string;
  label: string;
  hint: string;
  fields: string[];
}

export type FilterKind = "single" | "multi" | "text" | "number" | "bool";

export interface FilterDef {
  key: string;
  label: string;
  group: "basic" | "background" | "education" | "lifestyle" | "family" | "astrology" | "trust";
  kind: FilterKind;
  options?: string[];
  sensitive?: string;
  relaxable: boolean;
}

export const FIELDS: FieldDef[] = PROFILE_FIELDS;
export const CATEGORIES = raw.categories as Category[];
export const QUICK_PICKS = raw.quickPicks as unknown as Record<string, QuickSpec>;
export const SAME_AS_PREFIX: string = raw.sameAsPrefix;
export const COMPOSE_CARDS = raw.composeCards as Array<{ key: string; ask: string; options: string[] }>;
export const PLACES = raw.places as Array<{ state: string; cities: string[] }>;
export const POPULAR_CITIES: string[] = raw.popularCities;
export const COMMUNITY_BY_RELIGION = raw.communityByReligion as Record<string, string[]>;

/** The safety sheet's report reasons — lib/constants/reportReasons.ts. */
export const REPORT_REASONS: string[] = raw.reportReasons;

/** "Reel dekhte-dekhte profile" pacing — lib/reel/feedQuestions.ts. */
export const FEED_QUESTIONS = raw.feedQuestions as {
  fields: string[];
  /** The partner-preference half — they change who is shown next, and the page says so. */
  preferenceFields: string[];
  never: string[];
  firstAfter: number;
  every: number;
  maxPerVisit: number;
  maxOptions: number;
};

/** `feedQuestionDue` in lib/reel/feedQuestions.ts — is the page after the current person a question? */
export function feedQuestionDue(p: { passed: number; lastAt: number; shown: number; left: number }): boolean {
  if (p.left <= 0 || p.shown >= FEED_QUESTIONS.maxPerVisit) return false;
  const gap = p.shown === 0 ? FEED_QUESTIONS.firstAfter : FEED_QUESTIONS.every;
  return p.passed - p.lastAt >= gap;
}

export const DISCOVER = {
  pageSize: raw.discover.pageSize,
  minAge: raw.discover.minAge,
  maxAge: raw.discover.maxAge,
  minHeightCm: raw.discover.minHeightCm,
  maxHeightCm: raw.discover.maxHeightCm,
  filters: raw.discover.filters as FilterDef[],
  groupLabels: raw.discover.groupLabels as Record<FilterDef["group"], string>,
  sensitiveLabels: raw.discover.sensitiveConsentLabels as Record<string, string>,
};

export const FILTER_BY_KEY: Record<string, FilterDef> = Object.fromEntries(DISCOVER.filters.map((f) => [f.key, f]));

/** The question for this field, in the voice of whoever is filling (`questionFor` in fields.ts). */
export function questionFor(field: FieldDef, forSelf: boolean): string {
  return forSelf ? field.question : field.questionForChild;
}

/**
 * A date of birth the profile would accept — DD/MM/YYYY or YYYY-MM-DD, a real
 * calendar day, age 18..100. Readiness keeps its own date check private, so
 * this asks the same question through the field it guards rather than
 * restating it.
 */
export function isPlausibleDate(raw: string): boolean {
  const dob = FIELD_BY_KEY.dateOfBirth;
  return dob ? isValidFieldValue(dob, raw) : false;
}

/** `isAnswered` in lib/profile/stages.ts. */
export function isAnswered(field: FieldDef, values: Record<string, string | undefined>): boolean {
  const v = (values[field.key] ?? "").trim();
  if (v.length === 0) return false;
  if (field.type === "select" && field.options && !field.options.includes(v)) return false;
  return true;
}

/** `communitiesFor` in quickPicks.ts — the community chips for the religion already answered. */
export function communitiesFor(religion: string | undefined): string[] {
  if (!religion) return [];
  return COMMUNITY_BY_RELIGION[religion] ?? [];
}

/** `searchCities` in quickPicks.ts. */
export function searchCities(query: string, limit = 24): Array<{ city: string; state: string }> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: Array<{ city: string; state: string }> = [];
  const contains: Array<{ city: string; state: string }> = [];
  for (const row of PLACES) {
    for (const city of row.cities) {
      const c = city.toLowerCase();
      if (c.startsWith(q)) starts.push({ city, state: row.state });
      else if (c.includes(q)) contains.push({ city, state: row.state });
      if (starts.length >= limit) return starts.slice(0, limit);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

const STATE_OF_CITY: Record<string, string> = {};
for (const row of PLACES) {
  for (const city of row.cities) {
    if (!(city in STATE_OF_CITY)) STATE_OF_CITY[city] = row.state;
  }
}

export function stateOfCity(city: string): string | null {
  return STATE_OF_CITY[city] ?? null;
}

/** `pathToValue` in quickPicks.ts — where in a cascade a stored value sits. */
export function pathToValue(nodes: QuickNode[], value: string): QuickNode[] | null {
  for (const n of nodes) {
    if (n.children) {
      const deeper = pathToValue(n.children, value);
      if (deeper) return [n, ...deeper];
    } else if ((n.value ?? n.label) === value) {
      return [n];
    }
  }
  return null;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} aur ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} aur ${items[items.length - 1]}`;
}

/** `composeAboutMe` in quickPicks.ts — three chip sets → two or three plain sentences. */
export function composeAboutMe(picks: Record<string, string[]>, ctx: { name?: string; forSelf: boolean }): string {
  const traits = picks.traits ?? [];
  const weekend = picks.weekend ?? [];
  const values = picks.values ?? [];
  const who = ctx.forSelf ? null : (ctx.name ?? "").trim().split(" ")[0] || null;
  const sentences: string[] = [];
  if (traits.length > 0) {
    sentences.push(
      who
        ? `${who} ${joinList(traits.map((t) => t.toLowerCase()))} hain.`
        : `Main ${joinList(traits.map((t) => t.toLowerCase()))} hoon.`,
    );
  }
  if (weekend.length > 0) sentences.push(`Free time ${joinList(weekend.map((w) => w.toLowerCase()))} nikalta hai.`);
  if (values.length > 0) sentences.push(`Rishte me ${joinList(values.map((v) => v.toLowerCase()))} sabse zyada matter karta hai.`);
  return sentences.join(" ");
}

/** Height option ("5'7\"") → cm, for the search sheet's height filter. */
export function heightToCm(value: string): number | null {
  const m = value.match(/^(\d)'(\d{1,2})"$/);
  if (!m) return null;
  return Math.round((Number(m[1]) * 12 + Number(m[2])) * 2.54);
}

export function cmToHeight(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
