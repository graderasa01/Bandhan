/**
 * Marriage Intelligence — the second data layer.
 *
 * `fields.ts` answers "aap kaun ho": name, age, city, education, family type.
 * This file answers the other half — "aap kis tarah ki zindagi chahte ho":
 * children, joint vs nuclear, money, parents ki responsibility, conflict,
 * personal space. A profile can be 100% complete on `fields.ts` and still
 * leave every one of those unknown, which is exactly the gap this closes.
 *
 * ## Why this is a separate catalog and not more PROFILE_FIELDS
 *
 * `PROFILE_FIELDS` feeds the onboarding builder, the gap engine and the AI
 * extraction schema. Adding forty questions there would put forty new things
 * between a new user and a live profile — the one rule Stage 1 exists to
 * protect. So these questions live outside that pipeline entirely:
 *
 *   - never asked during onboarding, only *after* the profile is live
 *   - never sent to an extraction model (tap-only, zero AI cost — the same
 *     discipline as `mindset.ts`)
 *   - never part of `completionPercent()`; coverage here is its own metric
 *
 * ## Three metrics, deliberately not one
 *
 *   **Profile Ready**      — `stages.ts` completionPercent. Can you be shown?
 *   **Match Intelligence** — this file's coverage. How well is the user
 *                            actually understood?
 *   **Trust**              — `trustScoreService`. How verified is any of it?
 *
 * Collapsing the first two is what produces a "100% complete" profile the app
 * knows nothing real about.
 *
 * ## On wording
 *
 * Same register as `fields.ts`: urban Hinglish, English noun + Hindi sentence.
 * Options are what a person would actually say out loud, short enough to read
 * as a tappable chip. Nothing here goes through the i18n dictionary, for the
 * same reason `fields.ts` and `mindset.ts` do not — an option string is also
 * the stored value and the matching key, so switching locale must never change
 * what got saved.
 */

import type { DeepDimensionKey } from "@prisma/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type IntelligenceLayerKey =
  | "INTENT"
  | "FAMILY_LIFE"
  | "CAREER"
  | "MONEY"
  | "CHILDREN"
  | "LIFESTYLE"
  | "COMMUNICATION"
  | "VALUES"
  | "PARTNER_PREFERENCES";

/**
 * Where an answer is allowed to surface. The server assigns this from the
 * catalog on write — never from the request body — so a client cannot talk a
 * private answer onto a public profile.
 *
 *   PROFILE_VISIBLE — fine on the profile page and in an AI candidate dossier
 *   MATCH_PRIVATE   — used by matching, never rendered as a raw value to
 *                     anyone but the owner (money, children timeline, conflict
 *                     style, parent-care responsibility)
 *   PRIVATE         — owner + internal only. Never scored, never shown.
 */
export type SignalVisibility = "PROFILE_VISIBLE" | "MATCH_PRIVATE" | "PRIVATE";

/**
 * How (and whether) an answer participates in ranking.
 *
 *   EXACT      — same answer means alignment; feeds the existing Soch/deep
 *                bucket (0.25) as first-person evidence
 *   PREFERENCE — something the viewer explicitly asked for; feeds the existing
 *                preference bucket (0.30)
 *   NONE       — informational only. Never scored, in either bucket.
 */
export type CompatibilityMode = "EXACT" | "PREFERENCE" | "NONE";

/**
 * Shown only when the condition holds. Evaluated against a merged view of the
 * profile's flat draft values *and* its signal answers, so a branch can key off
 * either — "sirf tab poochho jab partnerCastePreference set hai" needs the old
 * catalog, "sirf tab jab children haan hain" needs this one.
 */
export type BranchCondition = {
  key: string;
  /** Answer must be one of these. */
  anyOf?: string[];
  /** Answer must exist and not be one of these — "set, but not 'Koi farak nahi'". */
  notOneOf?: string[];
  /** Answer must merely be present and non-empty. */
  present?: boolean;
};

export type IntelligenceQuestionDef = {
  key: string;
  layer: IntelligenceLayerKey;
  /** Short chip/summary label — the same "recognisable on its own" rule as fields.ts. */
  label: string;
  question: string;
  /** The same question when a parent/guardian is filling for their child. */
  questionForChild: string;
  options: string[];
  /** Answer to "ye kyu poochh rahe ho?" — every ask justifies itself. */
  whyNeeded: string;
  visibility: SignalVisibility;
  /** Counts toward this layer being "understood". Optional ones never block it. */
  required: boolean;
  multi?: boolean;
  maxSelections?: number;
  branchOn?: BranchCondition;
  compatibilityMode: CompatibilityMode;
  dimensionsHelped?: DeepDimensionKey[];
  /**
   * True when only the candidate themselves can really answer this. A
   * parent-entered answer is still stored and still shown, but is marked
   * "confirm hona baaki hai" and carries less evidence in ranking — papa saying
   * "beta joint family chahta hai" is not the same fact as the beta saying it.
   * See `intelligenceService.ts`'s evidence weighting.
   */
  selfRequired?: boolean;
  /**
   * An answer the app already has, under a different name. Existing users must
   * not be re-asked something they answered during onboarding. The mapping is
   * deliberately partial: only unambiguous 1:1 translations are listed, and
   * anything that would need a guess is left to be asked properly — a derived
   * answer that over-claims is worse than an honest gap.
   */
  derivedFrom?: { field: string; map: Record<string, string> };
  /**
   * The other direction: when this question is answered and the older field is
   * still blank, fill it in. Without this a user answers "relocation kahan tak"
   * here and the dashboard still lists "Relocation" as missing — the app asking
   * for something it was just told, which is the exact "not listening" feeling
   * the whole layer design exists to avoid.
   *
   * Only ever writes into a blank. An answer the user gave in the full form is
   * never overwritten by a coarser one derived from here.
   */
  writeBack?: { field: string; map: Record<string, string> };
};

