/**
 * The profile field catalog — one source of truth for the whole onboarding.
 *
 * Everything downstream reads from here: the stage gate, the gap engine that
 * picks the next interview question, the AI extraction schema, and the manual
 * form. Adding a field in one place makes it appear in all four.
 *
 * `stage` follows 07_advanced_ai_spec §3.1 progressive profiling — 60 fields
 * are never asked at once; each stage buys the user something.
 *
 * ## On wording
 *
 * Labels, options and questions use the word a family actually says out loud.
 * Where that word is English, it stays English — "joint family" is what people
 * say, so "Sanyukt parivaar" reads like a government form and makes the product
 * feel distant. Formal Hindi is only used where it genuinely is the common word
 * (gotra, manglik). This matters more than it looks: the AI's option list is
 * built from these strings, so a word nobody says is also a word the model has
 * to translate away from.
 *
 * The register is *urban Hinglish*, not translated Hindi. An educated Indian
 * professional filling this in says "Date of Birth", "Current City", "Marital
 * Status" — the English noun with Hindi grammar around it. Reaching for
 * "janamdin" or "khaan-paan" instead does not read as warmer; it reads as a
 * different, older product than the one they thought they were signing up for.
 * So: **English noun, Hindi sentence.** "Aapki Date of Birth kya hai?"
 *
 * Labels are the other half of this. They are not just form captions — they are
 * the chips shown under the question as "you can answer these too", so they have
 * to be short, title-case and instantly recognisable on their own.
 */

export type FieldType = "text" | "select" | "multiselect" | "textarea" | "date" | "photo";

export type ProfileStage = 1 | 2 | 3 | 4;

export type ProfileFieldDef = {
  key: string;
  label: string;
  stage: ProfileStage;
  type: FieldType;
  options?: string[];
  required: boolean;
  placeholder?: string;
  /** What the AI asks when the user is filling for themselves. */
  question: string;
  /** Same question when a parent is filling for their child. */
  questionForChild: string;
  /**
   * Answer to "ye kyu chahiye?" — spec §10.3 requires every ask to be able to
   * justify itself. Present on anything a user could reasonably balk at.
   */
  whyNeeded?: string;
  /**
   * Photos are never part of the AI pipeline (spec §2.3 hard rule 4), and
   * neither is anything we refuse to let a model guess at.
   */
  aiExtractable: boolean;
  sensitive?: boolean;
  /**
   * Must never reach a match embedding — M17 spec §L1, tests L1-02…L1-06 and
   * REG-04. These fields are legitimate as an *explicit* filter the user set,
   * but putting them in the vector makes them influence every similarity score
   * whether the user chose that or not, which is discriminatory clustering.
   * The rule lives here so the embedding builder can assert it in code rather
   * than relying on someone remembering the doc.
   */
  neverEmbed?: boolean;
  /**
   * Prompts for people who freeze on an open question. Not placeholder text —
   * these are shown as tappable chips that append to the answer.
   */
  suggestions?: string[];
};

/* ------------------------------------------------------------------ */
/* Stage 1 — 8 fields, ~90 seconds. Unlocks: "profile live"            */
/*                                                                     */
/* Deliberately not grown. Every field added here is another thing     */
/* between a new user and a live profile.                              */
/* ------------------------------------------------------------------ */

