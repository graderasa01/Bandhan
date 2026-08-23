/**
 * Marriage Intelligence — the checks that would otherwise only be caught in
 * production.
 *
 * Run: `npx tsx scripts/intelligence-check.ts`
 *
 * Deliberately DB-free. Everything below exercises the pure paths (catalog,
 * coverage, visibility, evidence weighting, ranking) with synthetic profiles,
 * so it runs anywhere and gives the same answer every time. The persistence
 * side is verified against the real app, not mocked here.
 *
 * The check that matters most is REGRESSION: a profile with zero intelligence
 * answers must score bit-for-bit what it scored before any of this existed.
 */

import {
  INTELLIGENCE_LAYERS,
  INTELLIGENCE_QUESTIONS,
  INTELLIGENCE_QUESTION_BY_KEY,
  IMPORTANCE_MULTIPLIER,
  importanceKeyFor,
  LAYER_SLUG,
  layerFromSlug,
  AGREEMENT_KEYS,
  DEAL_BREAKER_OPTIONS,
} from "../lib/profile/intelligenceQuestions";
import {
  applicableQuestions,
  computeIntelligenceProgress,
  derivedSignals,
  effectiveSignals,
  evidenceWeightFor,
  makeLookup,
  profileVisibleAnswers,
  rowsToSignalMap,
  type SignalAnswerMap,
} from "../lib/profile/signalAnswers";
import { scorePreferenceMatch } from "../lib/services/match/preferenceScore";
import { computeSochFit } from "../lib/services/match/sochFit";
import { PROFILE_FIELDS } from "../lib/profile/fields";
import type { ProfileWithSubTables } from "../lib/services/profile/completionService";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* Synthetic profiles                                                  */
/* ------------------------------------------------------------------ */

let seq = 0;
function makeProfile(overrides: Record<string, unknown> = {}): ProfileWithSubTables {
  seq++;
  const base = {
    id: `p${seq}`,
    userId: `u${seq}`,
    displayName: `Person ${seq}`,
    gender: "Ladki",
    dateOfBirth: new Date("1998-01-01"),
    maritalStatus: "Never Married",
    heightCm: 160,
    currentCity: "Jaipur",
    trustScore: 60,
    updatedAt: new Date(),
    boostActiveUntil: null,
    marriageTimeline: null,
    respondentType: "SELF",
    basicDetails: { religion: "Hindu", caste: "Agarwal", manglikStatus: "Nahi" },
    education: { highestEducation: "B.Tech" },
    profession: { jobTitle: "Engineer" },
    family: { familyType: "Nuclear family", familyValues: null },
    lifestyle: {
      diet: "Veg",
      smoking: "Nahi",
      drinking: "Nahi",
      hobbies: [],
      languagesKnown: [],
      relocateWilling: null,
      weekendVibe: null,
      bigDecisionStyle: null,
      socialEnergy: null,
    },
    partnerPreferences: {
      lookingForGender: "Ladka",
      minAge: 25,
      maxAge: 30,
      preferredCities: [],
      educationPreference: null,
      religionPreference: null,
      castePreference: null,
      manglikPreference: null,
      partnerWorkExpectation: null,
      dealBreakers: [],
    },
    photos: [],
  };
  return { ...base, ...overrides } as unknown as ProfileWithSubTables;
}