export type IntelligenceLayerDef = {
  key: IntelligenceLayerKey;
  /** Dashboard-facing name — "Shaadi ke baad zindagi". */
  title: string;
  /** One line on what answering this buys. Shown under the CTA. */
  unlocks: string;
  estimatedMinutes: number;
  /**
   * Legacy profile fields this layer already knows, shown as "ye pehle se pata
   * hai" ticks instead of being asked again.
   */
  alreadyKnown?: { field: string; label: string }[];
};

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

export const INTELLIGENCE_LAYERS: IntelligenceLayerDef[] = [
  {
    key: "INTENT",
    title: "Shaadi ka iraada",
    unlocks: "Ab timing aur family timing ke hisaab se matches compare ho payenge",
    estimatedMinutes: 1,
  },
  {
    key: "FAMILY_LIFE",
    title: "Shaadi ke baad zindagi",
    unlocks: "Joint/nuclear aur family expectations wale matches behtar honge",
    estimatedMinutes: 1,
    alreadyKnown: [{ field: "familyType", label: "Abhi ki family" }],
  },
  {
    key: "CAREER",
    title: "Career aur city",
    unlocks: "Relocation aur kaam ki expectations pehle hi clear ho jayengi",
    estimatedMinutes: 1,
    alreadyKnown: [{ field: "profession", label: "Profession" }],
  },
  {
    key: "MONEY",
    title: "Paisa aur zimmedari",
    unlocks: "Paise ki soch milti hai ya nahi — ye ab match me count hoga",
    estimatedMinutes: 1,
  },
  {
    key: "CHILDREN",
    title: "Bachche aur parenting",
    unlocks: "Ye sabse bada faisla hai — mismatch pehle hi pata chal jayega",
    estimatedMinutes: 1,
  },
  {
    key: "LIFESTYLE",
    title: "Roz ki zindagi",
    unlocks: "Routine aur lifestyle milne wale log upar aayenge",
    estimatedMinutes: 1,
    alreadyKnown: [
      { field: "diet", label: "Khaan-paan" },
      { field: "hobbies", label: "Shauk" },
      { field: "weekendVibe", label: "Weekend vibe" },
    ],
  },
  {
    key: "COMMUNICATION",
    title: "Baat-cheet aur rishta",
    unlocks: "Jhagda aur baat karne ka tareeqa — compatibility ka asli hissa",
    estimatedMinutes: 2,
    alreadyKnown: [{ field: "socialEnergy", label: "Social energy" }],
  },
  {
    key: "VALUES",
    title: "Values aur parampara",
    unlocks: "Tradition aur modern ka balance ab match hone lagega",
    estimatedMinutes: 1,
    alreadyKnown: [{ field: "familyValues", label: "Family values" }],
  },
  {
    key: "PARTNER_PREFERENCES",
    title: "Partner me kya chahiye",
    unlocks: "Ab pata chalega kaunsi baat must hai aur kaunsi flexible",
    estimatedMinutes: 2,
    alreadyKnown: [
      { field: "partnerAgeRange", label: "Age range" },
      { field: "partnerCityPreference", label: "City" },
      { field: "partnerEducation", label: "Education" },
    ],
  },
];

export const LAYER_BY_KEY = Object.fromEntries(
  INTELLIGENCE_LAYERS.map((l) => [l.key, l]),
) as Record<IntelligenceLayerKey, IntelligenceLayerDef>;

/** URL slug for each layer — `/user/profile/intelligence/family-life`. */
export const LAYER_SLUG: Record<IntelligenceLayerKey, string> = {
  INTENT: "intent",
  FAMILY_LIFE: "family-life",
  CAREER: "career",
  MONEY: "money",
  CHILDREN: "children",
  LIFESTYLE: "lifestyle",
  COMMUNICATION: "communication",
  VALUES: "values",
  PARTNER_PREFERENCES: "partner-preferences",
};

export function layerFromSlug(slug: string): IntelligenceLayerKey | null {
  const found = INTELLIGENCE_LAYERS.find((l) => LAYER_SLUG[l.key] === slug);
  return found ? found.key : null;
}

/* ------------------------------------------------------------------ */
/* Layer 1 — Marriage Intent                                           */
/* ------------------------------------------------------------------ */