const STAGE_1: ProfileFieldDef[] = [
  {
    key: "fullName", label: "Full Name", stage: 1, type: "text", required: true,
    placeholder: "Jaise: Rahul Sharma", aiExtractable: true, neverEmbed: true,
    question: "Aapka full name kya hai?",
    questionForChild: "Unka full name kya hai?",
  },
  {
    key: "gender", label: "Gender", stage: 1, type: "select", required: true,
    options: ["Ladka", "Ladki"], aiExtractable: true,
    question: "Aapka gender kya hai?",
    questionForChild: "Beta hai ya beti?",
  },
  {
    key: "dateOfBirth", label: "Date of Birth", stage: 1, type: "date", required: true,
    placeholder: "DD/MM/YYYY", aiExtractable: true, neverEmbed: true,
    question: "Aapki Date of Birth kya hai?",
    questionForChild: "Unki Date of Birth kya hai?",
    whyNeeded:
      "Age ke hisaab se matches dhoondhne ke liye. Doosron ko sirf age dikhti hai, poori date kabhi nahi.",
  },
  {
    key: "height", label: "Height", stage: 1, type: "select", required: true,
    options: ["4'6\"", "4'8\"", "4'10\"", "5'0\"", "5'2\"", "5'4\"", "5'6\"", "5'8\"", "5'10\"", "6'0\"", "6'2\""],
    aiExtractable: true,
    question: "Aapki height kitni hai?",
    questionForChild: "Unki height kitni hai?",
  },
  {
    key: "currentCity", label: "Current City", stage: 1, type: "text", required: true,
    placeholder: "Jaise: Jaipur", aiExtractable: true,
    question: "Abhi aap kis city me rehte hain?",
    questionForChild: "Wo abhi kis city me rehte hain?",
  },
  {
    key: "maritalStatus", label: "Marital Status", stage: 1, type: "select", required: true,
    // English on purpose — unlike the rest of the catalog (see the file-level
    // "On wording" note), these three are civil-status/legal terms, not words
    // a family says out loud in Hinglish conversation. "Vidhwa/Vidhur" and
    // "Shaadi nahi hui" read as informal chatter for a fact this sensitive.
    options: ["Never Married", "Divorced", "Widowed"], aiExtractable: true,
    question: "Aapka marital status kya hai?",
    questionForChild: "Unka marital status kya hai?",
  },
  {
    key: "education", label: "Education", stage: 1, type: "select", required: true,
    options: ["10th", "12th", "Graduate", "B.Tech", "B.Com", "B.A.", "MBA", "M.Tech", "M.Sc", "Post Graduate", "PhD", "Other"],
    aiExtractable: true,
    question: "Aapki highest education kya hai?",
    questionForChild: "Unki highest education kya hai?",
  },
  {
    key: "profession", label: "Profession", stage: 1, type: "text", required: true,
    placeholder: "Jaise: Software Engineer", aiExtractable: true,
    question: "Aapka profession kya hai?",
    questionForChild: "Unka profession kya hai?",
  },
];

/* ------------------------------------------------------------------ */
/* Stage 2 — unlocks: "matches"                                        */
/* ------------------------------------------------------------------ */

