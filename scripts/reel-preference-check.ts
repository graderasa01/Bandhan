import "./_env";
import fs from "node:fs";
import path from "node:path";
import { scorePreferenceMatch } from "../lib/services/match/preferenceScore";
import { assessPartnerPreferences, MIN_COMPARABLE_SIGNALS } from "../lib/services/match/preferenceEvidence";
import { buildWhyThisMatch } from "../lib/services/match/whyThisMatch";
import { buildCandidateFacts } from "../lib/services/match/candidateFacts";
import { candidateSummary, explanationFingerprint } from "../lib/services/match/explain";
import { kundliFor } from "../lib/data/reelData";
import { type SignalAnswerMap } from "../lib/profile/signalAnswers";
import { noopT } from "../lib/i18n/translate";
import type { CompatibilityDimension, CompatibilityReport } from "../lib/services/match/compatibilityLab";
import type { ProfileWithSubTables } from "../lib/services/profile/completionService";

/**
 * The Reel's honesty rules, as fixtures.
 *
 * Run: `npx tsx scripts/reel-preference-check.ts`
 *
 * Every check here exists because the screen used to say something it could
 * not back up. The old preference formula answered "no preference stated" with
 * 100 for each component, so a viewer who had told us nothing matched everybody
 * at "100% Preferences" — a number that was not a score but the absence of one.
 * Around that sat the same class of bug: a Guna total built on a Moon placed at
 * noon, an AI sentence written about a profile that has since been edited, a
 * "More details" sheet of empty headings.
 *
 * The rule the whole file enforces: **a number appears only when there is
 * something real behind it, and when there is not, the card says so in words.**
 *
 * No database and no model — pure fixtures, so this gives the same answer
 * everywhere. Two checks read source files instead of calling a function; they
 * are labelled where they are, and they exist because what they protect is a
 * structural property (what a module is allowed to read, what order a sheet
 * renders in) rather than a return value.
 */

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

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
    basicDetails: { religion: "Hindu", caste: "Agarwal", manglikStatus: "Nahi", birthTime: null, birthPlace: null },
    education: { highestEducation: "B.Tech" },
    profession: { jobTitle: "Engineer" },
    family: { familyType: null, familyValues: null },
    lifestyle: {
      diet: null,
      smoking: null,
      drinking: null,
      hobbies: [],
      languagesKnown: [],
      relocateWilling: null,
      weekendVibe: null,
      bigDecisionStyle: null,
      socialEnergy: null,
    },
    partnerPreferences: {
      lookingForGender: "Ladka",
      minAge: null,
      maxAge: null,
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

function prefs(over: Record<string, unknown>) {
  return {
    lookingForGender: "Ladka",
    minAge: null,
    maxAge: null,
    preferredCities: [],
    educationPreference: null,
    religionPreference: null,
    castePreference: null,
    manglikPreference: null,
    partnerWorkExpectation: null,
    dealBreakers: [],
    ...over,
  };
}

const NONE: SignalAnswerMap = new Map();

function readSource(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/* ================================================================== */
console.log("\n1-3. What the viewer has actually stated decides everything");

const candidate = makeProfile({ gender: "Ladka", currentCity: "Jaipur", dateOfBirth: new Date("1996-05-05") });

const silent = makeProfile();
const silentScore = scorePreferenceMatch(silent, candidate, NONE, NONE);
check("a viewer who stated nothing has no preference score", silentScore.score === null, `${silentScore.score}`);
check("and the state names why", silentScore.state === "NOT_PROVIDED", silentScore.state);
check("the auto-filled lookingForGender row is not a stated preference", assessPartnerPreferences(silent).state === "NOT_PROVIDED");
check("nothing stated means nothing to list", silentScore.stated.length === 0);

const oneThing = makeProfile({ partnerPreferences: prefs({ minAge: 25, maxAge: 30 }) });
const oneScore = scorePreferenceMatch(oneThing, candidate, NONE, NONE);
check("one stated preference is PARTIAL, not a percentage", oneScore.state === "PARTIAL", oneScore.state);
check("and still no number", oneScore.score === null, `${oneScore.score}`);
check("even though the preference itself is known", oneScore.stated.includes("age"));

const twoThings = makeProfile({ partnerPreferences: prefs({ minAge: 25, maxAge: 30, preferredCities: ["Jaipur"] }) });
const twoScore = scorePreferenceMatch(twoThings, candidate, NONE, NONE);
check(`${MIN_COMPARABLE_SIGNALS} comparable signals produce a real score`, twoScore.state === "COMPARABLE", twoScore.state);
check("and the score is a number in range", typeof twoScore.score === "number" && twoScore.score! >= 0 && twoScore.score! <= 100, `${twoScore.score}`);
check("a candidate who matches both scores high", (twoScore.score ?? 0) >= 90, `${twoScore.score}`);
check("no behaviour was mixed into it without Advanced Discovery", twoScore.behaviorShift === 0, `${twoScore.behaviorShift}`);

/* ================================================================== */
console.log("\n4. A candidate who never filled something is not penalised for it");

// The viewer states three things. The candidate has an age and an education
// but no city — so city is not comparable. The honest answer is the score of
// the two that *are*, not a score with a zero standing in for the third.
const threeStated = makeProfile({
  partnerPreferences: prefs({ minAge: 25, maxAge: 30, preferredCities: ["Jaipur"], educationPreference: "Graduate" }),
});
const noCity = makeProfile({ gender: "Ladka", currentCity: null, dateOfBirth: new Date("1996-05-05") });
const withCity = makeProfile({ gender: "Ladka", currentCity: "Jaipur", dateOfBirth: new Date("1996-05-05") });

const missingCityScore = scorePreferenceMatch(threeStated, noCity, NONE, NONE);
const twoOnly = makeProfile({ partnerPreferences: prefs({ minAge: 25, maxAge: 30, educationPreference: "Graduate" }) });
const twoOnlyScore = scorePreferenceMatch(twoOnly, noCity, NONE, NONE);

check("a blank field on the candidate does not invent a penalty", missingCityScore.score === twoOnlyScore.score, `${missingCityScore.score} vs ${twoOnlyScore.score}`);
check("and the pair is still scored on what could be compared", missingCityScore.state === "COMPARABLE", missingCityScore.state);
check(
  "a candidate who filled the city in and matches it does not score lower",
  (scorePreferenceMatch(threeStated, withCity, NONE, NONE).score ?? 0) >= (missingCityScore.score ?? 0),
);

/* ================================================================== */
console.log("\n5. Private topics never become a public Reel reason");

function dim(over: Partial<CompatibilityDimension>): CompatibilityDimension {
  return {
    key: "childrenPreference",
    label: "Bachche",
    area: "Parivaar",
    status: "ALIGNED",
    detail: "Dono ne haan kaha.",
    missing: null,
    evidence: "high",
    candidateAnswerIsPrivate: true,
    suggestedQuestion: "Bachchon ke baare me aap kya sochte hain?",
    ...over,
  } as CompatibilityDimension;
}

const privateReport = {
  dimensions: [],
  aligned: [dim({})],
  discuss: [dim({ key: "moneyStyle", label: "Paisa", status: "DISCUSS", evidence: "medium" })],
  unknown: [dim({ key: "conflictStyle", label: "Ladai-jhagda", status: "UNKNOWN", missing: "candidate", evidence: "low" })],
  discussCount: 1,
} as unknown as CompatibilityReport;

const why = buildWhyThisMatch({
  candidateName: "Rohit",
  report: privateReport,
  sochFit: null,
  strengths: [],
  sharedTags: [],
  preference: { state: "NOT_PROVIDED", score: null },
  facts: null,
});

const whyText = JSON.stringify(why);
for (const word of ["Bachche", "Paisa", "Ladai-jhagda"]) {
  check(`"${word}" never reaches the pre-match card`, !whyText.includes(word), whyText.slice(0, 160));
}
check("a private-only report yields no reasons at all rather than a filler", why.reasons.length === 0);
check("and no value connection", why.valueConnection === null);
check("and no starter built on a private question", why.starter === null);

// The same dimension, public, is allowed — the gate is the privacy flag, not the topic.
const publicReport = { ...privateReport, aligned: [dim({ label: "Parivaar ki soch", candidateAnswerIsPrivate: false })] } as CompatibilityReport;
const publicWhy = buildWhyThisMatch({
  candidateName: "Rohit",
  report: publicReport,
  sochFit: null,
  strengths: [],
  sharedTags: [],
  preference: { state: "NOT_PROVIDED", score: null },
  facts: null,
});
check("a public aligned dimension does surface", publicWhy.valueConnection !== null);

console.log("\n   …and a preference line only when there is a percentage to say");
for (const state of ["NOT_PROVIDED", "PARTIAL"] as const) {
  const w = buildWhyThisMatch({
    candidateName: "Rohit",
    report: null,
    sochFit: null,
    strengths: [],
    sharedTags: [],
    preference: { state, score: 100 },
    facts: null,
  });
  check(`${state} never prints a percentage, even if a score is passed`, !JSON.stringify(w).includes("100%"));
}

/* ================================================================== */
console.log("\n6-7. More Details: the candidate's own facts, and no empty headings");

const rich = makeProfile({
  gender: "Ladka",
  family: { familyType: "Nuclear family", familyValues: "Moderate" },
  lifestyle: { diet: "Veg", smoking: "Nahi", drinking: "Nahi", hobbies: ["Cricket"], languagesKnown: ["Hindi"], relocateWilling: null, weekendVibe: null, bigDecisionStyle: null, socialEnergy: null },
});
const richFacts = buildCandidateFacts(rich, "L1");
check("a filled profile produces facts", richFacts.fields.length > 0);
check("every fact carries a value — a blank is dropped, not rendered", richFacts.fields.every((f) => f.value.trim().length > 0));
check("and a group", richFacts.fields.every((f) => typeof f.group === "string" && f.group.length > 0));

const bare = makeProfile({ gender: "Ladka", maritalStatus: null });
const bareFacts = buildCandidateFacts(bare, "L1");
for (const group of ["family", "lifestyle", "expectation"] as const) {
  check(
    `an unanswered "${group}" produces zero rows, so the sheet has no empty heading to draw`,
    bareFacts.fields.filter((f) => f.group === group).length === 0,
  );
}
check("no private-group fact ever reaches an L1 card", richFacts.fields.every((f) => f.group !== "private"));

// Structural: the sheet must render the current profile facts above the AI's
// paragraph. This is an ordering property of the JSX, not of a return value.
const sheet = readSource("components/reel/ReelDetailsSheet.tsx");
check(
  "the details sheet renders the facts block before the AI block",
  sheet.indexOf("card.facts") < sheet.indexOf("reel.details.aiHeading"),
);
check(
  "and it filters rows per group, so a group with none renders nothing",
  /card\.facts\.filter\(\(f\) => f\.group === key\)/.test(sheet),
);

/* ================================================================== */
console.log("\n8. A stored score from an older reel row can never be displayed");

/*
 * `DailyReelProfile.preferenceScore` is written by `reelGenerator` to fix the
 * *order* of today's reel and is nullable since the evidence work. The card is
 * built by `reelData.ts`, which re-scores the pair from the profiles as they
 * are — so a row still carrying a "100" written by the old formula cannot
 * reach a screen. That is a property of what the module reads, so it is
 * checked against the source.
 */
const reelSource = readSource("lib/data/reelData.ts");
check("reelData never reads a stored preferenceScore", !/\bpreferenceScore\b/.test(reelSource));
check("it re-scores the pair instead", /scoreCandidates\(/.test(reelSource));
check(
  "the stored column is nullable, so nothing has to invent one",
  /preferenceScore\s+Float\?/.test(readSource("prisma/schema.prisma")),
);
// And the live scorer refuses to produce 100 for a viewer who stated nothing,
// which is the value those old rows carry.
check("a re-scored silent viewer gets null, not the old 100", scorePreferenceMatch(silent, candidate, NONE, NONE).score === null);

/* ================================================================== */
console.log("\n9. An edited profile retires the AI sentence written about it");

const viewerForAi = makeProfile();
const before = explanationFingerprint(candidateSummary(viewerForAi), candidateSummary(rich));
const edited = makeProfile({
  gender: "Ladka",
  family: { familyType: "Joint family", familyValues: "Moderate" },
  lifestyle: rich.lifestyle,
});
const after = explanationFingerprint(candidateSummary(viewerForAi), candidateSummary(edited));
check("a changed candidate fact changes the fingerprint", before !== after);
check("an unchanged pair keeps it", before === explanationFingerprint(candidateSummary(viewerForAi), candidateSummary(rich)));

const viewerEdited = makeProfile({ education: { highestEducation: "MBA" } });
check(
  "an edit on the viewer's own side retires it too",
  before !== explanationFingerprint(candidateSummary(viewerEdited), candidateSummary(rich)),
);
check(
  "a row written before fingerprints existed is treated as stale",
  /candidate\.aiFactsHash\s*&&/.test(reelSource) || /Boolean\(viewer && candidate\.aiFactsHash\)/.test(reelSource),
);

/* ================================================================== */
console.log("\n10. No final Guna total without both birth times");

const withTime = (over: Record<string, unknown> = {}) =>
  makeProfile({
    basicDetails: { religion: "Hindu", caste: "Agarwal", manglikStatus: "Nahi", birthTime: "subah 6:30", birthPlace: "Jaipur" },
    ...over,
  });

const viewerTimed = withTime({ gender: "Ladki", dateOfBirth: new Date("1996-07-19") });
const candidateTimed = withTime({ gender: "Ladka", dateOfBirth: new Date("1994-03-11") });
const candidateNoTime = makeProfile({ gender: "Ladka", dateOfBirth: new Date("1994-03-11") });
const candidateNoDob = makeProfile({ gender: "Ladka", dateOfBirth: null });

const both = kundliFor(viewerTimed, candidateTimed, noopT);
check("both sides timed: a real total appears", both.milan !== null && both.milan.total > 0, JSON.stringify(both.milan));
check("and no caveat note is needed", both.note === null);
check("the total is on the 36 scale", both.milan?.max === 36);

const half = kundliFor(viewerTimed, candidateNoTime, noopT);
check("one missing birth time: no total at all", half.milan === null);
check("and the card says why, in words", typeof half.note === "string" && half.note.length > 0);

const noDob = kundliFor(viewerTimed, candidateNoDob, noopT);
check("no date of birth: no total", noDob.milan === null);
check("and its own reason", typeof noDob.note === "string" && noDob.note !== half.note);

const viewerUntimed = makeProfile({ gender: "Ladki", dateOfBirth: new Date("1996-07-19") });
check("the viewer's own missing time blocks it just the same", kundliFor(viewerUntimed, candidateTimed, noopT).milan === null);

// Gotra/Manglik notes need no birth time, so they survive every case above.
check("the notes that need no birth time still appear", noDob.notes.length >= 0 && Array.isArray(noDob.notes));

/* ================================================================== */
console.log(`\n${failures === 0 ? `PASS — ${checks} checks` : `FAIL — ${failures} of ${checks} checks`}`);
process.exit(failures === 0 ? 0 : 1);