const INTENT: IntelligenceQuestionDef[] = [
  {
    key: "marriageTimeline",
    layer: "INTENT",
    label: "Shaadi kab tak",
    question: "Aap realistically shaadi kab tak karna chahte hain?",
    questionForChild: "Unki shaadi realistically kab tak karna chahte hain?",
    options: ["0–3 months", "3–6 months", "6–12 months", "1–2 years", "Abhi sure nahi"],
    whyNeeded: "Do log jinki timing hi alag hai, unka rishta aage nahi badhta — ye pehle hi match kar lena behtar hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["RELATIONSHIP_READINESS"],
    // The first three map onto `Profile.marriageTimeline`, which Serious Circle
    // already gates on — so a user who declared it there is never asked again,
    // and answering it here counts for Circle eligibility too. The last two
    // have no enum value on purpose: the app will not guess a timeline it was
    // never given (see the Profile.marriageTimeline docstring).
    derivedFrom: {
      field: "marriageTimelineEnum",
      map: {
        WITHIN_3_MONTHS: "0–3 months",
        WITHIN_6_MONTHS: "3–6 months",
        WITHIN_1_YEAR: "6–12 months",
      },
    },
  },
  {
    key: "relationshipReadiness",
    layer: "INTENT",
    label: "Abhi ka stage",
    question: "Abhi aap kis stage par hain?",
    questionForChild: "Abhi wo kis stage par hain?",
    options: [
      "Family talks ke liye ready hoon",
      "Pehle person ko achhe se samajhna chahta/chahti hoon",
      "Seriously explore kar raha/rahi hoon, jaldi nahi hai",
      "Abhi sure nahi",
    ],
    whyNeeded: "Isse aapko wo log dikhte hain jo aapke hi stage par hain — na jaldi karne wale, na tal-mataul karne wale.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["RELATIONSHIP_READINESS"],
    selfRequired: true,
  },
  {
    key: "familyIntroductionTiming",
    layer: "INTENT",
    label: "Family kab milegi",
    question: "Aap family ko kis stage par involve karna pasand karenge?",
    questionForChild: "Family kis stage par involve hogi?",
    options: ["Shuru se", "2–3 conversations ke baad", "Mutual interest ke baad", "Jab rishta serious lage"],
    whyNeeded: "Kai rishte sirf isliye tootte hain ki ek taraf family jaldi aa gayi aur doosri taraf abhi taiyaar nahi thi.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FAMILY_ORIENTATION"],
  },
  {
    key: "decisionOwnership",
    layer: "INTENT",
    label: "Final faisla",
    question: "Shaadi ka final decision generally kaise hoga?",
    questionForChild: "Shaadi ka final decision kaise hoga?",
    options: [
      "Main primarily decide karunga/karungi",
      "Main aur family equally",
      "Family ki strong involvement hogi",
      "Mostly family-led",
    ],
    whyNeeded: "Faisla kaun leta hai — ye baat na mile to rishta beech me hi atak jaata hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FAMILY_ORIENTATION", "PRACTICAL_DECISION_STYLE"],
  },
  {
    key: "gettingToKnowPace",
    layer: "INTENT",
    label: "Jaanne ka pace",
    question: "Ek potential match ko samajhne ke liye aapko kaisa pace comfortable lagta hai?",
    questionForChild: "Unhe kisi ko samajhne me kaisa pace comfortable lagta hai?",
    options: ["Fast — jaldi clarity", "Balanced", "Time lekar", "Situation par depend"],
    whyNeeded: "Pace ka mismatch sabse zyada galatfehmi paida karta hai — ek ko lagta hai interest nahi, doosre ko lagta hai jaldi ho rahi hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["RELATIONSHIP_READINESS", "COMMUNICATION_CLARITY"],
    selfRequired: true,
  },
];

/* ------------------------------------------------------------------ */
/* Layer 2 — Home & Family Life                                        */
/* ------------------------------------------------------------------ */

const FAMILY_LIFE: IntelligenceQuestionDef[] = [
  {
    key: "postMarriageLivingPlan",
    layer: "FAMILY_LIFE",
    label: "Rehna kahan",
    question: "Shaadi ke baad living arrangement ko lekar aapki preference kya hai?",
    questionForChild: "Shaadi ke baad living arrangement kya soch rahe hain?",
    options: [
      "Joint family",
      "Parents ke paas, lekin separate home",
      "Nuclear family",
      "Flexible",
      "Partner ke saath decide karenge",
    ],
    whyNeeded: "Ye India me sabse bada practical faisla hai. Match se pehle pata ho to dono ka time bachta hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FAMILY_ORIENTATION", "LONG_TERM_STABILITY"],
  },
  {
    key: "parentCareExpectation",
    layer: "FAMILY_LIFE",
    label: "Parents ki care",
    question: "Future me parents ki care/responsibility ko aap kaise dekhte hain?",
    questionForChild: "Parents ki care/responsibility ko wo kaise dekhte hain?",
    options: [
      "Daily life me actively involved rehna important hai",
      "Financial/support responsibility important hai",
      "Siblings ke saath shared responsibility",
      "Situation ke hisaab se",
      "Partner ke saath milkar decide karenge",
    ],
    whyNeeded: "Shaadi ke do saal baad ye baat sabse zyada matter karti hai — pehle clear ho jaye to behtar.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FAMILY_ORIENTATION", "LONG_TERM_STABILITY"],
  },
  {
    key: "familyInvolvementLevel",
    layer: "FAMILY_LIFE",
    label: "Family involvement",
    question: "Shaadi ke baad extended family ki involvement kitni comfortable lagti hai?",
    questionForChild: "Extended family ki involvement kitni comfortable lagti hai?",
    options: [
      "Bahut close/involved",
      "Regular, lekin boundaries ke saath",
      "Moderate",
      "Mostly couple-led life",
      "Depends",
    ],
    whyNeeded: "Family kitni paas rahegi — is par dono ki soch alag ho to roz ki zindagi me farak padta hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FAMILY_ORIENTATION"],
  },
  {
    key: "householdDecisionStyle",
    layer: "FAMILY_LIFE",
    label: "Bade decisions",
    question: "Ghar ke bade decisions kaise hone chahiye?",
    questionForChild: "Ghar ke bade decisions kaise hone chahiye?",
    options: [
      "Couple pehle decide kare",
      "Couple + family milkar",
      "Family matters me elders ki strong role ho",
      "Decision ke type par depend",
    ],
    whyNeeded: "Faisle kaun leta hai — ye rishte ki roz ki shanti tay karta hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["PRACTICAL_DECISION_STYLE", "FAMILY_ORIENTATION"],
  },
  {
    key: "householdResponsibilityStyle",
    layer: "FAMILY_LIFE",
    label: "Ghar ka kaam",
    question: "Daily ghar ki responsibilities ko kaise handle karna sahi lagta hai?",
    questionForChild: "Ghar ki daily responsibilities kaise handle honi chahiye?",
    options: [
      "Equal sharing",
      "Jiske paas time ho woh kare",
      "Roles divide karna better hai",
      "Domestic help + shared responsibility",
      "Partner ke saath decide",
    ],
    whyNeeded: "Ghar ka kaam kaise banta hai — is par expectations match na ho to rozana ghisav hota hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["PARTNER_SUPPORT_EXPECTATION"],
  },
];

/* ------------------------------------------------------------------ */
/* Layer 3 — Career & Relocation                                       */
/* ------------------------------------------------------------------ */

