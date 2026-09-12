/**
 * Free-form words → canonical filter values.
 *
 * The intent model is asked to answer in catalog values, and mostly does — but
 * "mostly" is the whole problem. A search for `education: "btech"` against a
 * column that stores `B.Tech` returns nothing, silently, and the user reads
 * that as "koi profile nahi hai". So every value that reaches the search
 * passes through here first, whether it came from the model, from a URL, or
 * from the legacy GET route: synonyms, spellings, Hindi/Hinglish words and
 * abbreviations collapse onto the one string the column actually holds, and
 * anything that still does not resolve is *reported* (`unresolved`) rather
 * than dropped, so "Xyzabad" comes back as "ye sheher nahi mila" instead of
 * as an empty result.
 *
 * Pure TypeScript — no prisma, no AI, no `server-only` — so the check script
 * can exercise every mapping without a database.
 */

import { INDIA_PLACES, professionCategoryFor } from "@/lib/profile/quickPicks";
import { EDUCATION_FLOORS } from "@/lib/services/match/preferenceScore";
import {
  CITY_VALUES,
  COMMUNITY_VALUES,
  COUNTRY_VALUES,
  DIET_VALUES,
  DISCOVER_MAX_AGE,
  DISCOVER_MAX_HEIGHT_CM,
  DISCOVER_MIN_AGE,
  DISCOVER_MIN_HEIGHT_CM,
  DISCOVER_NAME_MAX_CHARS,
  DRINKING_VALUES,
  EDUCATION_TIER_VALUES,
  EDUCATION_VALUES,
  FAMILY_TYPE_VALUES,
  FAMILY_VALUES_VALUES,
  HOBBY_VALUES,
  INCOME_BUCKETS,
  LANGUAGE_VALUES,
  MANGLIK_VALUES,
  MARITAL_STATUS_VALUES,
  MOTHER_TONGUE_VALUES,
  PROFESSION_CATEGORY_VALUES,
  RELIGION_VALUES,
  RELOCATE_VALUES,
  SMOKING_VALUES,
  STATE_VALUES,
  parseDiscoverFilters,
  type DiscoverFilters,
  type LookingForGender,
} from "@/lib/discovery/contract";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function key(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

/** Exact, case/punctuation-insensitive match against a catalog list. */
function exact(raw: string, options: readonly string[]): string | null {
  const k = key(raw);
  if (!k) return null;
  for (const o of options) if (key(o) === k) return o;
  return null;
}

/** First option whose synonym table contains the word; tables are checked in order, so put specific phrases first. */
function viaSynonyms(raw: string, table: ReadonlyArray<readonly [string, readonly string[]]>): string | null {
  const k = key(raw);
  if (!k) return null;
  for (const [canonical, words] of table) {
    if (words.some((w) => key(w) === k)) return canonical;
  }
  return null;
}

function containsAny(k: string, words: readonly string[]): boolean {
  return words.some((w) => k.includes(w));
}

/* ------------------------------------------------------------------ */
/* Places                                                              */
/* ------------------------------------------------------------------ */

const CITY_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Bengaluru", ["bangalore", "banglore", "bengalore", "blr", "bengaluru"]],
  ["Gurugram", ["gurgaon", "gurgoan", "gurugram"]],
  ["Mumbai", ["bombay", "mumbai", "bambai"]],
  ["Kolkata", ["calcutta", "kolkata", "kolkatta"]],
  ["Chennai", ["madras", "chennai"]],
  ["Pune", ["poona", "pune"]],
  ["Vadodara", ["baroda", "vadodara"]],
  ["Thiruvananthapuram", ["trivandrum", "thiruvananthapuram"]],
  ["Kochi", ["cochin", "kochi", "ernakulam"]],
  ["Mysuru", ["mysore", "mysuru"]],
  ["Mangaluru", ["mangalore", "mangaluru"]],
  ["Hubballi", ["hubli", "hubballi"]],
  ["Belagavi", ["belgaum", "belagavi"]],
  ["Prayagraj", ["allahabad", "prayagraj"]],
  ["Varanasi", ["benares", "banaras", "varanasi", "kashi"]],
  ["Shimla", ["simla", "shimla"]],
  ["Visakhapatnam", ["vizag", "visakhapatnam", "vishakhapatnam"]],
  ["Tiruchirappalli", ["trichy", "tiruchirappalli", "tiruchi"]],
  ["Thoothukudi", ["tuticorin", "thoothukudi"]],
  ["Kalaburagi", ["gulbarga", "kalaburagi"]],
  ["Ballari", ["bellary", "ballari"]],
  ["Shivamogga", ["shimoga", "shivamogga"]],
  ["Tumakuru", ["tumkur", "tumakuru"]],
  ["Vijayapura", ["bijapur", "vijayapura"]],
  ["Panaji", ["panjim", "panaji"]],
  ["Delhi", ["delhi", "dilli", "new delhi", "dehli"]],
  ["Hyderabad", ["hyderabad", "hydrabad", "hyd"]],
  ["Ahmedabad", ["ahmedabad", "ahmadabad", "amdavad"]],
  ["Jaipur", ["jaipur", "jaypur"]],
  ["Lucknow", ["lucknow", "lakhnau"]],
  ["Ayodhya", ["ayodhya", "faizabad"]],
  ["Aurangabad", ["aurangabad", "sambhajinagar", "chhatrapati sambhajinagar"]],
  ["UAE / Dubai", ["dubai", "uae", "abu dhabi", "sharjah", "emirates"]],
  ["USA", ["usa", "us", "america", "united states", "amrika"]],
  ["UK", ["uk", "london", "england", "britain", "united kingdom"]],
  ["Australia", ["australia", "sydney", "melbourne"]],
  ["Canada", ["canada", "toronto", "vancouver"]],
  ["Singapore", ["singapore"]],
  ["Germany", ["germany", "berlin"]],
  ["New Zealand", ["new zealand", "nz", "auckland"]],
  ["Qatar", ["qatar", "doha"]],
  ["Saudi Arabia", ["saudi", "saudi arabia", "riyadh", "jeddah"]],
  ["Oman", ["oman", "muscat"]],
  ["Kuwait", ["kuwait"]],
];

