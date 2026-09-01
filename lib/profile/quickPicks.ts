/**
 * The tap catalog — how each profile field is *answered* without typing.
 *
 * `fields.ts` stays the single source of what is asked, what is required, what
 * the AI may extract and what may never be embedded. This file is a second,
 * purely presentational layer on top of it: for a given field key, what does
 * the fastest possible answer look like — chips, a cascade, a wheel, a place
 * picker, a stepper?
 *
 * ## The one hard rule
 *
 * **A leaf's stored value must be a value the rest of the app already
 * accepts.** For a `select` field that means the value has to appear in that
 * field's own `options` (see `isAnswered` in stages.ts — a select answer
 * outside its option list is not an answer). For a `text` field anything
 * goes, which is exactly why the cascades below live on the text fields:
 * profession, city, caste, the parents' occupations. `scripts/quick-picks-
 * check.ts` asserts the first half of that in code rather than leaving it to
 * whoever edits this file next.
 *
 * ## Why the value is not a code
 *
 * The obvious design is to store `WORK_IT_SOFTWARE` and render a label. This
 * app already solves that problem the other way round and has done since the
 * i18n pass: the *stored* string is the canonical key, and a locale only
 * changes what is printed (`lib/i18n/catalogKeys.ts`). Matching, filters,
 * biodata export, the AI extraction schema and every existing row in
 * production all speak those strings. Introducing a parallel code vocabulary
 * would mean two spellings of every answer and a migration across all of it,
 * and would buy nothing the render-time translation does not already give.
 *
 * So: the chip's *label* may differ from the value it stores (`value` below),
 * but the value is always the app's own word for that answer.
 */

import { FIELD_BY_KEY } from "./fields";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/**
 * One chip. A node with `children` is a *branch*: tapping it does not answer
 * the field, it swaps the card's question for `ask` and its chips for the
 * children — same card, same progress count. That in-place morph is the whole
 * reason a three-step profession question is not three cards.
 */
export type QuickNode = {
  /** What the chip says. */
  label: string;
  /** What gets stored when this is a leaf. Defaults to `label`. */
  value?: string;
  /** The question this branch asks once tapped. Required when `children` is set. */
  ask?: string;
  children?: QuickNode[];
  /** Key into `QUICK_ICON` (SmartProfileDeck) — decoration only. */
  icon?: string;
  /**
   * Fills `ProfileProfession.professionCategory` for every leaf beneath it.
   * Set on the industry level of the work tree, not on individual roles.
   */
  category?: string;
};

export type QuickEscape = {
  /** English on purpose — see the deck's own note on escape wording. */
  label: string;
  /**
   * The value to store, or `null` to record nothing and move on. A non-null
   * value must be a real option on a `select` field.
   */
  value: string | null;
  icon?: string;
};

export type QuickInput =
  /** Chips, optionally branching (a cascade) or multi-select. */
  | {
      kind: "chips";
      nodes: QuickNode[];
      multi?: boolean;
      columns?: 1 | 2;
      /**
       * Chips this field cannot know at build time. `"community"` appends the
       * list for whichever religion the user has already answered — asking a
       * Sikh family to scroll past twenty-eight Hindu communities is the
       * fastest way to make a controlled list feel worse than a text box.
       */
      dynamic?: "community";
    }
  /** A snap wheel over a fixed value list — height. */
  | { kind: "wheel"; values: string[] }
  /** Day / month / year wheels. Stores DD/MM/YYYY. */
  | { kind: "date" }
  /** Hour / minute / AM-PM wheels. Stores "subah 6:30" style Hinglish. */
  | { kind: "time" }
  /** State → city, with shortcuts on top. */
  | { kind: "place"; shortcuts?: QuickNode[] }
  /** A -/+ counter over fixed stops. */
  | { kind: "stepper"; stops: string[] }
  /** Three chip questions that compose a paragraph — About Me. */
  | { kind: "compose" }
  /** The two fields typing genuinely wins: a person's name, a gotra. */
  | { kind: "text" };

export type QuickSpec = {
  input: QuickInput;
  /** One quiet line under the question. Not a `whyNeeded` — that has its own tip. */
  hint?: string;
  /** "Don't know" / "Prefer not to say" and friends. */
  escapes?: QuickEscape[];
  /**
   * Offer "Not listed" → a one-line text box. Only ever set on `text` fields:
   * on a `select`, a hand-typed value would fail `isAnswered` and the answer
   * would silently vanish.
   */
  other?: boolean;
  /**
   * Answers seen most often, floated to the top of a long list. Used by the
   * place picker so nine out of ten people never open a state.
   */
  popular?: string[];
};

/* ------------------------------------------------------------------ */
/* The shared escapes                                                  */
/*                                                                     */
/* English, deliberately, and the same three words everywhere. These    */
/* are the outs a person reaches for when a question does not apply to  */
/* them, and an out you have to *read* is not an out. Short, familiar   */
/* English reads as a button; "Batana nahi chahte" reads as one more    */
/* answer to consider.                                                  */
/* ------------------------------------------------------------------ */