const CAREER: IntelligenceQuestionDef[] = [
  {
    key: "careerPriority",
    layer: "CAREER",
    label: "Career priority",
    question: "Aapke liye career life me kitna important hai?",
    questionForChild: "Unke liye career kitna important hai?",
    options: ["Top priority", "Bahut important", "Balanced with family", "Flexible", "Abhi sure nahi"],
    whyNeeded: "Career ki priority match ho to dono ek doosre ka kaam samajh paate hain.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["CAREER_FOCUS"],
  },
  {
    key: "relocationBoundary",
    layer: "CAREER",
    label: "Relocation",
    question: "Shaadi ke liye relocation kahan tak possible hai?",
    questionForChild: "Shaadi ke liye relocation kahan tak possible hai?",
    options: [
      "Same city/nearby only",
      "Selected cities",
      "Anywhere in India",
      "International bhi",
      "Relocate nahi kar sakta/sakti",
      "Right person ho to discuss kar sakte hain",
    ],
    whyNeeded: "Sirf 'haan/nahi' se kaam nahi chalta — kahan tak, ye asli sawaal hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "PREFERENCE",
    dimensionsHelped: ["ADAPTABILITY"],
    // Only the two unambiguous ones. "Haan" says willing, not how far — that
    // genuinely needs asking, so it is left unmapped rather than guessed.
    derivedFrom: {
      field: "relocateWilling",
      map: {
        Nahi: "Relocate nahi kar sakta/sakti",
        "Shaayad — baat kar sakte hain": "Right person ho to discuss kar sakte hain",
      },
    },
    writeBack: {
      field: "relocateWilling",
      map: {
        "Same city/nearby only": "Nahi",
        "Relocate nahi kar sakta/sakti": "Nahi",
        "Selected cities": "Shaayad — baat kar sakte hain",
        "Right person ho to discuss kar sakte hain": "Shaayad — baat kar sakte hain",
        "Anywhere in India": "Haan",
        "International bhi": "Haan",
      },
    },
  },
  {
    key: "partnerCareerExpectation",
    layer: "CAREER",
    label: "Partner ka career",
    question: "Partner ke career ko lekar aap kya expect karte hain?",
    questionForChild: "Partner ke career ko lekar kya expect karte hain?",
    options: [
      "Career continue karna important hai",
      "Continue kare to accha hai",
      "Unki choice",
      "Family situation ke hisaab se",
      "Prefer home-focused",
      "Discuss together",
    ],
    whyNeeded: "Ye baat aage jaake sabse zyada matter karti hai — pehle clear ho jaye to behtar.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "PREFERENCE",
    dimensionsHelped: ["PARTNER_SUPPORT_EXPECTATION"],
    derivedFrom: {
      field: "partnerWorkExpectation",
      map: {
        "Job karein to accha hai": "Continue kare to accha hai",
        "Ghar sambhalein": "Prefer home-focused",
        "Unki marzi": "Unki choice",
        "Baat kar ke tay karenge": "Discuss together",
      },
    },
    writeBack: {
      field: "partnerWorkExpectation",
      map: {
        "Career continue karna important hai": "Job karein to accha hai",
        "Continue kare to accha hai": "Job karein to accha hai",
        "Unki choice": "Unki marzi",
        "Family situation ke hisaab se": "Baat kar ke tay karenge",
        "Prefer home-focused": "Ghar sambhalein",
        "Discuss together": "Baat kar ke tay karenge",
      },
    },
  },
  {
    key: "careerBreakExpectation",
    layer: "CAREER",
    label: "Career break",
    question: "Children/family ke liye future career break aaye to aap kaise dekhte hain?",
    questionForChild: "Family ke liye career break ko wo kaise dekhte hain?",
    options: [
      "Dono me se koi situation ke hisaab se",
      "Career break avoid karna chahiye",
      "Temporary break okay hai",
      "Family role ke hisaab se decide",
      "Abhi discuss nahi kiya",
    ],
    whyNeeded: "Ye wo baat hai jo shaadi ke baad achanak samne aati hai — pehle poochh lena zyada imaandaar hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["CAREER_FOCUS", "PARTNER_SUPPORT_EXPECTATION"],
  },
  {
    key: "workIntensityAcceptance",
    layer: "CAREER",
    label: "Kaam ka pressure",
    question: "Long hours / travel-heavy career partner me aapko kaisa lagega?",
    questionForChild: "Long hours ya travel-heavy partner unhe kaisa lagega?",
    options: ["Bilkul okay", "Occasionally okay", "Work-life balance important", "Prefer predictable schedule"],
    whyNeeded: "Partner ka schedule aapki roz ki zindagi tay karta hai — ye chhoti baat nahi hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "PREFERENCE",
    dimensionsHelped: ["LIFESTYLE_ALIGNMENT", "ADAPTABILITY"],
  },
];

/* ------------------------------------------------------------------ */
/* Layer 4 — Money & Responsibilities                                  */
/*                                                                     */
/* Nothing here is PROFILE_VISIBLE, and no question asks for an amount. */
/* ------------------------------------------------------------------ */