const STATE_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Delhi NCR", ["ncr", "delhi ncr", "ncr region"]],
  ["Uttar Pradesh", ["up", "uttar pradesh", "u p"]],
  ["Madhya Pradesh", ["mp", "madhya pradesh", "m p"]],
  ["Himachal Pradesh", ["hp", "himachal", "himachal pradesh"]],
  ["Andhra Pradesh", ["ap", "andhra", "andhra pradesh"]],
  ["Jammu & Kashmir", ["jammu", "kashmir", "j k", "jammu kashmir", "jammu and kashmir"]],
  ["West Bengal", ["bengal", "west bengal", "wb"]],
  ["Tamil Nadu", ["tamilnadu", "tamil nadu", "tn"]],
  ["Chhattisgarh", ["chattisgarh", "chhattisgarh", "cg"]],
  ["Uttarakhand", ["uttaranchal", "uttarakhand"]],
  ["Odisha", ["orissa", "odisha"]],
  ["Puducherry", ["pondicherry", "puducherry"]],
  ["Outside India", ["abroad", "videsh", "foreign", "nri", "overseas", "outside india", "bahar"]],
];

/** "Outside India" is not a place someone lives; it expands to every country in that group. */
const OUTSIDE_INDIA = INDIA_PLACES.find((s) => s.state === "Outside India")?.cities ?? [];

export interface PlaceResolution {
  cities: string[];
  states: string[];
  countries: string[];
}

/**
 * A spoken place → the catalog's city, state or country. "Bangalore" is a
 * city, "Rajasthan" a state, "Dubai" a country-entry, "NRI" the whole abroad
 * group; an unknown string resolves to nothing and is reported.
 */
