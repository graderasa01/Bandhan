import "server-only";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { ALL_CITIES, POPULAR_CITIES, PROFESSION_CATEGORIES } from "@/lib/profile/quickPicks";
import {
  FIND_MARKER_START,
  FIND_MARKER_END,
  MAX_FIND_CITIES,
  type GrioFindFilters,
} from "@/lib/contracts/grio";

/**
 * Grio searching, without Grio deciding.
 *
 * ## The split this whole file exists to hold
 *
 * `app/api/concierge/route.ts` opens with the reason Grio is blind to
 * candidates: *"a concierge that could see 'your matches' would immediately be
 * pulled into ranking or recommending a specific person — exactly what D-32
 * reserves for the deterministic pipeline."* Somebody asking Grio "mujhe
 * Jaipur me 26 se 31 ki doctor chahiye" is asking for something that sounds
 * like it needs exactly that, and it does not:
 *
 *   **Grio turns words into filters. The pipeline turns filters into people.**
 *
 * The model emits a filter set. It never sees a result, never orders one,
 * never says a word about anybody in the list. The search runs through
 * `searchDiscoveryCandidates` — the same deterministic query the Discover page
 * uses, behind the same plan gate — and the rows come back to the user's
 * screen without passing back through the model. So the capability the user
 * wanted is real, and the thing D-32 forbids never happens: no ranking, no
 * "isse baat kar lijiye", no candidate attribute in a prompt.
 *
 * ## Why the model's marker is rewritten and not merely read
 *
 * Every value below is matched *exactly* against a stored column. "IT",
 * "btech", "unmarried" and "doctor" are all reasonable things for a model to
 * emit and none of them is a value any row holds — a search built from them
 * returns nothing, and an empty result reads to the user as "there is nobody",
 * which is a lie about the membership rather than about the query.
 *
 * So the server validates the marker against the app's own catalogs and
 * rewrites it into canonical form before the reply leaves. What the client
 * receives is a marker it can trust without owning the catalogs, and anything
 * that could not be honoured travels as `skipped` — named, so the confirm card
 * can say "ye nahi laga paya" instead of quietly running a wider search than
 * the user asked for.
 */

/** Marital status, education, diet — read off the same defs that write the columns. */
function optionsOf(key: string): readonly string[] {
  return FIELD_BY_KEY[key]?.options ?? [];
}

const CATALOGS = {
  education: () => optionsOf("education"),
  profession: () => PROFESSION_CATEGORIES,
  maritalStatus: () => optionsOf("maritalStatus"),
  diet: () => optionsOf("diet"),
} as const;

type CatalogKey = keyof typeof CATALOGS;

/**
 * Case- and punctuation-insensitive lookup into a catalog.
 *
 * "b.tech", "BTech" and "B.Tech" are one intent and only the last is a value
 * any row holds. Normalising both sides costs one pass over a list of at most
 * thirty strings and turns a class of near-misses into hits — which matters
 * more here than anywhere else in the app, because the near-miss is silent:
 * the search simply returns nobody.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchCatalog(options: readonly string[], raw: string): string | null {
  const wanted = normalise(raw);
  if (!wanted) return null;
  return options.find((option) => normalise(option) === wanted) ?? null;
}

/** Cities are 298 rows, so the same match runs against a prebuilt index. */
const CITY_BY_NORMALISED = new Map(ALL_CITIES.map((city) => [normalise(city), city]));

export interface FindSpecResult {
  filters: GrioFindFilters;
  /**
   * What the model asked for that could not be honoured, in the model's own
   * words. Shown to the user; never sent back to the model, which would only
   * invite it to argue with the catalog.
   */
  skipped: string[];
  /** True when at least one usable filter survived. */
  usable: boolean;
}

const EMPTY: GrioFindFilters = {
  minAge: null,
  maxAge: null,
  cities: [],
  education: null,
  professionCategory: null,
  maritalStatus: null,
  diet: null,
  verifiedOnly: false,
};

function parseAge(raw: string): number | null {
  const n = Number(raw.trim());
  // The same 18 floor the search route enforces. A model emitting 17 is
  // proposing a search this product does not run, not a search to clamp.
  if (!Number.isInteger(n) || n < 18 || n > 100) return null;
  return n;
}

/**
 * Read one `<<<FIND:…>>>` marker into filters the search route will accept.
 *
 * Unknown keys are dropped without comment — the same failure mode an unknown
 * action key has, and for the same reason: a control the model invented is not
 * something to surface to the user as an error.
 */