const MONEY: IntelligenceQuestionDef[] = [
  {
    key: "moneyStyle",
    layer: "MONEY",
    label: "Paise ki aadat",
    question: "Aap naturally paise kaise handle karte hain?",
    questionForChild: "Wo naturally paise kaise handle karte hain?",
    options: [
      "Saver",
      "Save + enjoy balanced",
      "Investor mindset",
      "Experiences par spend karna pasand",
      "Situation based",
    ],
    whyNeeded: "Paise ki aadat rozana dikhti hai — ye milti ho to bahut kuch apne aap set ho jaata hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FINANCIAL_DISCIPLINE"],
    selfRequired: true,
  },
  {
    key: "postMarriageFinanceStyle",
    layer: "MONEY",
    label: "Shaadi ke baad paisa",
    question: "Shaadi ke baad finances kaise manage karna comfortable lagega?",
    questionForChild: "Shaadi ke baad finances kaise manage honi chahiye?",
    options: [
      "Mostly joint",
      "Joint expenses + separate savings",
      "Mostly separate",
      "Income ke proportion me contribution",
      "Partner ke saath decide",
    ],
    whyNeeded: "Joint ya separate — is par pehle se soch mil jaye to baad me tension nahi hoti.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FINANCIAL_DISCIPLINE", "LONG_TERM_STABILITY"],
  },
  {
    key: "familyFinancialSupport",
    layer: "MONEY",
    label: "Family support",
    question: "Kya aapki family ke liye regular financial responsibility hai?",
    questionForChild: "Kya family ke liye regular financial responsibility hai?",
    options: ["Nahi", "Kabhi-kabhi", "Regular support", "Significant responsibility", "Private rakhna chahta/chahti hoon"],
    whyNeeded: "Amount kabhi nahi poochha jaata — sirf ye ki zimmedari hai ya nahi.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "NONE",
    dimensionsHelped: ["FAMILY_ORIENTATION", "FINANCIAL_DISCIPLINE"],
  },
  {
    key: "debtObligation",
    layer: "MONEY",
    label: "Financial commitment",
    question: "Kya currently koi major financial commitment hai?",
    questionForChild: "Kya koi major financial commitment hai?",
    options: [
      "None",
      "Home loan",
      "Education loan",
      "Business commitment",
      "Other major loan",
      "Serious stage par discuss karunga/karungi",
    ],
    whyNeeded: "Amount kabhi nahi poochha jaata. Ye sirf aapke apne record ke liye hai.",
    visibility: "PRIVATE",
    required: false,
    compatibilityMode: "NONE",
  },
  {
    key: "bigPurchaseDecision",
    layer: "MONEY",
    label: "Bada kharch",
    question: "Ghar/car/investment jaisa bada expense kaise decide hona chahiye?",
    questionForChild: "Bada expense kaise decide hona chahiye?",
    options: ["Dono milkar", "Jo financially lead kare", "Individual freedom + large expenses jointly", "Depends"],
    whyNeeded: "Bade kharch par kaun bolta hai — ye faislon ka style bata deta hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FINANCIAL_DISCIPLINE", "PRACTICAL_DECISION_STYLE"],
  },
];

/* ------------------------------------------------------------------ */
/* Layer 5 — Children & Parenting                                      */
/* ------------------------------------------------------------------ */

const CHILDREN: IntelligenceQuestionDef[] = [
  {
    key: "childrenPreference",
    layer: "CHILDREN",
    label: "Bachche",
    question: "Future me children ko lekar aap kya sochte hain?",
    questionForChild: "Future me children ko lekar wo kya sochte hain?",
    options: ["Definitely yes", "Probably yes", "Unsure", "No"],
    whyNeeded: "Is ek baat par mismatch ho to rishta baad me tootta hai. Ye answer public profile par nahi dikhta.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "PREFERENCE",
    dimensionsHelped: ["RELATIONSHIP_READINESS", "LONG_TERM_STABILITY"],
    selfRequired: true,
  },
  {
    key: "childrenTimeline",
    layer: "CHILDREN",
    label: "Family planning",
    question: "Shaadi ke kitne time baad family plan karna comfortable lagega?",
    questionForChild: "Shaadi ke kitne time baad family plan karna theek rahega?",
    options: ["Jaldi", "1–2 years", "3+ years", "No fixed timeline", "Partner ke saath decide"],
    whyNeeded: "Timing ka farak baad me sabse zyada takraar deta hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    branchOn: { key: "childrenPreference", anyOf: ["Definitely yes", "Probably yes"] },
    compatibilityMode: "EXACT",
    dimensionsHelped: ["LONG_TERM_STABILITY"],
    selfRequired: true,
  },
  {
    key: "parentingResponsibility",
    layer: "CHILDREN",
    label: "Parenting share",
    question: "Parenting responsibilities kaise share honi chahiye?",
    questionForChild: "Parenting responsibilities kaise share honi chahiye?",
    options: [
      "Equal involvement",
      "Work situation ke hisaab se",
      "One parent primary role le sakta hai",
      "Extended family support ke saath",
      "Discuss later",
    ],
    whyNeeded: "Bachche aane ke baad zimmedari kaise bantegi — ye pehle poochh lena imaandaari hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    branchOn: { key: "childrenPreference", anyOf: ["Definitely yes", "Probably yes", "Unsure"] },
    compatibilityMode: "EXACT",
    dimensionsHelped: ["PARTNER_SUPPORT_EXPECTATION", "FAMILY_ORIENTATION"],
  },
  {
    key: "parentingStyle",
    layer: "CHILDREN",
    label: "Parenting style",
    question: "Parenting style kis taraf naturally lean karti hai?",
    questionForChild: "Parenting style kis taraf lean karti hai?",
    options: ["Traditional", "Balanced", "Progressive", "Abhi sure nahi"],
    whyNeeded: "Bachchon ki parvarish ki soch milti ho to ghar me kam bahas hoti hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    branchOn: { key: "childrenPreference", anyOf: ["Definitely yes", "Probably yes", "Unsure"] },
    compatibilityMode: "EXACT",
    dimensionsHelped: ["TRADITION_MODERN_BALANCE"],
  },
];

/* ------------------------------------------------------------------ */
/* Layer 6 — Lifestyle & Daily Life                                    */
/*                                                                     */
/* Diet, smoking, drinking, hobbies, languages and the mindset trio are */
/* already in the profile — this layer never re-asks them, it shows     */
/* them as known and asks only what is genuinely missing.               */
/* ------------------------------------------------------------------ */