const STAGE_2: ProfileFieldDef[] = [
  {
    key: "motherTongue", label: "Mother Tongue", stage: 2, type: "select", required: true,
    options: ["Hindi", "Marwari", "Punjabi", "Gujarati", "Marathi", "Bangla", "Tamil", "Telugu", "Kannada", "Malayalam", "Odia", "Bhojpuri", "Other"],
    aiExtractable: true,
    question: "Aapki mother tongue kya hai?",
    questionForChild: "Unki mother tongue kya hai?",
  },
  {
    key: "religion", label: "Religion", stage: 2, type: "select", required: false,
    options: ["Hindu", "Muslim", "Sikh", "Christian", "Jain", "Buddhist", "Parsi", "Batana nahi chahte"],
    aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Aapka religion kya hai?",
    questionForChild: "Unka religion kya hai?",
    whyNeeded:
      "Optional. Sirf tab use hota hai jab aap khud isse apni preference banayein — matching me apne aap weight nahi milta.",
  },
  {
    key: "caste", label: "Caste / Community", stage: 2, type: "text", required: false,
    placeholder: "Jaise: Agarwal", aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Aapki caste ya community kya hai?",
    questionForChild: "Inki caste ya community kya hai?",
    whyNeeded:
      "Poori tarah optional, aur matching model me kabhi nahi jaati — isliye ye kabhi chupke se aapke matches tay nahi karti.",
  },
  {
    key: "diet", label: "Diet", stage: 2, type: "select", required: true,
    options: ["Veg", "Non-veg", "Egg khate hain", "Jain veg", "Vegan"],
    aiExtractable: true,
    question: "Aapka diet kya hai — veg ya non-veg?",
    questionForChild: "Inka diet kya hai — veg ya non-veg?",
  },
  {
    key: "familyType", label: "Family Type", stage: 2, type: "select", required: true,
    options: ["Joint family", "Nuclear family"], aiExtractable: true,
    question: "Aapki family joint hai ya nuclear?",
    questionForChild: "Family joint hai ya nuclear?",
  },
  {
    key: "nativePlace", label: "Native Place", stage: 2, type: "text", required: false,
    placeholder: "Jaise: Sikar, Rajasthan", aiExtractable: true,
    question: "Aapka native place kahan hai?",
    questionForChild: "Inka native place kahan hai?",
    whyNeeded: "Current city se alag — kai families apne hi ilaake ke rishte prefer karte hain.",
  },
  {
    key: "fatherOccupation", label: "Father's Occupation", stage: 2, type: "text", required: false,
    aiExtractable: true,
    question: "Aapke father ki occupation kya hai?",
    // Was "Aap kya karte hain?" — which asked the parent about themselves and
    // then filed the answer under the father, wrong whenever the mother fills.
    questionForChild: "Inke father ki occupation kya hai?",
  },
  {
    key: "motherOccupation", label: "Mother's Occupation", stage: 2, type: "text", required: false,
    aiExtractable: true,
    question: "Aapki mother ki occupation kya hai?",
    questionForChild: "Inki mother ki occupation kya hai?",
  },
  {
    key: "siblings", label: "Siblings", stage: 2, type: "select", required: false,
    options: ["Koi nahi", "1", "2", "3", "3 se zyada"], aiExtractable: true,
    question: "Aapke kitne siblings hain?",
    questionForChild: "Inke kitne siblings hain?",
  },
  {
    key: "annualIncome", label: "Annual Income", stage: 2, type: "select", required: false,
    options: ["3 lakh se kam", "3–5 lakh", "5–10 lakh", "10–20 lakh", "20–50 lakh", "50 lakh+", "Batana nahi chahte"],
    aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Aapki annual income kya hai?",
    questionForChild: "Inki annual income kya hai?",
    whyNeeded: "Optional. Profile par sirf range dikhti hai — exact number kabhi nahi.",
  },
  {
    key: "workLocation", label: "Work Location", stage: 2, type: "text", required: false,
    aiExtractable: true,
    question: "Aap kahan work karte hain?",
    questionForChild: "Wo kahan work karte hain?",
  },
  {
    key: "manglikStatus", label: "Manglik Status", stage: 2, type: "select", required: false,
    options: ["Nahi", "Haan", "Aanshik manglik", "Pata nahi", "Hum nahi maante"],
    aiExtractable: true, neverEmbed: true,
    question: "Aapka manglik status kya hai? Pata na ho to wo bhi theek hai.",
    questionForChild: "Inka manglik status kya hai? Pata na ho to wo bhi theek hai.",
    whyNeeded:
      "Kuch families ke liye zaroori, kuch ke liye nahi. \"Hum nahi maante\" chunne par ye profile par dikhta hi nahi.",
  },
  {
    key: "partnerAgeRange", label: "Partner's Age", stage: 2, type: "select", required: true,
    options: ["21–25", "23–27", "25–29", "27–32", "30–35", "35+"], aiExtractable: true,
    question: "Partner ki age kya prefer karte hain?",
    questionForChild: "Partner ki age kya prefer kar rahe hain?",
  },
  {
    key: "partnerCityPreference", label: "Partner's City", stage: 2, type: "multiselect", required: false,
    options: ["Isi sheher me", "Jaipur", "Delhi NCR", "Mumbai", "Pune", "Bengaluru", "Hyderabad", "Kahin bhi"],
    aiExtractable: true,
    question: "Partner kis city ka ho — koi preference hai?",
    questionForChild: "Partner kis city ka ho — koi preference hai?",
  },
  {
    key: "partnerEducation", label: "Partner's Education", stage: 2, type: "select", required: false,
    options: ["Koi farak nahi", "Graduate ya upar", "Post Graduate ya upar", "Professional degree"],
    aiExtractable: true,
    question: "Partner ki education kaisi ho?",
    questionForChild: "Partner ki education kaisi ho?",
  },
  {
    // What the user wants, not their own religion (see `religion` above) —
    // scored against a candidate's stated religion the same way
    // `partnerEducation` already is. Never derived automatically; "Koi farak
    // nahi" carries full weight as a real answer, not a skip.
    key: "partnerReligionPreference", label: "Partner's Religion", stage: 2, type: "select", required: false,
    options: ["Koi farak nahi", "Hindu", "Muslim", "Sikh", "Christian", "Jain", "Buddhist", "Parsi"],
    aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Partner ka religion match karna aapke liye zaroori hai?",
    questionForChild: "Partner ka religion match karna zaroori hai?",
    whyNeeded: "\"Koi farak nahi\" chunne par ye matching me kabhi use nahi hota.",
  },
  {
    key: "partnerCastePreference", label: "Partner's Caste", stage: 2, type: "text", required: false,
    placeholder: "Jaise: Agarwal, ya 'Koi farak nahi'",
    aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Partner ki caste/community ko lekar koi preference hai?",
    questionForChild: "Partner ki caste/community ko lekar koi preference hai?",
    whyNeeded: "Bilkul optional — khaali ya 'Koi farak nahi' likhne par ye kabhi matching me count nahi hota.",
  },
  {
    key: "partnerManglikPreference", label: "Partner's Manglik Status", stage: 2, type: "select", required: false,
    options: ["Koi farak nahi", "Manglik chahiye", "Non-manglik chahiye"],
    aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Partner manglik ho ya na ho — koi preference hai?",
    questionForChild: "Partner manglik ho ya na ho — koi preference hai?",
    whyNeeded: "\"Koi farak nahi\" chunne par ye matching me kabhi use nahi hota.",
  },
  {
    key: "partnerWorkExpectation", label: "Partner Working", stage: 2, type: "select", required: false,
    options: ["Job karein to accha hai", "Ghar sambhalein", "Unki marzi", "Baat kar ke tay karenge"],
    aiExtractable: true,
    question: "Shaadi ke baad partner job continue kare — kya sochte hain?",
    questionForChild: "Shaadi ke baad partner job continue kare — kya sochte hain?",
    whyNeeded: "Ye baat aage jaake sabse zyada matter karti hai — pehle clear ho jaye to behtar.",
  },
  {
    key: "aboutMe", label: "About Me", stage: 2, type: "textarea", required: false,
    placeholder: "Do-teen line apne shabdon me", aiExtractable: true,
    question: "Apne baare mein kuch bataiye — aap kaisi personality hain?",
    questionForChild: "Inke baare mein kuch bataiye — inki personality kaisi hai?",
    // Most people freeze here. Concrete openers beat a blank box.
    suggestions: [
      "Ghar me sabse kareeb kaun hai",
      "Weekend me kya karte hain",
      "Dost kya kehte hain aapke baare me",
      "Kaam ke baad kya karna pasand hai",
      "Aage kya karna chahte hain",
    ],
  },
  {
    key: "hobbies", label: "Hobbies", stage: 2, type: "multiselect", required: false,
    options: ["Padhna", "Music", "Sports", "Ghoomna", "Cooking", "Photography", "Film", "Gardening", "Yoga"],
    aiExtractable: true,
    question: "Free time mein aapko kya karna pasand hai?",
    questionForChild: "Free time mein inhe kya karna pasand hai?",
  },
];