export function parseFindSpec(body: string): FindSpecResult {
  const filters: GrioFindFilters = { ...EMPTY, cities: [] };
  const skipped: string[] = [];

  for (const pair of body.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!key || !value) continue;

    if (key === "minAge" || key === "maxAge") {
      const age = parseAge(value);
      if (age === null) skipped.push(value);
      else filters[key] = age;
      continue;
    }

    if (key === "cities") {
      for (const raw of value.split("|").map((c) => c.trim()).filter(Boolean)) {
        const city = CITY_BY_NORMALISED.get(normalise(raw));
        if (!city) skipped.push(raw);
        else if (!filters.cities.includes(city)) filters.cities.push(city);
      }
      // A model listing twelve cities is not a search anybody meant. Cut to the
      // cap and say which ones did not make it, rather than running a query so
      // wide the filter stops meaning anything.
      if (filters.cities.length > MAX_FIND_CITIES) {
        skipped.push(...filters.cities.slice(MAX_FIND_CITIES));
        filters.cities = filters.cities.slice(0, MAX_FIND_CITIES);
      }
      continue;
    }

    if (key === "verified") {
      filters.verifiedOnly = value === "1" || value.toLowerCase() === "true";
      continue;
    }

    if (key in CATALOGS) {
      const catalogKey = key as CatalogKey;
      const matched = matchCatalog(CATALOGS[catalogKey](), value);
      if (!matched) {
        skipped.push(value);
        continue;
      }
      if (catalogKey === "profession") filters.professionCategory = matched;
      else filters[catalogKey] = matched;
      continue;
    }
  }

  // A backwards age band is a typo with a silent result — no row is both older
  // than 31 and younger than 26 — so it is corrected rather than run.
  if (filters.minAge !== null && filters.maxAge !== null && filters.minAge > filters.maxAge) {
    [filters.minAge, filters.maxAge] = [filters.maxAge, filters.minAge];
  }

  const usable =
    filters.minAge !== null ||
    filters.maxAge !== null ||
    filters.cities.length > 0 ||
    filters.education !== null ||
    filters.professionCategory !== null ||
    filters.maritalStatus !== null ||
    filters.diet !== null ||
    filters.verifiedOnly;

  return { filters, skipped: [...new Set(skipped)], usable };
}

/** The canonical marker the client receives — built from validated values only. */
export function encodeFindSpec(result: FindSpecResult): string {
  const parts: string[] = [];
  const f = result.filters;
  if (f.minAge !== null) parts.push(`minAge=${f.minAge}`);
  if (f.maxAge !== null) parts.push(`maxAge=${f.maxAge}`);
  if (f.cities.length > 0) parts.push(`cities=${f.cities.join("|")}`);
  if (f.education) parts.push(`education=${f.education}`);
  if (f.professionCategory) parts.push(`profession=${f.professionCategory}`);
  if (f.maritalStatus) parts.push(`maritalStatus=${f.maritalStatus}`);
  if (f.diet) parts.push(`diet=${f.diet}`);
  if (f.verifiedOnly) parts.push("verified=1");
  if (result.skipped.length > 0) parts.push(`skipped=${result.skipped.join("|")}`);
  return `${FIND_MARKER_START}${parts.join(";")}${FIND_MARKER_END}`;
}

/**
 * Replace every `<<<FIND:…>>>` in a reply with its validated form.
 *
 * One per reply: a turn proposing two different searches gives the user two
 * buttons that cannot both be what they meant, and the second is dropped
 * rather than rendered. Every marker after the first disappears entirely, as
 * does a first one that produced no usable filter at all — a "search" with
 * nothing in it would open the full membership, which is not what anybody
 * asked for and is the one result this feature must never quietly produce.
 */
export function rewriteFindMarkers(reply: string): { reply: string; found: FindSpecResult | null } {
  let found: FindSpecResult | null = null;
  let out = "";
  let rest = reply;

  for (;;) {
    const start = rest.indexOf(FIND_MARKER_START);
    if (start === -1) {
      out += rest;
      break;
    }
    const afterStart = rest.slice(start + FIND_MARKER_START.length);
    const end = afterStart.indexOf(FIND_MARKER_END);
    if (end === -1) {
      // Truncated at maxTokens mid-marker. Drop the fragment; the words around
      // it survive, the same way an unterminated <<<SEND>>> does.
      out += rest.slice(0, start);
      break;
    }

    out += rest.slice(0, start);
    const parsed = parseFindSpec(afterStart.slice(0, end));
    if (found === null && parsed.usable) {
      found = parsed;
      out += encodeFindSpec(parsed);
    }
    rest = afterStart.slice(end + FIND_MARKER_END.length);
  }

  return { reply: out, found };
}