const LIFESTYLE: IntelligenceQuestionDef[] = [
  {
    key: "sleepRhythm",
    layer: "LIFESTYLE",
    label: "Routine",
    question: "Aapka normal routine kaisa hai?",
    questionForChild: "Unka normal routine kaisa hai?",
    options: ["Early morning person", "Late-night person", "Normal office-style routine", "Routine flexible hai"],
    whyNeeded: "Ek ghar me do alag routine — ye choti si baat rozana mehsoos hoti hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["LIFESTYLE_ALIGNMENT"],
  },
  {
    key: "fitnessImportance",
    layer: "LIFESTYLE",
    label: "Fitness",
    question: "Fitness/health routine aapke liye kitni important hai?",
    questionForChild: "Fitness/health routine unke liye kitni important hai?",
    options: ["Daily life ka important part", "Regularly try karta/karti hoon", "Occasionally", "Priority nahi"],
    whyNeeded: "Health ki aadat milti ho to saath waqt bitana asaan ho jaata hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["LIFESTYLE_ALIGNMENT"],
  },
  {
    key: "travelStyle",
    layer: "LIFESTYLE",
    label: "Travel",
    question: "Travel ko lekar aap kaise hain?",
    questionForChild: "Travel ko lekar wo kaise hain?",
    options: ["Frequent traveller", "Saalaana kuch trips", "Occasionally", "Home/local life prefer"],
    whyNeeded: "Chhutti kaise bitani hai — is par soch mile to zindagi asaan rehti hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["LIFESTYLE_ALIGNMENT"],
  },
  {
    key: "petsPreference",
    layer: "LIFESTYLE",
    label: "Pets",
    question: "Pets ko lekar aap comfortable hain?",
    questionForChild: "Pets ko lekar wo comfortable hain?",
    options: ["Love pets", "Okay with pets", "Prefer no pets", "Depends"],
    whyNeeded: "Chhoti baat lagti hai, lekin ek ghar me ye roz ki baat ban jaati hai.",
    visibility: "PROFILE_VISIBLE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["LIFESTYLE_ALIGNMENT"],
  },
];

/* ------------------------------------------------------------------ */
/* Layer 7 — Communication & Relationship Style                        */
/*                                                                     */
/* Scenario questions, not adjectives. "Aap kaise ho" gets a flattering */
/* answer; "aap us waqt kya karoge" gets a real one.                   */
/* ------------------------------------------------------------------ */

const COMMUNICATION: IntelligenceQuestionDef[] = [
  {
    key: "conflictFirstResponse",
    layer: "COMMUNICATION",
    label: "Jhagde ke baad",
    question: "Partner upset ho aur turant baat na karna chahe, aap generally kya karenge?",
    questionForChild: "Aisi situation me wo generally kya karte hain?",
    options: [
      "Thoda space dunga/dungi",
      "Turant calmly baat karna prefer",
      "Message karke baad me baat",
      "Situation par depend",
    ],
    whyNeeded: "Jhagde ke baad ka pehla kadam — compatibility ka isse behtar signal koi nahi.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["CONFLICT_HANDLING", "EMOTIONAL_MATURITY"],
    selfRequired: true,
  },
  {
    key: "disagreementStyle",
    layer: "COMMUNICATION",
    label: "Disagreement",
    question: "Aap dono kisi important baat par disagree karein to?",
    questionForChild: "Important baat par disagreement ho to wo kya karte hain?",
    options: [
      "Baat karke middle ground",
      "Facts/pros-cons dekhna",
      "Thoda time lekar revisit",
      "Trusted person/family advice",
      "Situation based",
    ],
    whyNeeded: "Disagreement kaise sulajhta hai — rishta isi par tikta hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["CONFLICT_HANDLING", "PRACTICAL_DECISION_STYLE"],
    selfRequired: true,
  },
  {
    key: "communicationFrequency",
    layer: "COMMUNICATION",
    label: "Baat kitni",
    question: "Relationship me daily communication kitni important lagti hai?",
    questionForChild: "Daily communication unke liye kitni important hai?",
    options: [
      "Bahut important",
      "Regular contact, but not constant",
      "Quality matters more than frequency",
      "Routine ke hisaab se",
    ],
    whyNeeded: "Ek ko roz baat chahiye, doosre ko nahi — ye mismatch bahut aam hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["COMMUNICATION_CLARITY"],
  },
  {
    key: "personalSpace",
    layer: "COMMUNICATION",
    label: "Personal space",
    question: "Personal space ko lekar aap kya prefer karte hain?",
    questionForChild: "Personal space ko lekar wo kya prefer karte hain?",
    options: [
      "Individual time bahut important",
      "Balanced together + personal time",
      "Most things together karna pasand",
      "Depends",
    ],
    whyNeeded: "Apna time kitna chahiye — ye har din mehsoos hota hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["EMOTIONAL_MATURITY", "LIFESTYLE_ALIGNMENT"],
  },
  {
    key: "careStyle",
    layer: "COMMUNICATION",
    label: "Care ka tareeqa",
    question: "Aap care zyada kaise express karte hain?",
    questionForChild: "Wo care kaise express karte hain?",
    options: ["Baat karke/reassurance", "Time dekar", "Practical help/actions", "Small gestures/gifts", "Mix"],
    whyNeeded: "Pyaar jataane ke tareeqe alag hon to dono ko lagta hai saamne wale ne dhyaan nahi diya.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["EMOTIONAL_MATURITY"],
    selfRequired: true,
  },
  {
    key: "privacyBoundary",
    layer: "COMMUNICATION",
    label: "Private baatein",
    question: "Relationship ki personal baatein family/friends ke saath share karne ko lekar?",
    questionForChild: "Personal baatein family/friends se share karne ko lekar wo kya sochte hain?",
    options: [
      "Mostly private",
      "Important things trusted family se share",
      "Close family involvement comfortable",
      "Situation based",
    ],
    whyNeeded: "Ghar ki baat bahar jaaye ya nahi — is par soch milna zaroori hai.",
    visibility: "MATCH_PRIVATE",
    required: false,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["FAMILY_ORIENTATION", "EMOTIONAL_MATURITY"],
  },
];

/* ------------------------------------------------------------------ */
/* Layer 8 — Values, Tradition & Beliefs                               */
/*                                                                     */
/* `interCommunityOpenness` is an *explicit preference the user typed*, */
/* exactly like `partnerCastePreference` in fields.ts. It never becomes */
/* an automatic signal derived from anyone's own caste/religion, and it */
/* never enters an embedding (M17 §L1).                                */
/* ------------------------------------------------------------------ */