/* ------------------------------------------------------------------ */
/* Stage 3 — unlocks: "chat"                                           */
/* ------------------------------------------------------------------ */

const STAGE_3: ProfileFieldDef[] = [
  {
    key: "smoking", label: "Smoking", stage: 3, type: "select", required: false,
    options: ["Nahi", "Kabhi-kabhi", "Haan"], aiExtractable: true,
    question: "Aap smoking karte hain?",
    questionForChild: "Wo smoking karte hain?",
  },
  {
    key: "drinking", label: "Drinking", stage: 3, type: "select", required: false,
    options: ["Nahi", "Sirf mauke par", "Haan"], aiExtractable: true,
    question: "Aap drink karte hain?",
    questionForChild: "Wo drink karte hain?",
  },
  {
    key: "languagesKnown", label: "Languages Known", stage: 3, type: "multiselect", required: false,
    options: ["Hindi", "English", "Marwari", "Punjabi", "Gujarati", "Marathi", "Bangla", "Tamil", "Telugu"],
    aiExtractable: true,
    question: "Aur kaun si languages bol lete hain?",
    questionForChild: "Aur kaun si languages bol lete hain?",
  },
  {
    key: "familyValues", label: "Family Values", stage: 3, type: "select", required: false,
    options: ["Traditional", "Modern", "Thoda dono"], aiExtractable: true,
    question: "Aapki family values traditional hain ya modern?",
    questionForChild: "Family values traditional hain ya modern?",
  },
  {
    key: "siblingsMarried", label: "Siblings' Marital Status", stage: 3, type: "select", required: false,
    options: ["Sabki ho gayi", "Kuch ki hui hai", "Kisi ki nahi hui", "Laagu nahi"],
    aiExtractable: true,
    question: "Siblings ki shaadi ho chuki hai?",
    questionForChild: "Inke siblings ki shaadi ho chuki hai?",
  },
  {
    key: "gotra", label: "Gotra", stage: 3, type: "text", required: false,
    aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Aapka gotra kya hai? Pata na ho to skip kar dijiye.",
    questionForChild: "Inka gotra kya hai? Pata na ho to skip kar dijiye.",
    whyNeeded: "Optional, aur match model me kabhi nahi jaata.",
  },
  {
    key: "birthTime", label: "Time of Birth", stage: 3, type: "text", required: false,
    placeholder: "Jaise: subah 6:30", aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Aapka time of birth pata hai?",
    questionForChild: "Inka time of birth pata hai?",
    whyNeeded: "Sirf kundli ke liye — kisi aur ko kabhi nahi dikhta.",
  },
  {
    key: "birthPlace", label: "Place of Birth", stage: 3, type: "text", required: false,
    placeholder: "Jaise: Jaipur", aiExtractable: true, sensitive: true, neverEmbed: true,
    question: "Aapka place of birth kya hai?",
    questionForChild: "Inka place of birth kya hai?",
    whyNeeded: "Sirf kundli ke liye — kisi aur ko kabhi nahi dikhta.",
  },
  {
    key: "relocateWilling", label: "Relocation", stage: 3, type: "select", required: false,
    options: ["Haan", "Nahi", "Shaayad — baat kar sakte hain"], aiExtractable: true,
    question: "Shaadi ke baad city relocate kar sakte hain?",
    questionForChild: "Shaadi ke baad wo city relocate kar sakte hain?",
  },
  {
    key: "dealBreakers", label: "Deal Breakers", stage: 3, type: "textarea", required: false,
    placeholder: "Apne shabdon me likhiye", aiExtractable: true,
    question: "Koi deal breaker hai jo bilkul acceptable nahi hoga?",
    questionForChild: "Koi deal breaker hai jo bilkul acceptable nahi hoga?",
    whyNeeded: "Sirf matching ke liye — kisi aur ko kabhi nahi dikhta.",
    suggestions: [
      "City relocate nahi kar sakte",
      "Smoking bilkul nahi",
      "Job chhodna acceptable nahi",
      "Joint family nahi",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Stage 4 — trust score. Photos live here and never touch the AI.     */
/* ------------------------------------------------------------------ */

const STAGE_4: ProfileFieldDef[] = [
  {
    key: "photos", label: "Photos", stage: 4, type: "photo", required: false,
    aiExtractable: false, neverEmbed: true,
    question: "Ek clear face photo add kar dijiye.",
    questionForChild: "Inki ek clear face photo add kar dijiye.",
    // This is the disclosure someone reads at the moment they decide to hand
    // over their face, so it has to be the actual rule. It used to say "Aap
    // control karte hain kise dikhe — photo blur bhi rakh sakte hain", which
    // was already half-wrong (the blur derivative is the Blind Vibe Zone's own
    // mechanism, never a switch the owner could hold) and became fully wrong
    // when `photoUnlockAll` opened photos to every paid member. Whatever the
    // gate is, this line names it — see lib/services/plans/photoAccess.ts.
    whyNeeded: "Photo unhe dikhegi jinse mutual interest ho jaye — aur subscription wale members ko.",
  },
];

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  ...STAGE_1,
  ...STAGE_2,
  ...STAGE_3,
  ...STAGE_4,
];

export const FIELD_BY_KEY: Record<string, ProfileFieldDef> = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, f]),
);