/**
 * Remove every search marker, keeping the words around it.
 *
 * For a member whose plan does not include search. The prompt already told the
 * model not to write one; this is the enforcement, because an entitlement that
 * lives only in an instruction is an entitlement one confused turn away from
 * being granted. The sentence the model wrote beside the marker survives — it
 * is ordinary text, and deleting it would leave a reply that answers nothing.
 */
export function stripFindMarkers(reply: string): string {
  let out = "";
  let rest = reply;
  for (;;) {
    const start = rest.indexOf(FIND_MARKER_START);
    if (start === -1) return out + rest;
    const afterStart = rest.slice(start + FIND_MARKER_START.length);
    const end = afterStart.indexOf(FIND_MARKER_END);
    out += rest.slice(0, start);
    if (end === -1) return out;
    rest = afterStart.slice(end + FIND_MARKER_END.length);
  }
}

/**
 * What the model is told about searching.
 *
 * Built from the same catalogs the validator checks against, so the two cannot
 * drift into a prompt that invites values the parser then drops. The city list
 * is the popular subset only — 298 names would be most of the context window,
 * and the validator accepts any of the full list anyway, so the short list is
 * a hint about format rather than a menu.
 */
export function buildFindInstructions(): string {
  const cities = POPULAR_CITIES.slice(0, 12).join(", ");
  return `

DHOONDHNA — agar user kehta hai ki unhe kaisi profile chahiye ("Jaipur me 26 se 31 ki ladki", "engineer ho aur veg ho", "sirf verified dikhao"), to aap search laga sakte hain.

Jawab ki pehli line me ye marker likhein, apni baat se pehle:
${FIND_MARKER_START}minAge=26;maxAge=31;cities=Jaipur;profession=Engineering;diet=Veg;verified=1${FIND_MARKER_END}

Sirf ye keys chalti hain — koi aur key likhenge to wo gir jayegi:
- minAge, maxAge — 18 se 100 ke beech poora number
- cities — ek ya do sheher, beech me | (jaise ${POPULAR_CITIES.slice(0, 3).join("|")}). Kuch aam sheher: ${cities}
- education — inhi me se ek: ${optionsOf("education").join(", ")}
- profession — inhi me se ek: ${PROFESSION_CATEGORIES.join(", ")}
- maritalStatus — inhi me se ek: ${optionsOf("maritalStatus").join(", ")}
- diet — inhi me se ek: ${optionsOf("diet").join(", ")}
- verified — 1 (sirf verified profiles)

Niyam:
- Ek jawab me sirf ek ${FIND_MARKER_START}…${FIND_MARKER_END}. Do alag search maangi jayein to pehli laga dijiye aur doosri ke liye poochh lijiye.
- Upar di gayi list me se hi value likhein, hu-ba-hu. "doctor" ki jagah Healthcare, "btech" ki jagah B.Tech. Jo list me nahi hai wo mat likhiye — wo filter lagega hi nahi.
- Marker ke baad ek chhoti si line likhein ki aap kya dhoondh rahe hain. Ye mat likhiye ki kitne log mile ya kaun mila — aapko results dikhte hi nahi hain, wo seedha user ki screen par jaate hain.
- Search apne aap nahi chalti. User ko ek button milta hai aur dabana unki marzi hai — to "ye rahe" ya "mil gaye" jaisa kuch mat likhiye.
- Kisi ek insaan ke baare me raay dena, kisi ko aage rakhna ya "inse baat kar lijiye" kehna aapka kaam nahi hai, na search ke pehle na baad me. Aap sirf sawaal ko filter me badalte hain.
- Agar user sirf general baat kar raha hai ("achhi profile kaise likhun") to search mat lagaiye.`;
}

/** Told to a member whose plan does not include search, instead of the above. */
export const FIND_LOCKED_INSTRUCTIONS = `

DHOONDHNA — is user ke plan me search filter abhi shaamil nahi hai, isliye aap search nahi laga sakte. Agar wo kisi khaas tarah ki profile maangein to seedha bata dijiye ki Discover page par filter wala search unke plan me nahi hai, aur ${"<<<ACT:openAdvancedDiscovery>>>"} button de dijiye jahan wo dekh sakte hain ki us feature me kya milta hai. Jhooth-moot search lagane ki koshish mat kijiye.`;