function answerMap(entries: Record<string, string | string[]>, confirmed = true): SignalAnswerMap {
  return rowsToSignalMap(
    Object.entries(entries).map(([key, value]) => ({
      key,
      answerJson: value,
      source: "USER_ENTERED" as const,
      respondentType: "SELF" as const,
      confirmed,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* 1. Catalog integrity                                                */
/* ------------------------------------------------------------------ */

section("Catalog");

const keys = INTELLIGENCE_QUESTIONS.map((q) => q.key);
check("question keys are unique", new Set(keys).size === keys.length);
check("every layer has at least one question", INTELLIGENCE_LAYERS.every((l) => INTELLIGENCE_QUESTIONS.some((q) => q.layer === l.key)));
check("every question has 2+ options", INTELLIGENCE_QUESTIONS.every((q) => q.options.length >= 2));
check(
  "no option list has duplicates",
  INTELLIGENCE_QUESTIONS.every((q) => new Set(q.options).size === q.options.length),
);
check(
  "every question belongs to a declared layer",
  INTELLIGENCE_QUESTIONS.every((q) => INTELLIGENCE_LAYERS.some((l) => l.key === q.layer)),
);
check("slugs round-trip", INTELLIGENCE_LAYERS.every((l) => layerFromSlug(LAYER_SLUG[l.key]) === l.key));

const profileFieldKeys = new Set(PROFILE_FIELDS.map((f) => f.key));
const branchProblems = INTELLIGENCE_QUESTIONS.filter((q) => {
  if (!q.branchOn) return false;
  return !INTELLIGENCE_QUESTION_BY_KEY[q.branchOn.key] && !profileFieldKeys.has(q.branchOn.key);
});
check(
  "every branch condition points at a real key",
  branchProblems.length === 0,
  branchProblems.map((q) => `${q.key} -> ${q.branchOn!.key}`).join(", "),
);

const derivedProblems = INTELLIGENCE_QUESTIONS.filter((q) => {
  if (!q.derivedFrom) return false;
  if (q.derivedFrom.field === "marriageTimelineEnum") return false;
  return !profileFieldKeys.has(q.derivedFrom.field);
});
check("derivedFrom fields exist in the profile catalog", derivedProblems.length === 0);

const derivedValueProblems = INTELLIGENCE_QUESTIONS.filter(
  (q) => q.derivedFrom && Object.values(q.derivedFrom.map).some((v) => !q.options.includes(v)),
);
check("derivedFrom maps only produce real options", derivedValueProblems.length === 0);

const writeBackProblems = INTELLIGENCE_QUESTIONS.filter((q) => {
  if (!q.writeBack) return false;
  const field = PROFILE_FIELDS.find((f) => f.key === q.writeBack!.field);
  if (!field?.options) return true;
  return Object.values(q.writeBack.map).some((v) => !field.options!.includes(v));
});
check("writeBack maps only produce real profile-field options", writeBackProblems.length === 0);

check(
  "deal-breaker codes are the dealBreakerCodes option list",
  INTELLIGENCE_QUESTION_BY_KEY.dealBreakerCodes.options.join(",") ===
    DEAL_BREAKER_OPTIONS.map((o) => o.code).join(","),
);
check(
  "no PREFERENCE question feeds the agreement bucket",
  AGREEMENT_KEYS.every((k) => INTELLIGENCE_QUESTION_BY_KEY[k].compatibilityMode === "EXACT"),
);
check(
  "importance questions all use the same three options",
  Object.keys(IMPORTANCE_MULTIPLIER).every((opt) =>
    INTELLIGENCE_QUESTIONS.filter((q) => q.key.startsWith("importance:")).every((q) => q.options.includes(opt)),
  ),
);

/* ------------------------------------------------------------------ */
/* 2. Coverage, branching, reuse of old answers                        */
/* ------------------------------------------------------------------ */

section("Coverage");

const emptyProgress = computeIntelligenceProgress(new Map(), {});
check("a fresh profile understands zero areas", emptyProgress.completedLayers === 0);
check("a fresh profile still has a next layer", emptyProgress.nextLayer !== null);
check("a fresh profile has a next question", emptyProgress.nextQuestionKey !== null);
check("coverage is never expressed as completion", emptyProgress.totalQuestions > 0 && emptyProgress.answeredQuestions === 0);

const legacyProfile = makeProfile({
  marriageTimeline: "WITHIN_3_MONTHS",
  family: { familyType: "Joint family", familyValues: "Traditional" },
  lifestyle: { ...makeProfile().lifestyle, relocateWilling: "Nahi" },
  partnerPreferences: { ...makeProfile().partnerPreferences, partnerWorkExpectation: "Unki marzi" },
});
const legacyAnswers = derivedSignals({
  marriageTimelineEnum: "WITHIN_3_MONTHS",
  relocateWilling: "Nahi",
  partnerWorkExpectation: "Unki marzi",
  familyValues: "Traditional",
});
check("old profile fields answer 4 layer questions without re-asking", legacyAnswers.size === 4);
check("marriageTimeline maps from the Circle enum", legacyAnswers.get("marriageTimeline")?.value === "0–3 months");
check("familyValues upgrades to the richer option", legacyAnswers.get("traditionModernBalance")?.value === "Mostly traditional");
check(
  'relocateWilling "Haan" is deliberately NOT derived',
  derivedSignals({ relocateWilling: "Haan" }).has("relocationBoundary") === false,
);

const legacyProgress = computeIntelligenceProgress(legacyAnswers, {});
check("derived answers count toward coverage", legacyProgress.answeredQuestions === 4);

// Branching: children follow-ups only exist once children are answered.
const noChildren = computeIntelligenceProgress(answerMap({ childrenPreference: "No" }), {});
const childrenLayerNo = noChildren.layers.find((l) => l.key === "CHILDREN")!;
check('answering "No" to children hides the follow-ups', childrenLayerNo.total === 1);
check('"No children" completes the layer on its own', childrenLayerNo.complete);

const wantsChildren = computeIntelligenceProgress(answerMap({ childrenPreference: "Definitely yes" }), {});
const childrenLayerYes = wantsChildren.layers.find((l) => l.key === "CHILDREN")!;
check('answering "yes" reveals the follow-ups', childrenLayerYes.total === 4);
check("the layer is not complete until its required follow-ups are answered", !childrenLayerYes.complete);

// Importance questions only appear for preferences the user actually set.
const noPrefs = computeIntelligenceProgress(new Map(), {});
const withCaste = computeIntelligenceProgress(new Map(), { partnerCastePreference: "Agarwal" });
const casteKey = importanceKeyFor("caste");
const noPrefsLayer = noPrefs.layers.find((l) => l.key === "PARTNER_PREFERENCES")!;
const withCasteLayer = withCaste.layers.find((l) => l.key === "PARTNER_PREFERENCES")!;
check("no caste preference means no caste-importance question", !noPrefsLayer.applicableKeys.includes(casteKey));
check("a real caste preference reveals its importance question", withCasteLayer.applicableKeys.includes(casteKey));
check(
  '"Koi farak nahi" does not count as a preference',
  !computeIntelligenceProgress(new Map(), { partnerCastePreference: "Koi farak nahi" }).layers
    .find((l) => l.key === "PARTNER_PREFERENCES")!
    .applicableKeys.includes(casteKey),
);

// An optional question left blank must never wedge a layer at "incomplete".
const lifestyleAnswers = answerMap({
  sleepRhythm: "Early morning person",
  fitnessImportance: "Occasionally",
  travelStyle: "Occasionally",
});
const lifestyleLayer = computeIntelligenceProgress(lifestyleAnswers, {}).layers.find((l) => l.key === "LIFESTYLE")!;
check("a skipped optional question still completes the layer", lifestyleLayer.complete);

/* ------------------------------------------------------------------ */
/* 3. Privacy                                                          */
/* ------------------------------------------------------------------ */

section("Privacy");

const mixed = answerMap({
  postMarriageLivingPlan: "Nuclear family", // PROFILE_VISIBLE
  moneyStyle: "Saver", // MATCH_PRIVATE
  childrenPreference: "Definitely yes", // MATCH_PRIVATE
  conflictFirstResponse: "Thoda space dunga/dungi", // MATCH_PRIVATE
  debtObligation: "Home loan", // PRIVATE
});
const visible = profileVisibleAnswers(mixed);
const visibleLabels = visible.map((v) => v.label);
check("a public answer is shown", visibleLabels.includes("Rehna kahan"));
check("money never reaches a public profile", !visible.some((v) => v.value === "Saver"));
check("children preference never reaches a public profile", !visible.some((v) => v.value === "Definitely yes"));
check("conflict style never reaches a public profile", !visible.some((v) => v.value.includes("space")));
check("PRIVATE answers never reach a public profile", !visible.some((v) => v.value === "Home loan"));
check(
  "every money/children/communication question is non-public",
  INTELLIGENCE_QUESTIONS.filter((q) => ["MONEY", "CHILDREN", "COMMUNICATION"].includes(q.layer)).every(
    (q) => q.visibility !== "PROFILE_VISIBLE",
  ),
);

/* ------------------------------------------------------------------ */
/* 4. Who answered                                                     */
/* ------------------------------------------------------------------ */

section("Respondent provenance");

const selfAnswer = answerMap({ moneyStyle: "Saver" }).get("moneyStyle")!;
const parentAnswer = answerMap({ moneyStyle: "Saver" }, false).get("moneyStyle")!;
check("a self-confirmed answer carries full evidence", evidenceWeightFor(selfAnswer) === 1);
check("an unconfirmed parent answer carries less", evidenceWeightFor(parentAnswer) < 1);
check("but it is still kept, not discarded", parentAnswer.value === "Saver");
check(
  "subjective questions are marked selfRequired",
  ["moneyStyle", "childrenPreference", "conflictFirstResponse", "relationshipReadiness"].every(
    (k) => INTELLIGENCE_QUESTION_BY_KEY[k].selfRequired === true,
  ),
);

/* ------------------------------------------------------------------ */
/* 5. Ranking — the no-regression guarantee                            */
/* ------------------------------------------------------------------ */

section("Ranking");

const viewer = makeProfile({ currentCity: "Jaipur" });
const candidate = makeProfile({ currentCity: "Jaipur", gender: "Ladka" });
const none: SignalAnswerMap = new Map();

function preference(v: ProfileWithSubTables, c: ProfileWithSubTables, vs = none, cs = none) {
  return scorePreferenceMatch(v, c, vs, cs);
}

// The old formula, longhand: city 100, education 100 (no preference), deal
// breakers 100 (none), religion/caste/manglik 100 (no preference) => 100.
const baseline = preference(viewer, candidate);
check("preference score is unchanged for a profile with zero answers", baseline === 100);
check(
  "empty signal maps change nothing",
  preference(viewer, candidate, new Map(), new Map()) === baseline,
);
check("no shared thinking data means no soch signal, not a zero", computeSochFit(viewer, candidate, {}) === null);

// A viewer with a city preference the candidate misses.
const pickyViewer = makeProfile({
  currentCity: "Jaipur",
  partnerPreferences: { ...makeProfile().partnerPreferences, preferredCities: ["Delhi NCR"] },
});
const pickyBase = preference(pickyViewer, candidate);
const expectedOld = Math.round(40 * 0.25 + 100 * 0.15 + 100 * 0.15 + 100 * 0.2 + 100 * 0.15 + 100 * 0.1);
check("city mismatch scores exactly the old formula", pickyBase === expectedOld, `${pickyBase} vs ${expectedOld}`);

const strict = preference(pickyViewer, candidate, answerMap({ [importanceKeyFor("city")]: "Must match" }));
check("`Must match` makes a mismatch cost more", strict < pickyBase);

const relaxed = preference(pickyViewer, candidate, answerMap({ [importanceKeyFor("city")]: "Flexible" }));
check("`Flexible` makes it cost less", relaxed > pickyBase);

// Children — the highest-stakes disagreement in the catalog.
const agree = preference(
  viewer,
  candidate,
  answerMap({ childrenPreference: "Definitely yes" }),
  answerMap({ childrenPreference: "Definitely yes" }),
);
const clash = preference(
  viewer,
  candidate,
  answerMap({ childrenPreference: "Definitely yes" }),
  answerMap({ childrenPreference: "No" }),
);
check("agreeing on children scores above clashing on it", agree > clash);

// One-sided answers are UNKNOWN, never a penalty.
const halfKnown = preference(viewer, candidate, answerMap({ childrenPreference: "Definitely yes" }), none);
check("a candidate who never answered is not penalised for it", halfKnown === baseline, `${halfKnown} vs ${baseline}`);

// Structured deal breakers bite where the keyword scan could not.
const drinker = makeProfile({
  gender: "Ladka",
  currentCity: "Jaipur",
  lifestyle: { ...makeProfile().lifestyle, drinking: "Haan" },
});
const drinkBase = preference(viewer, drinker);
const drinkClash = preference(viewer, drinker, answerMap({ dealBreakerCodes: ["NO_DRINKING"] }));
check("a drinking deal breaker is now enforced", drinkClash < drinkBase);
check(
  "the old free-text keyword path still works untouched",
  preference(
    makeProfile({
      currentCity: "Jaipur",
      partnerPreferences: { ...makeProfile().partnerPreferences, dealBreakers: ["Smoking bilkul nahi"] },
    }),
    makeProfile({ gender: "Ladka", currentCity: "Jaipur", lifestyle: { ...makeProfile().lifestyle, smoking: "Haan" } }),
  ) < 100,
);

// Soch fit: four agreeing life answers is a signal; two is noise.
const agreeingLife = {
  postMarriageLivingPlan: "Nuclear family",
  familyInvolvementLevel: "Moderate",
  personalSpace: "Balanced together + personal time",
  communicationFrequency: "Bahut important",
};
const disagreeingLife = {
  postMarriageLivingPlan: "Joint family",
  familyInvolvementLevel: "Mostly couple-led life",
  personalSpace: "Most things together karna pasand",
  communicationFrequency: "Quality matters more than frequency",
};

function soch(viewerAnswers: SignalAnswerMap, candidateAnswers: SignalAnswerMap) {
  return computeSochFit(viewer, candidate, {
    signalAnswers: new Map([
      [viewer.id, viewerAnswers],
      [candidate.id, candidateAnswers],
    ]),
  });
}

const sochScored = soch(answerMap(agreeingLife), answerMap(agreeingLife));
check("four matching life answers produce a soch signal", sochScored !== null);
check("and it reads as full agreement", sochScored?.score === 100);
check("the count is reportable to the user", (sochScored?.signalCommon ?? 0) === 4);

const sochClash = soch(answerMap(agreeingLife), answerMap(disagreeingLife));
check("four opposing answers score below four matching ones", (sochClash?.score ?? 100) === 0);

const thin = soch(
  answerMap({ postMarriageLivingPlan: "Nuclear family", personalSpace: "Depends" }),
  answerMap({ postMarriageLivingPlan: "Nuclear family", personalSpace: "Depends" }),
);
check("two shared answers stay below the evidence floor", thin === null);

// A parent-entered answer agrees just as often, but carries less evidence —
// so an AI dimension score is able to pull the blended number further.
const parentPair = soch(answerMap(agreeingLife), answerMap(agreeingLife, false));
check("a parent-answered pair still agrees", parentPair?.score === 100);
const dims = new Map([
  [viewer.id, { FAMILY_ORIENTATION: 10, CAREER_FOCUS: 10, ADAPTABILITY: 10 }],
  [candidate.id, { FAMILY_ORIENTATION: 90, CAREER_FOCUS: 90, ADAPTABILITY: 90 }],
]);
const selfBlend = computeSochFit(viewer, candidate, {
  dimensionScores: dims,
  signalAnswers: new Map([
    [viewer.id, answerMap(agreeingLife)],
    [candidate.id, answerMap(agreeingLife)],
  ]),
});
const parentBlend = computeSochFit(viewer, candidate, {
  dimensionScores: dims,
  signalAnswers: new Map([
    [viewer.id, answerMap(agreeingLife)],
    [candidate.id, answerMap(agreeingLife, false)],
  ]),
});
check(
  "a parent-entered answer set is trusted less than a self-confirmed one",
  (parentBlend?.score ?? 0) < (selfBlend?.score ?? 0),
  `${parentBlend?.score} vs ${selfBlend?.score}`,
);

// Derived answers still count, so old profiles are not left out.
const derivedViewer = makeProfile({ family: { familyType: "Nuclear family", familyValues: "Traditional" } });
check(
  "an old profile gets its derived answer without a DB row",
  effectiveSignals(derivedViewer, undefined).has("traditionModernBalance"),
);

void legacyProfile;
void makeLookup;
void applicableQuestions;

/* ------------------------------------------------------------------ */

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