const VALUES: IntelligenceQuestionDef[] = [
  {
    key: "religiousPracticeLevel",
    layer: "VALUES",
    label: "Religion practice",
    question: "Religion/practice daily life me kitni important hai?",
    questionForChild: "Religion/practice unke daily life me kitni important hai?",
    options: [
      "Very important",
      "Moderately important",
      "Occasional",
      "Cultural more than religious",
      "Not important",
      "Prefer not to answer",
    ],
    whyNeeded: "Ye kabhi apne aap aapke matches tay nahi karta — sirf tab count hota hai jab aap khud isse apni preference banayein.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["TRADITION_MODERN_BALANCE"],
  },
  {
    key: "ritualImportance",
    layer: "VALUES",
    label: "Rituals",
    question: "Festivals/rituals/traditions ko follow karna kitna important hai?",
    questionForChild: "Festivals aur traditions follow karna kitna important hai?",
    options: [
      "Strongly important",
      "Important selected traditions",
      "Flexible",
      "Not particularly important",
    ],
    whyNeeded: "Tyohaar kaise manaye jaate hain — ye ghar ka roz ka rang hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["TRADITION_MODERN_BALANCE"],
  },
  {
    key: "traditionModernBalance",
    layer: "VALUES",
    label: "Tradition vs modern",
    question: "Marriage life me aap kis balance ko prefer karte hain?",
    questionForChild: "Marriage life me wo kis balance ko prefer karte hain?",
    options: [
      "Mostly traditional",
      "Traditional with modern flexibility",
      "Balanced",
      "Mostly modern",
      "Depends on issue",
    ],
    whyNeeded: "Purani 'Traditional/Modern' wali choice ki jagah ye zyada saaf tasveer deti hai.",
    visibility: "PROFILE_VISIBLE",
    required: true,
    compatibilityMode: "EXACT",
    dimensionsHelped: ["TRADITION_MODERN_BALANCE"],
    // The old three-way `familyValues` answer keeps counting — nobody is asked
    // this twice — but the richer option list is what new answers write.
    derivedFrom: {
      field: "familyValues",
      map: {
        Traditional: "Mostly traditional",
        Modern: "Mostly modern",
        "Thoda dono": "Balanced",
      },
    },
    writeBack: {
      field: "familyValues",
      map: {
        "Mostly traditional": "Traditional",
        "Traditional with modern flexibility": "Thoda dono",
        Balanced: "Thoda dono",
        "Mostly modern": "Modern",
        "Depends on issue": "Thoda dono",
      },
    },
  },
  {
    key: "interCommunityOpenness",
    layer: "VALUES",
    label: "Community openness",
    question: "Different caste/community background ke rishtay ko lekar aap kitne open hain?",
    questionForChild: "Different caste/community ke rishton ko lekar wo kitne open hain?",
    options: [
      "Completely open",
      "Preference hai but flexible",
      "Same community strongly prefer",
      "Family ke saath discuss hoga",
      "Prefer not to answer",
    ],
    whyNeeded:
      "Ye sirf aapki apni batayi hui preference hai. Ye kisi ki caste se apne aap kuch nahi jodta aur matching model me kabhi nahi jaata.",
    visibility: "MATCH_PRIVATE",
    required: true,
    compatibilityMode: "PREFERENCE",
  },
];

/* ------------------------------------------------------------------ */
/* Layer 9 — What You Want in a Partner                                */
/*                                                                     */
/* The preferences themselves already exist in fields.ts. What was      */
/* missing is *strictness*: the app could not tell a must-have from a   */
/* nice-to-have, so every stated preference weighed the same. Each      */
/* question below only appears when its underlying preference is        */
/* actually set — a user who left everything at "Koi farak nahi" is     */
/* never asked how important "Koi farak nahi" is to them.               */
/* ------------------------------------------------------------------ */

export const IMPORTANCE_OPTIONS = ["Must match", "Strong preference", "Flexible"] as const;
export type ImportanceAnswer = (typeof IMPORTANCE_OPTIONS)[number];

/** Weight multiplier applied to the matching signal this importance governs. */
export const IMPORTANCE_MULTIPLIER: Record<ImportanceAnswer, number> = {
  "Must match": 1.6,
  "Strong preference": 1,
  Flexible: 0.4,
};

/**
 * `importance:<signal>` — one namespace so `intelligenceService` and the match
 * pipeline can find every strictness answer without keeping a second list.
 */
export const IMPORTANCE_PREFIX = "importance:";

type ImportanceSpec = {
  /** The matching signal this governs — the suffix after `importance:`. */
  signal: string;
  label: string;
  /** "Partner ki age" — dropped into the shared question sentence. */
  subject: string;
  branchOn: BranchCondition;
};

const IMPORTANCE_SPECS: ImportanceSpec[] = [
  { signal: "age", label: "Age", subject: "Partner ki age range", branchOn: { key: "partnerAgeRange", present: true } },
  {
    signal: "city",
    label: "City",
    subject: "Partner ka sheher",
    branchOn: { key: "partnerCityPreference", notOneOf: ["Kahin bhi"] },
  },
  {
    signal: "education",
    label: "Education",
    subject: "Partner ki education",
    branchOn: { key: "partnerEducation", notOneOf: ["Koi farak nahi"] },
  },
  {
    signal: "children",
    label: "Children",
    subject: "Children ko lekar same soch",
    branchOn: { key: "childrenPreference", present: true },
  },
  {
    signal: "living",
    label: "Living arrangement",
    subject: "Shaadi ke baad living arrangement",
    branchOn: { key: "postMarriageLivingPlan", present: true },
  },
  {
    signal: "relocation",
    label: "Relocation",
    subject: "Relocation ko lekar unki position",
    branchOn: { key: "relocationBoundary", present: true },
  },
  {
    signal: "partnerCareer",
    label: "Partner career",
    subject: "Partner ke career ko lekar aapki expectation",
    branchOn: { key: "partnerCareerExpectation", notOneOf: ["Unki choice", "Discuss together"] },
  },
  {
    signal: "religion",
    label: "Religion",
    subject: "Partner ka religion",
    branchOn: { key: "partnerReligionPreference", notOneOf: ["Koi farak nahi"] },
  },
  {
    signal: "caste",
    label: "Community",
    subject: "Partner ki caste/community",
    branchOn: { key: "partnerCastePreference", notOneOf: ["Koi farak nahi", "koi farak nahi"] },
  },
  {
    signal: "manglik",
    label: "Manglik",
    subject: "Manglik status",
    branchOn: { key: "partnerManglikPreference", notOneOf: ["Koi farak nahi"] },
  },
];