/** Nothing is stored — the gap engine stops offering the field. */
export const SKIP: QuickEscape = { label: "Skip", value: null, icon: "skip" };
/** Genuinely does not know. Same effect as skip, different sentence. */
export const DONT_KNOW: QuickEscape = { label: "Don't know", value: null, icon: "unknown" };
/** Knows, won't say. Where the catalog has its own opt-out value, use it. */
export const PRIVATE: QuickEscape = { label: "Prefer not to say", value: null, icon: "private" };
const PRIVATE_STORED: QuickEscape = {
  label: "Prefer not to say",
  value: "Batana nahi chahte",
  icon: "private",
};
/** manglikStatus is the one select whose own option list carries "don't know". */
const DONT_KNOW_STORED: QuickEscape = { label: "Don't know", value: "Pata nahi", icon: "unknown" };

/* ------------------------------------------------------------------ */
/* Places — State → City                                               */
/*                                                                     */
/* Hand-kept, same reasoning as `kundli/places.ts`: a fixed list is the */
/* only version of this that makes the city filter work. A free text    */
/* box produces "Bangalore", "bangalore", "Banglore" and "Bengaluru" as */
/* four different cities, and `discoverySearchService`'s `currentCity:  */
/* { in: [...] }` matches none of them to each other. The list is not   */
/* every city in India and does not need to be — "Not listed" below it  */
/* keeps the rare answer possible, and the top ~350 covers where the    */
/* users are.                                                          */
/* ------------------------------------------------------------------ */

export type StatePlaces = { state: string; cities: string[] };