export function resolvePlace(raw: string): PlaceResolution | null {
  const k = key(raw);
  if (!k) return null;

  const city = exact(raw, CITY_VALUES) ?? viaSynonyms(raw, CITY_SYNONYMS);
  if (city) {
    return OUTSIDE_INDIA.includes(city) ? { cities: [], states: [], countries: [city] } : { cities: [city], states: [], countries: [] };
  }
  const state = exact(raw, STATE_VALUES) ?? viaSynonyms(raw, STATE_SYNONYMS);
  if (state === "Outside India") return { cities: [], states: [], countries: [...OUTSIDE_INDIA] };
  if (state) return { cities: [], states: [state], countries: [] };
  if (key("india") === k || key("bharat") === k) return { cities: [], states: [], countries: ["India"] };

  // Unique prefix — "Gurugr", "Visakha". Four characters so "Ban" cannot mean
  // both Bengaluru and Banswara.
  if (k.length >= 4) {
    const hits = CITY_VALUES.filter((c) => key(c).startsWith(k));
    if (hits.length === 1) {
      const hit = hits[0];
      return OUTSIDE_INDIA.includes(hit) ? { cities: [], states: [], countries: [hit] } : { cities: [hit], states: [], countries: [] };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Enumerated fields                                                   */
/* ------------------------------------------------------------------ */

export function resolveGender(raw: string): LookingForGender | null {
  const k = key(raw);
  if (!k) return null;
  if (containsAny(k, ["ladki", "girl", "bride", "dulhan", "female", "woman", "women", "beti", "wife", "patni", "kanya", "vadhu", "daughter", "ladkiyan", "ladkiya"])) return "Ladki";
  if (containsAny(k, ["ladka", "boy", "groom", "dulha", "male", "man", "men", "beta", "husband", "pati", "var ", "son", "ladke"])) return "Ladka";
  return null;
}

const EDUCATION_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["B.Tech", ["btech", "b tech", "b e", "be", "bachelor of technology", "bachelor of engineering", "engineering degree", "b.tech", "b.e."]],
  ["M.Tech", ["mtech", "m tech", "m e", "me", "master of technology", "m.tech", "m.e."]],
  ["MBA", ["mba", "pgdm", "pgdbm", "master of business administration", "management degree"]],
  ["MBBS", ["mbbs", "medical degree"]],
  ["MD", ["md", "ms", "doctor of medicine"]],
  ["BDS", ["bds", "dental"]],
  ["B.Pharm", ["bpharm", "b pharm", "pharmacy", "b.pharm"]],
  ["B.Sc", ["bsc", "b sc", "b.sc", "bachelor of science"]],
  ["M.Sc", ["msc", "m sc", "m.sc", "master of science"]],
  ["B.Com", ["bcom", "b com", "b.com", "commerce graduate"]],
  ["M.Com", ["mcom", "m com", "m.com"]],
  ["B.A.", ["ba", "b a", "b.a", "b.a.", "bachelor of arts", "arts graduate"]],
  ["M.A.", ["ma", "m a", "m.a", "m.a.", "master of arts"]],
  ["BBA", ["bba", "bbm"]],
  ["BCA", ["bca"]],
  ["MCA", ["mca"]],
  ["LLB", ["llb", "law degree", "law graduate"]],
  ["LLM", ["llm"]],
  ["CA", ["ca", "chartered accountant", "chartered accountancy"]],
  ["CS", ["cs", "company secretary"]],
  ["PhD", ["phd", "ph d", "doctorate", "ph.d", "ph.d."]],
  ["Diploma", ["diploma", "polytechnic"]],
  ["ITI", ["iti"]],
  ["10th", ["10th", "10", "matric", "matriculation", "dasvi", "dasvin", "high school", "sslc"]],
  ["12th", ["12th", "12", "intermediate", "inter", "barvi", "barvin", "hsc", "senior secondary", "plus two", "+2"]],
];

const EDUCATION_TIER_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Post Graduate ya upar", ["post graduate", "postgraduate", "pg", "masters", "master s", "master", "post graduation", "pg ya upar", "post graduate ya upar", "m tech ya mba", "post graduate or above"]],
  ["Graduate ya upar", ["graduate", "graduation", "ug", "bachelor", "bachelors", "bachelor s", "degree", "graduate ya upar", "graduate or above", "college degree", "padhi likhi", "padha likha", "educated"]],
  ["Professional degree", ["professional", "professional degree", "professional qualification"]],
];

export interface EducationResolution {
  education: string[];
  tier: string | null;
}

/**
 * "MBA" is a degree; "post graduate" is a bar (every PG degree). The bar is
 * checked first on purpose: the catalog also stores the literal "Post
 * Graduate" / "Graduate" as the "koi aur PG/graduation" degree values, and
 * someone *searching* with that word means the level, not the one row that
 * picked "other".
 */
export function resolveEducation(raw: string): EducationResolution | null {
  const tier = exact(raw, EDUCATION_TIER_VALUES) ?? viaSynonyms(raw, EDUCATION_TIER_SYNONYMS);
  if (tier) return { education: [], tier };
  const degree = exact(raw, EDUCATION_VALUES) ?? viaSynonyms(raw, EDUCATION_SYNONYMS);
  if (degree) return { education: [degree], tier: null };
  return null;
}

/** The degrees a tier admits — `EDUCATION_FLOORS` is the same list the ranking uses, so the two never disagree. */
export function degreesForTier(tier: string): string[] {
  return EDUCATION_FLOORS[tier] ?? [];
}

const PROFESSION_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["IT / Software", ["it", "software", "software engineer", "developer", "programmer", "coder", "it professional", "techie", "tech", "computer", "data scientist", "data analyst"]],
  ["Government", ["government", "govt", "sarkari", "sarkari naukri", "government job", "psu", "ias", "ips", "civil services", "defence", "army", "fauji", "navy", "air force", "police", "railway", "railways"]],
  ["Healthcare", ["doctor", "doctors", "physician", "medical", "healthcare", "nurse", "dentist", "surgeon", "vaidya", "medico"]],
  ["Education", ["teacher", "teaching", "professor", "lecturer", "educator", "adhyapak", "shikshak", "tutor", "faculty"]],
  ["Banking / Finance", ["banker", "bank", "banking", "finance", "accountant", "accounts", "financial analyst", "insurance"]],
  ["Business", ["business", "businessman", "businesswoman", "vyapar", "vyapari", "trader", "shop", "dukaan", "entrepreneur", "own business", "family business"]],
  ["Law", ["lawyer", "advocate", "vakil", "legal", "law", "judge"]],
  ["Engineering", ["engineer", "engineers", "civil engineer", "mechanical engineer", "electrical engineer", "architect", "core engineering"]],
  ["Sales / Marketing", ["sales", "marketing", "business development", "digital marketing"]],
  ["Media / Creative", ["media", "journalist", "designer", "creative", "photographer", "writer", "content", "anchor"]],
  ["Hospitality", ["hotel", "hospitality", "chef", "cabin crew", "air hostess", "travel", "tourism"]],
  ["Administration", ["hr", "admin", "administration", "operations", "office job", "manager"]],
  ["Self-employed", ["self employed", "self-employed", "freelancer", "consultant", "apna kaam"]],
  ["Agriculture", ["farmer", "farming", "kheti", "kisan", "agriculture"]],
  ["Student", ["student", "studying", "padh rahi", "padh raha"]],
  ["Homemaker", ["homemaker", "housewife", "ghar sambhalti", "gharelu"]],
  ["Retired", ["retired"]],
];