/** Fields the extraction model is allowed to produce. Photos are excluded. */
export const AI_EXTRACTABLE_FIELDS = PROFILE_FIELDS.filter((f) => f.aiExtractable);

/**
 * Field keys that must never appear in a match embedding — M17 tests
 * L1-02…L1-06 / REG-04. The embedding builder should filter against this
 * rather than keeping its own list, so adding a sensitive field can't
 * accidentally leave the vector open.
 */
export const NEVER_EMBED_KEYS: readonly string[] = PROFILE_FIELDS.filter(
  (f) => f.neverEmbed,
).map((f) => f.key);

export function fieldsForStage(stage: ProfileStage): ProfileFieldDef[] {
  return PROFILE_FIELDS.filter((f) => f.stage === stage);
}

/** Relationship decides whether we address the user or their child. */
export function questionFor(field: ProfileFieldDef, forSelf: boolean): string {
  return forSelf ? field.question : field.questionForChild;
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} aur ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} aur ${items[items.length - 1]}`;
}

/**
 * One flowing Hinglish question for 2-3 fields asked together in one voice
 * turn (2026-08-04) — "Apna Gender, Date of Birth aur Height bata dijiye?"
 * reads like a person asking once, where stitching each field's own "X kya
 * hai?" back to back reads like a form reading its own rows aloud. Labels are
 * used rather than the individual `question` strings on purpose: they're
 * already short, title-case English nouns (see the file-level "On wording"
 * note), exactly what a natural list of things to tell someone looks like.
 */
export function batchQuestionFor(fields: ProfileFieldDef[], forSelf: boolean): string {
  if (fields.length <= 1) return fields[0] ? questionFor(fields[0], forSelf) : "";
  const labels = joinNatural(fields.map((f) => f.label));
  return forSelf ? `Apna ${labels} bata dijiye?` : `Unka ${labels} bata dijiye?`;
}