export function importanceKeyFor(signal: string): string {
  return `${IMPORTANCE_PREFIX}${signal}`;
}

const IMPORTANCE_QUESTIONS: IntelligenceQuestionDef[] = IMPORTANCE_SPECS.map((spec) => ({
  key: importanceKeyFor(spec.signal),
  layer: "PARTNER_PREFERENCES" as const,
  label: spec.label,
  question: `${spec.subject} — ye aapke liye kitna important hai?`,
  questionForChild: `${spec.subject} — ye kitna important hai?`,
  options: [...IMPORTANCE_OPTIONS],
  whyNeeded: "Isse ye tay hota hai ki ye baat ranking me kitna weight le. Must match zyada, Flexible kam.",
  visibility: "MATCH_PRIVATE" as const,
  required: true,
  branchOn: spec.branchOn,
  compatibilityMode: "PREFERENCE" as const,
}));

/**
 * Structured deal breakers.
 *
 * `fields.ts` already has a free-text `dealBreakers` box, and `pipeline.ts`
 * matches it by looking for the literal words "smoking", "relocate" and
 * "joint family" in whatever the user typed. That check is honest about being
 * a keyword scan, but it means "sharaab bilkul nahi" matches nothing at all.
 * Codes fix that without taking the free-text box away: the box stays, for the
 * one thing that never fits a list.
 *
 * Codes are stored, never labels — so re-wording a chip cannot silently
 * invalidate everyone's saved answer.
 */
export const DEAL_BREAKER_OPTIONS: { code: string; label: string }[] = [
  { code: "NO_SMOKING", label: "Smoking" },
  { code: "NO_DRINKING", label: "Drinking" },
  { code: "CHILDREN_MISMATCH", label: "Children preference" },
  { code: "NO_RELOCATION", label: "Relocation" },
  { code: "CAREER_CONTINUATION", label: "Career continuation" },
  { code: "LIVING_ARRANGEMENT", label: "Living arrangement" },
  { code: "RELIGION", label: "Religion" },
  { code: "COMMUNITY", label: "Community" },
  { code: "DIET", label: "Diet" },
  { code: "FAMILY_INVOLVEMENT", label: "Family involvement" },
];

export const DEAL_BREAKER_LABEL: Record<string, string> = Object.fromEntries(
  DEAL_BREAKER_OPTIONS.map((o) => [o.code, o.label]),
);

export const MAX_DEAL_BREAKERS = 5;

const PARTNER_PREFERENCES: IntelligenceQuestionDef[] = [
  {
    key: "dealBreakerCodes",
    layer: "PARTNER_PREFERENCES",
    label: "Non-negotiables",
    question: `Zyada se zyada ${MAX_DEAL_BREAKERS} non-negotiables chuniye.`,
    questionForChild: `Zyada se zyada ${MAX_DEAL_BREAKERS} non-negotiables chuniye.`,
    options: DEAL_BREAKER_OPTIONS.map((o) => o.code),
    whyNeeded: "Jo baat bilkul acceptable nahi — wo profile hi upar na aaye, ye usi ke liye hai.",
    visibility: "MATCH_PRIVATE",
    required: true,
    multi: true,
    maxSelections: MAX_DEAL_BREAKERS,
    compatibilityMode: "PREFERENCE",
  },
  ...IMPORTANCE_QUESTIONS,
];

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const INTELLIGENCE_QUESTIONS: IntelligenceQuestionDef[] = [
  ...INTENT,
  ...FAMILY_LIFE,
  ...CAREER,
  ...MONEY,
  ...CHILDREN,
  ...LIFESTYLE,
  ...COMMUNICATION,
  ...VALUES,
  ...PARTNER_PREFERENCES,
];

export const INTELLIGENCE_QUESTION_BY_KEY: Record<string, IntelligenceQuestionDef> = Object.fromEntries(
  INTELLIGENCE_QUESTIONS.map((q) => [q.key, q]),
);

export function questionsForLayer(layer: IntelligenceLayerKey): IntelligenceQuestionDef[] {
  return INTELLIGENCE_QUESTIONS.filter((q) => q.layer === layer);
}

/** Relationship decides whether we address the user or their child — same rule as fields.ts. */
export function intelligenceQuestionFor(q: IntelligenceQuestionDef, forSelf: boolean): string {
  return forSelf ? q.question : q.questionForChild;
}

/**
 * Every question key the catalog knows. The write path validates against this
 * (never against whatever the request body claims), so an unknown key is
 * rejected rather than silently stored as a row nothing will ever read.
 */
export const INTELLIGENCE_KEYS: readonly string[] = INTELLIGENCE_QUESTIONS.map((q) => q.key);

/**
 * Questions whose answers feed the Soch/deep bucket as first-person evidence.
 * `PREFERENCE` questions are excluded on purpose: wanting the same thing in a
 * partner is not the same as *being* alike, and scoring it in both buckets
 * would count one answer twice.
 */
export const AGREEMENT_KEYS: readonly string[] = INTELLIGENCE_QUESTIONS.filter(
  (q) => q.compatibilityMode === "EXACT",
).map((q) => q.key);

/** Answers allowed to appear on a profile page or in an AI candidate dossier. */
export const PROFILE_VISIBLE_KEYS: readonly string[] = INTELLIGENCE_QUESTIONS.filter(
  (q) => q.visibility === "PROFILE_VISIBLE",
).map((q) => q.key);