export function resolveProfessionCategory(raw: string): string | null {
  return (
    exact(raw, PROFESSION_CATEGORY_VALUES) ??
    viaSynonyms(raw, PROFESSION_SYNONYMS) ??
    (professionCategoryFor(raw) && PROFESSION_CATEGORY_VALUES.includes(professionCategoryFor(raw)!) ? professionCategoryFor(raw)! : null)
  );
}

const DIET_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Jain veg", ["jain", "jain veg", "jain vegetarian", "no onion garlic"]],
  ["Vegan", ["vegan"]],
  ["Egg khate hain", ["egg", "eggs", "eggetarian", "anda", "egg khate hain", "veg with egg", "eggitarian"]],
  ["Non-veg", ["non veg", "nonveg", "non vegetarian", "nonvegetarian", "non-veg", "mansahari", "maansahari", "meat", "chicken", "non veg khate hain"]],
  ["Veg", ["veg", "vegetarian", "pure veg", "shakahari", "shudh shakahari", "veg only", "only veg", "shakaahaari"]],
];
export function resolveDiet(raw: string): string | null {
  return exact(raw, DIET_VALUES) ?? viaSynonyms(raw, DIET_SYNONYMS);
}

const SMOKING_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Nahi", ["nahi", "no", "never", "non smoker", "non-smoker", "nonsmoker", "doesn t smoke", "does not smoke", "no smoking", "smoking nahi", "smoke nahi karta", "smoke nahi karti", "non smoking"]],
  ["Kabhi-kabhi", ["kabhi kabhi", "kabhi-kabhi", "occasionally", "occasional", "social", "sometimes", "rarely"]],
  ["Haan", ["haan", "yes", "smoker", "smokes", "regular"]],
];
export function resolveSmoking(raw: string): string | null {
  return exact(raw, SMOKING_VALUES) ?? viaSynonyms(raw, SMOKING_SYNONYMS);
}

const DRINKING_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Nahi", ["nahi", "no", "never", "non drinker", "non-drinker", "nondrinker", "teetotaler", "teetotaller", "doesn t drink", "does not drink", "no drinking", "drinking nahi", "sharaab nahi", "no alcohol", "alcohol nahi"]],
  ["Sirf mauke par", ["sirf mauke par", "occasionally", "occasional", "social", "socially", "sometimes", "rarely", "mauke par", "kabhi kabhi"]],
  ["Haan", ["haan", "yes", "drinker", "drinks", "regular"]],
];
export function resolveDrinking(raw: string): string | null {
  return exact(raw, DRINKING_VALUES) ?? viaSynonyms(raw, DRINKING_SYNONYMS);
}

const MARITAL_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Never Married", ["never married", "unmarried", "single", "kunwara", "kunwari", "kuwara", "kuwari", "first marriage", "pehli shaadi", "shaadi nahi hui", "bachelor", "spinster", "nevermarried"]],
  ["Divorced", ["divorced", "divorcee", "talaqshuda", "talaq", "separated", "divorce"]],
  ["Widowed", ["widowed", "widow", "widower", "vidhwa", "vidhur"]],
];
export function resolveMaritalStatus(raw: string): string | null {
  return exact(raw, MARITAL_STATUS_VALUES) ?? viaSynonyms(raw, MARITAL_SYNONYMS);
}

const RELIGION_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Hindu", ["hindu", "hindus", "sanatan"]],
  ["Muslim", ["muslim", "muslims", "islam", "musalman", "islamic"]],
  ["Sikh", ["sikh", "sikhs", "sardar"]],
  ["Christian", ["christian", "christians", "isai", "catholic", "protestant"]],
  ["Jain", ["jain", "jains"]],
  ["Buddhist", ["buddhist", "bauddh", "buddhism"]],
  ["Parsi", ["parsi", "zoroastrian"]],
];
export function resolveReligion(raw: string): string | null {
  return exact(raw, RELIGION_VALUES) ?? viaSynonyms(raw, RELIGION_SYNONYMS);
}