export const INDIA_PLACES: StatePlaces[] = [
  {
    state: "Rajasthan",
    cities: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Bhilwara", "Sikar", "Sri Ganganagar", "Pali", "Churu", "Jhunjhunu", "Nagaur", "Chittorgarh", "Banswara", "Barmer", "Hanumangarh"],
  },
  {
    state: "Delhi NCR",
    cities: ["Delhi", "New Delhi", "Noida", "Greater Noida", "Gurugram", "Ghaziabad", "Faridabad", "Dwarka", "Rohini"],
  },
  {
    state: "Uttar Pradesh",
    cities: ["Lucknow", "Kanpur", "Agra", "Varanasi", "Prayagraj", "Meerut", "Bareilly", "Aligarh", "Moradabad", "Gorakhpur", "Jhansi", "Mathura", "Saharanpur", "Firozabad", "Muzaffarnagar", "Ayodhya", "Rae Bareli", "Sultanpur"],
  },
  {
    state: "Maharashtra",
    cities: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Navi Mumbai", "Aurangabad", "Solapur", "Kolhapur", "Amravati", "Nanded", "Sangli", "Jalgaon", "Akola", "Latur", "Ahmednagar", "Satara", "Ratnagiri"],
  },
  {
    state: "Gujarat",
    cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Junagadh", "Anand", "Nadiad", "Bharuch", "Mehsana", "Navsari", "Porbandar", "Bhuj", "Valsad"],
  },
  {
    state: "Madhya Pradesh",
    cities: ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa", "Chhindwara", "Khandwa", "Katni", "Vidisha", "Shivpuri"],
  },
  {
    state: "Karnataka",
    cities: ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi", "Davanagere", "Ballari", "Kalaburagi", "Shivamogga", "Tumakuru", "Udupi", "Hassan", "Bidar", "Vijayapura"],
  },
  {
    state: "Tamil Nadu",
    cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Erode", "Vellore", "Tiruppur", "Thanjavur", "Dindigul", "Thoothukudi", "Nagercoil", "Kanchipuram"],
  },
  {
    state: "Telangana",
    cities: ["Hyderabad", "Secunderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Ramagundam", "Mahbubnagar", "Nalgonda", "Siddipet"],
  },
  {
    state: "Andhra Pradesh",
    cities: ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati", "Rajahmundry", "Kakinada", "Kurnool", "Anantapur", "Kadapa", "Eluru", "Ongole"],
  },
  {
    state: "West Bengal",
    cities: ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Kharagpur", "Haldia", "Darjeeling", "Jalpaiguri"],
  },
  {
    state: "Punjab",
    cities: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Pathankot", "Hoshiarpur", "Moga", "Firozpur", "Sangrur", "Batala"],
  },
  {
    state: "Haryana",
    cities: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Karnal", "Rohtak", "Sonipat", "Yamunanagar", "Panchkula", "Bhiwani", "Sirsa", "Rewari"],
  },
  {
    state: "Bihar",
    cities: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Ara", "Begusarai", "Chhapra", "Katihar", "Munger", "Bihar Sharif"],
  },
  {
    state: "Kerala",
    cities: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Alappuzha", "Palakkad", "Kottayam", "Malappuram", "Pathanamthitta"],
  },
  {
    state: "Odisha",
    cities: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Bhadrak", "Baripada"],
  },
  {
    state: "Jharkhand",
    cities: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Hazaribagh", "Giridih", "Ramgarh"],
  },
  {
    state: "Chhattisgarh",
    cities: ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Raigarh", "Jagdalpur"],
  },
  {
    state: "Assam",
    cities: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon"],
  },
  {
    state: "Uttarakhand",
    cities: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Kashipur", "Rishikesh", "Nainital"],
  },
  {
    state: "Himachal Pradesh",
    cities: ["Shimla", "Solan", "Mandi", "Dharamshala", "Baddi", "Una", "Bilaspur", "Kullu"],
  },
  {
    state: "Jammu & Kashmir",
    cities: ["Jammu", "Srinagar", "Anantnag", "Baramulla", "Udhampur", "Kathua"],
  },
  { state: "Goa", cities: ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"] },
  { state: "Chandigarh", cities: ["Chandigarh"] },
  { state: "Puducherry", cities: ["Puducherry", "Karaikal"] },
  { state: "Tripura", cities: ["Agartala", "Udaipur (Tripura)", "Dharmanagar"] },
  { state: "Manipur", cities: ["Imphal", "Thoubal", "Churachandpur"] },
  { state: "Meghalaya", cities: ["Shillong", "Tura", "Jowai"] },
  { state: "Nagaland", cities: ["Kohima", "Dimapur", "Mokokchung"] },
  { state: "Mizoram", cities: ["Aizawl", "Lunglei"] },
  { state: "Arunachal Pradesh", cities: ["Itanagar", "Naharlagun", "Pasighat"] },
  { state: "Sikkim", cities: ["Gangtok", "Namchi"] },
  {
    state: "Outside India",
    cities: ["USA", "Canada", "UK", "Australia", "UAE / Dubai", "Singapore", "New Zealand", "Germany", "Qatar", "Saudi Arabia", "Oman", "Kuwait", "Other country"],
  },
];

/** The dozen cities that answer this question most of the time. */
export const POPULAR_CITIES = [
  "Jaipur", "Delhi", "Mumbai", "Bengaluru", "Pune", "Hyderabad",
  "Ahmedabad", "Gurugram", "Noida", "Chennai", "Kolkata", "Lucknow",
];

const STATE_OF_CITY: Record<string, string> = {};
for (const row of INDIA_PLACES) {
  for (const city of row.cities) {
    if (!(city in STATE_OF_CITY)) STATE_OF_CITY[city] = row.state;
  }
}

/** Which state a picked city belongs to — used to label the chosen chip. */
export function stateOfCity(city: string): string | null {
  return STATE_OF_CITY[city] ?? null;
}

export const ALL_CITIES: string[] = INDIA_PLACES.flatMap((s) => s.cities);

/** Substring search across every city, state name included in the haystack. */
export function searchCities(query: string, limit = 24): { city: string; state: string }[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: { city: string; state: string }[] = [];
  const contains: { city: string; state: string }[] = [];
  for (const row of INDIA_PLACES) {
    for (const city of row.cities) {
      const c = city.toLowerCase();
      if (c.startsWith(q)) starts.push({ city, state: row.state });
      else if (c.includes(q)) contains.push({ city, state: row.state });
      if (starts.length >= limit) return starts.slice(0, limit);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Work — status → industry → role                                     */
/*                                                                     */
/* The `category` on each industry is not decoration: it is what fills  */
/* `ProfileProfession.professionCategory`, a column discovery search    */
/* and behaviour learning both read and which — until this landed —     */
/* nothing had ever written. See `professionCategoryFor` below.         */
/* ------------------------------------------------------------------ */

const ROLE_ASK = "Aapka role kya hai?";

function roles(...labels: string[]): QuickNode[] {
  return labels.map((label) => ({ label }));
}

export const WORK_TREE: QuickNode[] = [
  {
    label: "Job",
    icon: "briefcase",
    ask: "Kis field mein?",
    children: [
      {
        label: "IT / Software", category: "IT / Software", icon: "code", ask: ROLE_ASK,
        children: roles("Software Engineer", "Senior Engineer", "Team Lead", "Data Analyst", "Data Scientist", "QA Engineer", "DevOps Engineer", "Product Manager", "UI/UX Designer", "IT Support"),
      },
      {
        label: "Banking / Finance", category: "Banking / Finance", icon: "rupee", ask: ROLE_ASK,
        children: roles("Bank Officer", "Accountant", "Financial Analyst", "Relationship Manager", "Auditor", "Insurance Advisor", "Branch Manager"),
      },
      {
        label: "Healthcare", category: "Healthcare", icon: "stethoscope", ask: ROLE_ASK,
        children: roles("Doctor", "Dentist", "Nurse", "Pharmacist", "Physiotherapist", "Lab Technician", "Hospital Administration"),
      },
      {
        label: "Education", category: "Education", icon: "graduation", ask: ROLE_ASK,
        children: roles("Teacher", "Professor", "Lecturer", "Principal", "Trainer", "Research Scholar", "School Administration"),
      },
      {
        label: "Engineering / Core", category: "Engineering", icon: "wrench", ask: ROLE_ASK,
        children: roles("Civil Engineer", "Mechanical Engineer", "Electrical Engineer", "Site Engineer", "Production Engineer", "Quality Engineer", "Architect"),
      },
      {
        label: "Sales / Marketing", category: "Sales / Marketing", icon: "trending", ask: ROLE_ASK,
        children: roles("Sales Executive", "Area Sales Manager", "Marketing Manager", "Digital Marketing", "Business Development", "Retail Manager"),
      },
      {
        label: "Government / PSU", category: "Government", icon: "landmark", ask: ROLE_ASK,
        children: roles("Government Officer", "Clerk", "Police", "Defence", "Railways", "Bank (PSU)", "Teacher (Government)"),
      },
      {
        label: "Law", category: "Law", icon: "scale", ask: ROLE_ASK,
        children: roles("Advocate", "Legal Advisor", "Company Secretary", "Judge / Judiciary"),
      },
      {
        label: "Media / Creative", category: "Media / Creative", icon: "camera", ask: ROLE_ASK,
        children: roles("Journalist", "Content Writer", "Graphic Designer", "Photographer", "Video Editor", "Anchor"),
      },
      {
        label: "Hotel / Travel", category: "Hospitality", icon: "plane", ask: ROLE_ASK,
        children: roles("Hotel Management", "Chef", "Cabin Crew", "Travel Consultant", "Event Manager"),
      },
      {
        label: "Administration / HR", category: "Administration", icon: "users", ask: ROLE_ASK,
        children: roles("HR Executive", "HR Manager", "Office Administrator", "Operations Executive", "Executive Assistant"),
      },
      { label: "Other sector", category: "Other", value: "Private Job" },
    ],
  },
  {
    label: "Business",
    icon: "store",
    ask: "Kis tarah ka business?",
    children: [
      { label: "Retail / Shop", category: "Business", value: "Business — Retail" },
      { label: "Wholesale / Trading", category: "Business", value: "Business — Trading" },
      { label: "Manufacturing", category: "Business", value: "Business — Manufacturing" },
      { label: "Real Estate", category: "Business", value: "Business — Real Estate" },
      { label: "Construction", category: "Business", value: "Business — Construction" },
      { label: "Textile", category: "Business", value: "Business — Textile" },
      { label: "Jewellery", category: "Business", value: "Business — Jewellery" },
      { label: "Transport", category: "Business", value: "Business — Transport" },
      { label: "Food / Restaurant", category: "Business", value: "Business — Food" },
      { label: "Agriculture", category: "Agriculture", value: "Business — Agriculture" },
      { label: "Other business", category: "Business", value: "Business" },
    ],
  },
  {
    label: "Government",
    icon: "landmark",
    ask: "Kis department mein?",
    children: [
      { label: "IAS / IPS / Civil Services", category: "Government", value: "Civil Services" },
      { label: "Defence", category: "Government", value: "Defence Services" },
      { label: "Police", category: "Government", value: "Police Services" },
      { label: "Railways", category: "Government", value: "Railways" },
      { label: "Teaching", category: "Government", value: "Government Teacher" },
      { label: "Banking (PSU)", category: "Government", value: "PSU Bank Officer" },
      { label: "Health department", category: "Government", value: "Government Health Services" },
      { label: "Clerical / Admin", category: "Government", value: "Government Clerk" },
      { label: "Other department", category: "Government", value: "Government Service" },
    ],
  },
  {
    label: "Self-employed",
    icon: "sparkles",
    ask: "Kis kaam mein?",
    children: [
      { label: "Consultant", category: "Self-employed", value: "Consultant" },
      { label: "CA / CS", category: "Self-employed", value: "Chartered Accountant" },
      { label: "Advocate", category: "Law", value: "Advocate" },
      { label: "Doctor (own clinic)", category: "Healthcare", value: "Doctor (Private Practice)" },
      { label: "Freelancer", category: "Self-employed", value: "Freelancer" },
      { label: "Agency owner", category: "Self-employed", value: "Agency Owner" },
      { label: "Farming", category: "Agriculture", value: "Farming" },
      { label: "Other", category: "Self-employed", value: "Self-employed" },
    ],
  },
  { label: "Student", icon: "graduation", value: "Student", category: "Student" },
  { label: "Homemaker", icon: "home", value: "Homemaker", category: "Homemaker" },
  { label: "Retired", icon: "sun", value: "Retired", category: "Retired" },
  { label: "Not working right now", icon: "pause", value: "Currently not working", category: "Not working" },
];

/**
 * role/value → the industry it sits under. Built once from the tree so the
 * two can never drift apart.
 */
const CATEGORY_BY_VALUE: Record<string, string> = {};
function indexCategories(nodes: QuickNode[], inherited?: string) {
  for (const n of nodes) {
    const cat = n.category ?? inherited;
    if (n.children) indexCategories(n.children, cat);
    else if (cat) CATEGORY_BY_VALUE[(n.value ?? n.label).toLowerCase()] = cat;
  }
}
indexCategories(WORK_TREE);

/**
 * Keyword fallback for a profession that did not come from the tree — an
 * older row, a biodata extraction, a hand-typed "Not listed" answer. Ordered:
 * first hit wins, so the specific words come before the general ones.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [string, string]> = [
  ["software", "IT / Software"], ["developer", "IT / Software"], ["devops", "IT / Software"],
  ["data analyst", "IT / Software"], ["data scientist", "IT / Software"],
  ["doctor", "Healthcare"], ["dentist", "Healthcare"], ["nurse", "Healthcare"],
  ["pharma", "Healthcare"], ["mbbs", "Healthcare"], ["physio", "Healthcare"],
  ["teacher", "Education"], ["professor", "Education"], ["lecturer", "Education"], ["principal", "Education"],
  ["bank", "Banking / Finance"], ["account", "Banking / Finance"], ["finance", "Banking / Finance"],
  ["audit", "Banking / Finance"], ["insurance", "Banking / Finance"],
  ["advocate", "Law"], ["lawyer", "Law"], ["legal", "Law"],
  ["sales", "Sales / Marketing"], ["marketing", "Sales / Marketing"],
  ["business", "Business"], ["shop", "Business"], ["trader", "Business"], ["trading", "Business"],
  ["government", "Government"], ["police", "Government"], ["army", "Government"],
  ["defence", "Government"], ["railway", "Government"],
  ["farm", "Agriculture"], ["kheti", "Agriculture"],
  ["student", "Student"], ["homemaker", "Homemaker"], ["housewife", "Homemaker"], ["retired", "Retired"],
  ["architect", "Engineering"], ["engineer", "Engineering"],
];

/**
 * The profession string → a category the discovery filter can group on.
 *
 * Lives here rather than in `fieldMapping.ts` so the write and the chips that
 * produce it come from one tree. Returns `undefined` rather than guessing
 * "Other": a null column reads as "not known", which is true, where a
 * confident wrong bucket quietly mis-files someone in every filter.
 */
export function professionCategoryFor(profession: string | undefined | null): string | undefined {
  const p = (profession ?? "").trim().toLowerCase();
  if (p.length === 0) return undefined;
  const exact = CATEGORY_BY_VALUE[p];
  if (exact) return exact;
  for (const [needle, cat] of CATEGORY_KEYWORDS) {
    if (p.includes(needle)) return cat;
  }
  return undefined;
}

/** Every category the tree can produce — the discovery filter's option list. */
export const PROFESSION_CATEGORIES: string[] = [
  ...new Set([...Object.values(CATEGORY_BY_VALUE), ...CATEGORY_KEYWORDS.map(([, c]) => c)]),
].sort();

/* ------------------------------------------------------------------ */
/* Education — level → degree                                          */
/*                                                                     */
/* Every leaf here is a real `education` option in fields.ts, and the   */
/* graduate/post-graduate split matches `EDUCATION_FLOORS` in           */
/* preferenceScore.ts. Those three lists move together or a degree      */
/* someone picks here quietly scores 30 against "Graduate ya upar".     */
/* ------------------------------------------------------------------ */

export const EDUCATION_TREE: QuickNode[] = [
  {
    label: "School", icon: "school", ask: "Kahan tak?",
    children: [{ label: "10th" }, { label: "12th" }],
  },
  {
    label: "Diploma / ITI", icon: "wrench", ask: "Kaun sa?",
    children: [{ label: "Diploma" }, { label: "ITI" }],
  },
  {
    label: "Graduate", icon: "graduation", ask: "Kaun si degree?",
    children: [
      { label: "B.Tech / B.E.", value: "B.Tech" },
      { label: "B.Sc" }, { label: "B.Com" }, { label: "B.A." },
      { label: "BBA" }, { label: "BCA" }, { label: "LLB" },
      { label: "MBBS" }, { label: "BDS" }, { label: "B.Pharm" },
      { label: "Koi aur graduation", value: "Graduate" },
    ],
  },
  {
    label: "Post Graduate", icon: "award", ask: "Kaun si degree?",
    children: [
      { label: "MBA" }, { label: "M.Tech" }, { label: "M.Sc" },
      { label: "M.A." }, { label: "M.Com" }, { label: "MCA" },
      { label: "LLM" }, { label: "MD" },
      { label: "Koi aur PG", value: "Post Graduate" },
    ],
  },
  {
    label: "Professional", icon: "briefcase", ask: "Kaun si?",
    children: [{ label: "CA" }, { label: "CS" }],
  },
  { label: "PhD", icon: "award", value: "PhD" },
  { label: "Other", value: "Other" },
];

/* ------------------------------------------------------------------ */
/* Community, by religion                                              */
/*                                                                     */
/* `caste` is a `text` field, optional, `neverEmbed` — it is legitimate */
/* as something the user states about themselves and is never allowed   */
/* to influence a match score on its own (see fields.ts). The list here */
/* exists so that the same community is spelled the same way twice; it  */
/* is not exhaustive and never will be, which is what "Not listed" is   */
/* for.                                                                */
/* ------------------------------------------------------------------ */

export const COMMUNITY_BY_RELIGION: Record<string, string[]> = {
  Hindu: [
    "Agarwal", "Brahmin", "Rajput", "Jat", "Gupta", "Maheshwari", "Khandelwal",
    "Kayastha", "Yadav", "Vaishya", "Khatri", "Arora", "Kshatriya", "Gurjar",
    "Kurmi", "Teli", "Sonar", "Prajapati", "Maratha", "Patel", "Reddy", "Nair",
    "Kamma", "Iyer", "Iyengar", "Sindhi", "Bhumihar", "Rajasthani Baniya",
  ],
  Muslim: ["Sunni", "Shia", "Syed", "Sheikh", "Pathan", "Ansari", "Qureshi", "Khan", "Memon", "Bohra", "Mughal"],
  Sikh: ["Jat Sikh", "Khatri", "Arora", "Ramgarhia", "Ahluwalia", "Saini", "Ravidasia", "Majhabi", "Kamboj"],
  Christian: ["Roman Catholic", "Protestant", "Orthodox", "Syrian Catholic", "Marthomite", "Born Again", "Pentecostal"],
  Jain: ["Digambar", "Shwetambar", "Oswal", "Porwal", "Agarwal", "Khandelwal", "Bania"],
  Buddhist: ["Navayana", "Mahayana", "Theravada"],
  Parsi: ["Parsi Zoroastrian"],
};

/** Shown when religion is unanswered — the broadest usable starting list. */
const COMMUNITY_FALLBACK = [
  ...COMMUNITY_BY_RELIGION.Hindu.slice(0, 14),
  "Sunni", "Jat Sikh", "Roman Catholic", "Oswal",
];

export function communitiesFor(religion: string | undefined): string[] {
  if (!religion) return COMMUNITY_FALLBACK;
  return COMMUNITY_BY_RELIGION[religion] ?? COMMUNITY_FALLBACK;
}

/* ------------------------------------------------------------------ */
/* Small shared lists                                                  */
/* ------------------------------------------------------------------ */

/** Parents' work, as categories rather than job titles. */
export const OCCUPATION_CHIPS: QuickNode[] = [
  { label: "Business", icon: "store" },
  { label: "Private job", icon: "briefcase" },
  { label: "Government job", icon: "landmark" },
  { label: "Farming", icon: "sprout" },
  { label: "Teacher", icon: "graduation" },
  { label: "Doctor", icon: "stethoscope" },
  { label: "Engineer", icon: "wrench" },
  { label: "Self-employed", icon: "sparkles" },
  { label: "Homemaker", icon: "home" },
  { label: "Retired", icon: "sun" },
  { label: "Not working", icon: "pause" },
  { label: "Passed away", icon: "heart" },
];

/** The deal-breakers box, as chips. Stored comma-joined into the same text field. */
export const DEAL_BREAKER_CHIPS: QuickNode[] = [
  { label: "Smoking bilkul nahi" },
  { label: "Drinking bilkul nahi" },
  { label: "Non-veg ghar me nahi" },
  { label: "City relocate nahi kar sakte" },
  { label: "Job chhodna acceptable nahi" },
  { label: "Joint family nahi" },
  { label: "Alag rehna zaroori nahi" },
  { label: "Dahej ki baat bilkul nahi" },
  { label: "Horoscope match zaroori hai" },
];

/**
 * About Me, without a blank box.
 *
 * Three chip questions and a template. Deliberately *not* an AI call: this is
 * the one place where the answer is already fully determined by what the user
 * tapped, so sending it to a model would only add a network round trip, a
 * spend, and the chance of a sentence the user never agreed to. `BioWriter`
 * still exists for anyone who wants the model to write it — this is the
 * no-typing, no-waiting path.
 */
export const COMPOSE_CARDS: { key: string; ask: string; options: string[] }[] = [
  {
    key: "traits",
    ask: "Log aapko kaisa batate hain?",
    options: ["Calm", "Friendly", "Ambitious", "Family-oriented", "Practical", "Spiritual", "Fun-loving", "Hard-working", "Caring"],
  },
  {
    key: "weekend",
    ask: "Weekend kaise nikalta hai?",
    options: ["Family ke saath", "Ghoomne", "Doston ke saath", "Movies", "Sports", "Kuch naya seekhne", "Aaram"],
  },
  {
    key: "values",
    ask: "Shaadi me sabse zyada kya matter karta hai?",
    options: ["Respect", "Understanding", "Family bonding", "Apni space", "Career support", "Ek jaisi values"],
  },
];

/* ------------------------------------------------------------------ */
/* Height — every inch, not every other one                            */
/* ------------------------------------------------------------------ */

function heightRange(): string[] {
  const out: string[] = [];
  for (let totalInches = 4 * 12; totalInches <= 6 * 12 + 6; totalInches++) {
    out.push(`${Math.floor(totalInches / 12)}'${totalInches % 12}"`);
  }
  return out;
}

/**
 * A wheel that snaps to two-inch steps is a wheel that cannot say 5'7". The
 * catalog's option list grew to match this (fields.ts) rather than the other
 * way round, and the old list is a strict subset — every height already saved
 * still validates.
 */
export const HEIGHT_VALUES = heightRange();

/* ------------------------------------------------------------------ */
/* Per-field specs                                                     */
/* ------------------------------------------------------------------ */

/**
 * Chips built from the field's own catalog options, so the stored values are
 * the catalog's by construction.
 *
 * `except` drops an option that is better served as an escape at the bottom of
 * the card ("Batana nahi chahte", "Pata nahi") — those are outs, not answers,
 * and mixed into the same grid they read as a third opinion. The value the
 * escape stores is still the catalog's own, so nothing downstream can tell the
 * difference.
 */
function opts(
  fieldKey: string,
  o: { icons?: Record<string, string>; labels?: Record<string, string>; except?: string[] } = {},
): QuickNode[] {
  const field = FIELD_BY_KEY[fieldKey];
  const list = field?.options ?? [];
  const drop = new Set(o.except ?? []);
  return list
    .filter((value) => !drop.has(value))
    .map((value) => ({
      label: o.labels?.[value] ?? value,
      value,
      icon: o.icons?.[value],
    }));
}

/**
 * `@fieldKey` as a shortcut's value means "copy whatever that field says right
 * now" — "Same as my city" on work location, native place and birth place.
 * Resolved by the deck, which is the only thing holding the draft.
 */
export const SAME_AS_PREFIX = "@";

export const QUICK_PICKS: Record<string, QuickSpec> = {
  /* ---------------- basics ---------------- */
  fullName: { input: { kind: "text" } },

  gender: {
    input: { kind: "chips", nodes: opts("gender", { icons: { Ladka: "male", Ladki: "female" } }), columns: 2 },
  },

  dateOfBirth: { input: { kind: "date" } },

  height: { input: { kind: "wheel", values: HEIGHT_VALUES } },

  currentCity: {
    input: { kind: "place" },
    popular: POPULAR_CITIES,
    other: true,
  },

  maritalStatus: {
    input: {
      kind: "chips",
      nodes: opts("maritalStatus", {
        icons: { "Never Married": "heart", Divorced: "heartCrack", Widowed: "heartHandshake" },
      }),
    },
  },

  motherTongue: { input: { kind: "chips", nodes: opts("motherTongue") } },

  /* ---------------- career ---------------- */
  education: { input: { kind: "chips", nodes: EDUCATION_TREE } },

  profession: {
    input: { kind: "chips", nodes: WORK_TREE },
    hint: "Company ka naam nahi poochh rahe — sirf kaam.",
    other: true,
  },

  workLocation: {
    input: {
      kind: "place",
      shortcuts: [
        { label: "Same as my city", value: `${SAME_AS_PREFIX}currentCity`, icon: "mapPin" },
        { label: "Work from home", value: "Work from home", icon: "home" },
      ],
    },
    popular: POPULAR_CITIES,
    other: true,
    escapes: [SKIP],
  },

  annualIncome: {
    input: { kind: "chips", nodes: opts("annualIncome", { except: ["Batana nahi chahte"] }), columns: 2 },
    escapes: [PRIVATE_STORED],
  },

  /* ---------------- family ---------------- */
  familyType: {
    input: {
      kind: "chips",
      nodes: opts("familyType", { icons: { "Joint family": "users", "Nuclear family": "home" } }),
      columns: 2,
    },
  },

  fatherOccupation: { input: { kind: "chips", nodes: OCCUPATION_CHIPS }, other: true, escapes: [SKIP] },
  motherOccupation: { input: { kind: "chips", nodes: OCCUPATION_CHIPS }, other: true, escapes: [SKIP] },

  siblings: { input: { kind: "stepper", stops: FIELD_BY_KEY.siblings?.options ?? [] } },

  siblingsMarried: { input: { kind: "chips", nodes: opts("siblingsMarried") } },
  familyValues: { input: { kind: "chips", nodes: opts("familyValues") } },

  /* ---------------- background ---------------- */
  religion: {
    input: { kind: "chips", nodes: opts("religion", { except: ["Batana nahi chahte"] }) },
    escapes: [PRIVATE_STORED],
  },

  caste: {
    // Chips come from the religion already answered — see `communitiesFor`.
    input: { kind: "chips", nodes: [], dynamic: "community" },
    other: true,
    escapes: [PRIVATE],
  },

  nativePlace: {
    input: {
      kind: "place",
      shortcuts: [{ label: "Same as my city", value: `${SAME_AS_PREFIX}currentCity`, icon: "mapPin" }],
    },
    popular: POPULAR_CITIES,
    other: true,
    escapes: [SKIP],
  },

  /* ---------------- lifestyle ---------------- */
  diet: {
    input: {
      kind: "chips",
      nodes: opts("diet", {
        icons: { Veg: "leaf", "Non-veg": "drumstick", "Egg khate hain": "egg", "Jain veg": "leaf", Vegan: "sprout" },
      }),
    },
  },

  smoking: { input: { kind: "chips", nodes: opts("smoking") } },
  drinking: { input: { kind: "chips", nodes: opts("drinking") } },

  hobbies: {
    input: {
      kind: "chips",
      multi: true,
      nodes: opts("hobbies", {
        icons: {
          Padhna: "book", Music: "music", Sports: "trophy", Ghoomna: "plane",
          Cooking: "chef", Photography: "camera", Film: "film", Gardening: "sprout", Yoga: "yoga",
        },
      }),
    },
  },

  languagesKnown: { input: { kind: "chips", multi: true, nodes: opts("languagesKnown") } },

  aboutMe: { input: { kind: "compose" } },

  /* ---------------- partner ---------------- */
  partnerAgeRange: { input: { kind: "chips", nodes: opts("partnerAgeRange"), columns: 2 } },
  partnerCityPreference: { input: { kind: "chips", multi: true, nodes: opts("partnerCityPreference") } },
  partnerEducation: { input: { kind: "chips", nodes: opts("partnerEducation") } },
  partnerReligionPreference: { input: { kind: "chips", nodes: opts("partnerReligionPreference") } },

  partnerCastePreference: {
    input: { kind: "chips", nodes: [{ label: "Koi farak nahi" }], dynamic: "community" },
    other: true,
    escapes: [SKIP],
  },

  partnerManglikPreference: { input: { kind: "chips", nodes: opts("partnerManglikPreference") } },
  partnerWorkExpectation: { input: { kind: "chips", nodes: opts("partnerWorkExpectation") } },
  relocateWilling: { input: { kind: "chips", nodes: opts("relocateWilling") } },

  dealBreakers: {
    input: { kind: "chips", multi: true, nodes: DEAL_BREAKER_CHIPS },
    hint: "Sirf matching ke liye — kisi ko dikhta nahi.",
    escapes: [{ label: "None", value: "Koi deal breaker nahi", icon: "check" }],
  },

  /* ---------------- kundli ---------------- */
  manglikStatus: {
    input: { kind: "chips", nodes: opts("manglikStatus", { except: ["Pata nahi"] }) },
    escapes: [DONT_KNOW_STORED],
  },

  gotra: { input: { kind: "text" }, escapes: [DONT_KNOW] },

  birthTime: { input: { kind: "time" }, escapes: [DONT_KNOW] },

  birthPlace: {
    input: {
      kind: "place",
      shortcuts: [
        { label: "Same as native place", value: `${SAME_AS_PREFIX}nativePlace`, icon: "mapPin" },
        { label: "Same as my city", value: `${SAME_AS_PREFIX}currentCity`, icon: "mapPin" },
      ],
    },
    popular: POPULAR_CITIES,
    other: true,
    escapes: [DONT_KNOW],
  },
};

/**
 * The tap spec for a field, or `null` when there is none.
 *
 * `null` is not a failure — `photos` has no spec because the upload card is
 * its own thing, and a field added to the catalog tomorrow renders through the
 * deck's generic fallback (chips if it has options, a text box if it does not)
 * rather than disappearing.
 */
export function quickSpecFor(fieldKey: string): QuickSpec | null {
  return QUICK_PICKS[fieldKey] ?? null;
}

/**
 * Walks the tree to find the path that ends at `value` — what lets a card
 * re-opened later show "Job › IT / Software › Software Engineer" instead of
 * dumping the user back at the first step.
 */
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

/* ------------------------------------------------------------------ */
/* About Me, composed                                                  */
/* ------------------------------------------------------------------ */

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} aur ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} aur ${items[items.length - 1]}`;
}

/**
 * Three sets of chips → two or three plain sentences, in code.
 *
 * Written in the third person when a parent is filling and the first person
 * when the user is: a father tapping "Family-oriented" has not said "main
 * family-oriented hoon", and publishing that sentence in his child's voice is
 * exactly the kind of small lie this product cannot afford.
 */
export function composeAboutMe(
  picks: Record<string, string[]>,
  ctx: { name?: string; forSelf: boolean },
): string {
  const traits = picks.traits ?? [];
  const weekend = picks.weekend ?? [];
  const values = picks.values ?? [];
  const who = ctx.forSelf ? null : (ctx.name ?? "").trim().split(" ")[0] || null;

  const sentences: string[] = [];
  if (traits.length > 0) {
    sentences.push(
      who
        ? `${who} ${list(traits.map((t) => t.toLowerCase()))} hain.`
        : `Main ${list(traits.map((t) => t.toLowerCase()))} hoon.`,
    );
  }
  // These two read the same either way — a weekend and a value are stated
  // about a person, not spoken in their voice, so there is nothing to shift.
  if (weekend.length > 0) {
    sentences.push(`Free time ${list(weekend.map((w) => w.toLowerCase()))} nikalta hai.`);
  }
  if (values.length > 0) {
    sentences.push(`Rishte me ${list(values.map((v) => v.toLowerCase()))} sabse zyada matter karta hai.`);
  }
  return sentences.join(" ");
}