export function resolveManglik(raw: string): string | null {
  const direct = exact(raw, MANGLIK_VALUES);
  if (direct) return direct;
  const k = key(raw);
  if (!k) return null;
  if (containsAny(k, ["anshik", "aanshik", "partial", "chandra", "low manglik"])) return "Aanshik manglik";
  // "non-manglik" contains "manglik" — the negation must win.
  if (containsAny(k, ["non manglik", "nonmanglik", "not manglik", "no manglik", "manglik nahi", "nahi", "no", "not"])) return "Nahi";
  if (containsAny(k, ["manglik", "mangalik", "mangal dosh", "haan", "yes"])) return "Haan";
  return null;
}

const FAMILY_TYPE_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Joint family", ["joint", "joint family", "sanyukt", "sanyukt parivar", "sanyukt parivaar", "bada parivar", "extended family"]],
  ["Nuclear family", ["nuclear", "nuclear family", "chhota parivar", "small family", "alag family", "ekal parivar"]],
];
export function resolveFamilyType(raw: string): string | null {
  return exact(raw, FAMILY_TYPE_VALUES) ?? viaSynonyms(raw, FAMILY_TYPE_SYNONYMS);
}

const FAMILY_VALUES_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Thoda dono", ["thoda dono", "both", "moderate", "mix", "balanced", "modern traditional", "traditional modern", "middle"]],
  ["Traditional", ["traditional", "paramparik", "sanskari", "orthodox", "conservative", "religious"]],
  ["Modern", ["modern", "liberal", "open minded", "progressive", "broad minded"]],
];
export function resolveFamilyValues(raw: string): string | null {
  return exact(raw, FAMILY_VALUES_VALUES) ?? viaSynonyms(raw, FAMILY_VALUES_SYNONYMS);
}

const RELOCATE_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Shaayad — baat kar sakte hain", ["shaayad", "shayad", "maybe", "depends", "can discuss", "baat kar sakte hain", "flexible", "open to discuss"]],
  ["Nahi", ["nahi", "no", "not willing", "cannot relocate", "relocate nahi", "no relocation", "won t relocate"]],
  ["Haan", ["haan", "yes", "ready", "willing", "ready to relocate", "relocate", "can relocate", "will relocate", "open to relocate", "relocate kar sakti", "relocate kar sakta", "relocation ok"]],
];
export function resolveRelocate(raw: string): string | null {
  return exact(raw, RELOCATE_VALUES) ?? viaSynonyms(raw, RELOCATE_SYNONYMS);
}

const LANGUAGE_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Bangla", ["bengali", "bangla", "bangali"]],
  ["Marwari", ["marwari", "marwadi"]],
  ["Gujarati", ["gujarati", "gujrati"]],
  ["English", ["english", "angrezi"]],
  ["Hindi", ["hindi"]],
  ["Punjabi", ["punjabi", "panjabi"]],
  ["Marathi", ["marathi"]],
  ["Tamil", ["tamil"]],
  ["Telugu", ["telugu", "telgu"]],
  ["Kannada", ["kannada", "kanada"]],
  ["Malayalam", ["malayalam", "malyalam"]],
  ["Odia", ["odia", "oriya"]],
  ["Bhojpuri", ["bhojpuri"]],
];
export function resolveLanguage(raw: string): string | null {
  return exact(raw, LANGUAGE_VALUES) ?? viaSynonyms(raw, LANGUAGE_SYNONYMS.filter(([c]) => LANGUAGE_VALUES.includes(c)));
}
export function resolveMotherTongue(raw: string): string | null {
  return exact(raw, MOTHER_TONGUE_VALUES) ?? viaSynonyms(raw, LANGUAGE_SYNONYMS.filter(([c]) => MOTHER_TONGUE_VALUES.includes(c)));
}

const HOBBY_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Padhna", ["reading", "books", "padhna", "kitaabein", "kitabe", "reader"]],
  ["Music", ["music", "gaana", "singing", "sangeet", "songs", "gaane"]],
  ["Sports", ["sports", "khel", "cricket", "football", "badminton", "gym", "fitness", "running", "athletics"]],
  ["Ghoomna", ["travel", "travelling", "traveling", "ghoomna", "trips", "trekking", "explore"]],
  ["Cooking", ["cooking", "khana banana", "baking", "cook"]],
  ["Photography", ["photography", "photos", "camera"]],
  ["Film", ["film", "films", "movies", "cinema", "web series", "netflix"]],
  ["Gardening", ["gardening", "bagwani", "plants"]],
  ["Yoga", ["yoga", "meditation", "dhyan"]],
];
export function resolveHobby(raw: string): string | null {
  return exact(raw, HOBBY_VALUES) ?? viaSynonyms(raw, HOBBY_SYNONYMS);
}

export function resolveCommunity(raw: string): string | null {
  const direct = exact(raw, COMMUNITY_VALUES);
  if (direct) return direct;
  const k = key(raw);
  const aliases: Record<string, string> = {
    agrawal: "Agarwal", aggarwal: "Agarwal", brahman: "Brahmin", bramhin: "Brahmin", rajpoot: "Rajput", jaat: "Jat",
    marathi: "Maratha", nayar: "Nair", reddi: "Reddy", khatri: "Khatri", sindhi: "Sindhi", baniya: "Vaishya", bania: "Vaishya",
    oswal: "Oswal", kayasth: "Kayastha",
  };
  if (aliases[k]) return aliases[k];
  // A community the list does not know is still a legitimate free-text
  // answer — `caste` is a text column — as long as it is a plausible word.
  const cleaned = raw.trim().replace(/[^\p{L}\p{M}\s'-]/gu, "").replace(/\s+/g, " ");
  return cleaned.length >= 3 && cleaned.length <= 40 ? cleaned : null;
}

/** "5 lakh se upar", "10 LPA", "above 20 lakhs", "1 crore" → the minimum bucket. */
export function resolveMinIncome(raw: string): string | null {
  const direct = exact(raw, INCOME_BUCKETS);
  if (direct) return direct;
  const k = key(raw);
  if (!k) return null;
  const crore = k.match(/(\d+(?:\.\d+)?)\s*(crore|cr)\b/);
  if (crore) return "50 lakh+";
  const lakh = k.match(/(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|lpa|l)\b/);
  const n = lakh ? Number(lakh[1]) : null;
  if (n == null || Number.isNaN(n)) return null;
  if (n < 3) return "3 lakh se kam";
  if (n < 5) return "3–5 lakh";
  if (n < 10) return "5–10 lakh";
  if (n < 20) return "10–20 lakh";
  if (n < 50) return "20–50 lakh";
  return "50 lakh+";
}

/** Every bucket at or above the chosen one — what "minimum income" means as a `in` list. */
export function incomeBucketsFrom(minBucket: string): string[] {
  const idx = INCOME_BUCKETS.indexOf(minBucket);
  return idx < 0 ? [] : INCOME_BUCKETS.slice(idx);
}

/** "5'4\"", "5 ft 4", "5 feet 4 inch", "5.4", "162 cm" → centimetres inside the catalog's range. */
export function resolveHeightCm(raw: string | number): number | null {
  if (typeof raw === "number") return clampHeight(raw > 90 ? raw : raw * 30.48);
  const s = raw.toLowerCase().replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'").trim();
  const cm = s.match(/(\d{2,3})\s*cm/);
  if (cm) return clampHeight(Number(cm[1]));
  const ftIn = s.match(/(\d)\s*(?:'|ft|feet|foot)\s*(\d{1,2})?\s*(?:"|in|inch|inches)?/);
  if (ftIn) return clampHeight((Number(ftIn[1]) * 12 + Number(ftIn[2] ?? 0)) * 2.54);
  const dotted = s.match(/^(\d)\.(\d{1,2})$/);
  if (dotted) return clampHeight((Number(dotted[1]) * 12 + Number(dotted[2])) * 2.54);
  const bare = s.match(/^(\d{3})$/);
  if (bare) return clampHeight(Number(bare[1]));
  return null;
}

function clampHeight(cm: number): number | null {
  const rounded = Math.round(cm);
  if (!Number.isFinite(rounded)) return null;
  if (rounded < DISCOVER_MIN_HEIGHT_CM || rounded > DISCOVER_MAX_HEIGHT_CM) return null;
  return rounded;
}

/* ------------------------------------------------------------------ */
/* Whole-object normalisation                                          */
/* ------------------------------------------------------------------ */

/**
 * The loose shape a model (or an old URL) may hand over: every value is a
 * string, a number, a boolean, or a list of strings — nothing is trusted to
 * already be canonical.
 */
export type LooseFilters = Record<string, unknown>;

export interface NormalizedFilters {
  filters: DiscoverFilters;
  /** Human-readable "X nahi samajh paaye" lines for values that resolved to nothing. */
  unresolved: string[];
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  if (typeof v === "string" && v.trim()) return v.split(/[,|/]|\bya\b|\bor\b/i).map((s) => s.trim()).filter(Boolean);
  return [];
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && /^\d{1,3}$/.test(v.trim())) return Number(v.trim());
  return null;
}

function clampAge(n: number | null): number | undefined {
  if (n == null) return undefined;
  return Math.min(DISCOVER_MAX_AGE, Math.max(DISCOVER_MIN_AGE, n));
}

/** Names carry no symbols; a query like `'; DROP` is just not a name. */
function cleanName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(/[^\p{L}\p{M}\s.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, DISCOVER_NAME_MAX_CHARS);
  return cleaned.length >= 2 ? cleaned : undefined;
}

function cleanText(v: unknown, max = 60): string | undefined {
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(/[^\p{L}\p{M}\p{N}\s.,'&/()-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned.length >= 2 ? cleaned : undefined;
}

/**
 * Loose values in, canonical `DiscoverFilters` out. Every list value goes
 * through its resolver; a value no resolver recognises is appended to
 * `unresolved` with its field name so the UI can say exactly what was not
 * understood. The final object is re-validated through the shared zod schema,
 * so this function can never return a filter the search would reject.
 */
export function normalizeLooseFilters(loose: LooseFilters): NormalizedFilters {
  const unresolved: string[] = [];
  const out: Record<string, unknown> = {};

  const resolveList = (
    field: string,
    values: string[],
    resolver: (raw: string) => string | null,
    label: string,
  ): string[] => {
    const resolved: string[] = [];
    for (const v of values) {
      const r = resolver(v);
      if (r) resolved.push(r);
      else unresolved.push(`${label}: "${v}"`);
    }
    const unique = [...new Set(resolved)];
    if (unique.length) out[field] = unique;
    return unique;
  };

  // Gender
  const genderRaw = loose.lookingForGender;
  if (typeof genderRaw === "string" && genderRaw.trim()) {
    const g = resolveGender(genderRaw);
    if (g) out.lookingForGender = g;
    else unresolved.push(`Looking for: "${genderRaw}"`);
  }

  // Name
  const name = cleanName(loose.name);
  if (name) out.name = name;
  else if (typeof loose.name === "string" && loose.name.trim()) unresolved.push(`Name: "${loose.name}"`);

  // Ages
  let minAge = clampAge(asInt(loose.minAge));
  let maxAge = clampAge(asInt(loose.maxAge));
  if (minAge != null && maxAge != null && minAge > maxAge) [minAge, maxAge] = [maxAge, minAge];
  if (minAge != null) out.minAge = minAge;
  if (maxAge != null) out.maxAge = maxAge;

  // Heights — accept numbers (cm) or strings ("5'4\"").
  for (const [k, src] of [["minHeightCm", loose.minHeightCm ?? loose.minHeight], ["maxHeightCm", loose.maxHeightCm ?? loose.maxHeight]] as const) {
    if (src === undefined || src === null || src === "") continue;
    const cm = typeof src === "number" || typeof src === "string" ? resolveHeightCm(src) : null;
    if (cm != null) out[k] = cm;
    else unresolved.push(`Height: "${String(src)}"`);
  }
  if (typeof out.minHeightCm === "number" && typeof out.maxHeightCm === "number" && out.minHeightCm > out.maxHeightCm) {
    [out.minHeightCm, out.maxHeightCm] = [out.maxHeightCm, out.minHeightCm];
  }

  // Places — cities, states and countries all pass through one resolver so a
  // "city" the model called "Rajasthan" still lands as a state.
  const cities = new Set<string>();
  const states = new Set<string>();
  const countries = new Set<string>();
  for (const [field, label] of [["cities", "City"], ["states", "State"], ["countries", "Country"]] as const) {
    for (const v of asList(loose[field])) {
      const place = resolvePlace(v);
      if (!place) {
        unresolved.push(`${label}: "${v}"`);
        continue;
      }
      place.cities.forEach((c) => cities.add(c));
      place.states.forEach((s) => states.add(s));
      place.countries.forEach((c) => countries.add(c));
    }
  }
  if (cities.size) out.cities = [...cities];
  if (states.size) out.states = [...states];
  if (countries.size) out.countries = [...countries].filter((c) => COUNTRY_VALUES.includes(c));

  const nativePlace = cleanText(loose.nativePlace);
  if (nativePlace) out.nativePlace = nativePlace;

  resolveList("maritalStatus", asList(loose.maritalStatus), resolveMaritalStatus, "Marital status");
  resolveList("motherTongue", asList(loose.motherTongue), resolveMotherTongue, "Mother tongue");
  resolveList("religion", asList(loose.religion), resolveReligion, "Religion");
  resolveList("community", [...asList(loose.community), ...asList(loose.caste)], resolveCommunity, "Caste / Community");
  const gotra = cleanText(loose.gotra, 40);
  if (gotra) out.gotra = gotra;

  // Education — degrees and tiers can arrive in either field.
  const degrees = new Set<string>();
  let tier: string | null = null;
  for (const v of [...asList(loose.education), ...asList(loose.degree)]) {
    const r = resolveEducation(v);
    if (!r) {
      unresolved.push(`Education: "${v}"`);
      continue;
    }
    r.education.forEach((d) => degrees.add(d));
    if (r.tier) tier = tier ?? r.tier;
  }
  const tierRaw = loose.educationTier;
  if (typeof tierRaw === "string" && tierRaw.trim()) {
    const r = resolveEducation(tierRaw);
    if (r?.tier) tier = r.tier;
    else if (r?.education.length) r.education.forEach((d) => degrees.add(d));
    else unresolved.push(`Education: "${tierRaw}"`);
  }
  if (degrees.size) out.education = [...degrees];
  if (tier) out.educationTier = tier;

  resolveList("professionCategory", asList(loose.professionCategory ?? loose.profession), resolveProfessionCategory, "Profession");
  const jobTitle = cleanText(loose.jobTitle);
  if (jobTitle) out.jobTitle = jobTitle;
  const workCities = new Set<string>();
  for (const v of asList(loose.workCity)) {
    const place = resolvePlace(v);
    if (place?.cities.length) place.cities.forEach((c) => workCities.add(c));
    else unresolved.push(`Work city: "${v}"`);
  }
  if (workCities.size) out.workCity = [...workCities];

  const incomeRaw = loose.minIncome ?? loose.income;
  if (typeof incomeRaw === "string" && incomeRaw.trim()) {
    const b = resolveMinIncome(incomeRaw);
    if (b) out.minIncome = b;
    else unresolved.push(`Income: "${incomeRaw}"`);
  }

  resolveList("diet", asList(loose.diet), resolveDiet, "Diet");
  resolveList("smoking", asList(loose.smoking), resolveSmoking, "Smoking");
  resolveList("drinking", asList(loose.drinking), resolveDrinking, "Drinking");
  resolveList("languages", asList(loose.languages), resolveLanguage, "Languages");
  resolveList("hobbies", asList(loose.hobbies), resolveHobby, "Hobbies");
  resolveList("relocate", asList(loose.relocate ?? loose.relocation), resolveRelocate, "Relocation");
  resolveList("familyType", asList(loose.familyType), resolveFamilyType, "Family type");
  resolveList("familyValues", asList(loose.familyValues), resolveFamilyValues, "Family values");
  resolveList("manglik", asList(loose.manglik ?? loose.manglikStatus), resolveManglik, "Manglik");

  if (typeof loose.verifiedOnly === "boolean") out.verifiedOnly = loose.verifiedOnly;
  else if (typeof loose.verifiedOnly === "string") out.verifiedOnly = /^(true|yes|haan|1)$/i.test(loose.verifiedOnly.trim());
  const trust = asInt(loose.minTrustScore);
  if (trust != null) out.minTrustScore = Math.min(100, Math.max(0, trust));
  const completeness = asInt(loose.minCompleteness);
  if (completeness != null) out.minCompleteness = Math.min(100, Math.max(0, completeness));

  // Key by key: a single value the schema refuses (a list past its cap, a
  // number outside its range) drops that key and reports it — it must never
  // take the rest of an otherwise good search down with it.
  const filters: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    const single = parseDiscoverFilters({ [k]: v });
    if (single.ok) Object.assign(filters, single.filters);
    else unresolved.push(single.message);
  }
  const parsed = parseDiscoverFilters(filters);
  if (parsed.ok) return { filters: parsed.filters, unresolved: [...new Set(unresolved)] };
  return { filters: {}, unresolved: [...new Set([...unresolved, parsed.message])] };
}

/**
 * The legacy `DiscoverySearchFilters` shape (`app/api/discover/search` GET,
 * the partner Client Desk) mapped onto the new one. Single strings become
 * one-element lists; a tier that was stored as an "education" preference
 * ("Graduate ya upar") becomes a tier instead of an impossible exact match.
 */
export function legacyToFilters(legacy: {
  nameQuery?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  cities?: string[];
  education?: string | null;
  professionCategory?: string | null;
  maritalStatus?: string | null;
  diet?: string | null;
  smoking?: string | null;
  drinking?: string | null;
  verifiedOnly?: boolean;
  minTrustScore?: number | null;
}): DiscoverFilters {
  return normalizeLooseFilters({
    name: legacy.nameQuery ?? undefined,
    minAge: legacy.minAge ?? undefined,
    maxAge: legacy.maxAge ?? undefined,
    cities: legacy.cities ?? [],
    education: legacy.education ? [legacy.education] : [],
    professionCategory: legacy.professionCategory ? [legacy.professionCategory] : [],
    maritalStatus: legacy.maritalStatus ? [legacy.maritalStatus] : [],
    diet: legacy.diet ? [legacy.diet] : [],
    smoking: legacy.smoking ? [legacy.smoking] : [],
    drinking: legacy.drinking ? [legacy.drinking] : [],
    verifiedOnly: legacy.verifiedOnly ?? false,
    minTrustScore: legacy.minTrustScore ?? undefined,
  }).filters;
}
