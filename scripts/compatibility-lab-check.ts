import {
  buildCompatibilityReport,
  formatCompatibilityReport,
  bandFor,
  type CompatibilityReport,
} from "../lib/services/match/compatibilityLab";
import { INTELLIGENCE_QUESTION_BY_KEY } from "../lib/profile/intelligenceQuestions";
import type { SignalAnswerMap, SignalAnswerView } from "../lib/profile/signalAnswers";
import type { ProfileWithSubTables } from "../lib/services/profile/completionService";

/**
 * Compatibility Lab, tested without a database.
 *
 * Run: `npx tsx scripts/compatibility-lab-check.ts`
 *
 * Pure like `intelligence-check.ts` and for the same reason: the thing under
 * test is a comparison, and a comparison that needs Postgres to be exercised is
 * a comparison nobody will exercise. The two properties that actually matter
 * here — and that a passing "it returns dimensions" test would miss entirely:
 *
 *   1. An unanswered question is UNKNOWN, never a low score. A user reading
 *      "60%" cannot tell whether to worry or to go answer three questions;
 *      keeping those apart is the whole reason this layer exists.
 *
 *   2. A candidate's MATCH_PRIVATE answer never appears in the output text.
 *      The comparison is *allowed* to read it — matching already does — and the
 *      line between "used it" and "said it" is one function, `describe`. This
 *      file walks the rendered string looking for the raw value, because that
 *      is the only test that would actually catch the leak.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal profile — only the fields the four modelled comparators actually read. */
function profile(currentCity: string): ProfileWithSubTables {
  return {
    id: `p-${currentCity}`,
    userId: `u-${currentCity}`,
    currentCity,
    lifestyle: null,
    partnerPreferences: null,
    basicDetails: null,
    family: null,
    education: null,
    respondentType: "SELF",
  } as unknown as ProfileWithSubTables;
}

function answers(entries: Record<string, string>, confirmed = true): SignalAnswerMap {
  const map: SignalAnswerMap = new Map();
  for (const [key, value] of Object.entries(entries)) {
    const q = INTELLIGENCE_QUESTION_BY_KEY[key];
    if (!q) throw new Error(`test uses a key that left the catalog: ${key}`);
    if (!q.options.includes(value)) {
      throw new Error(`test uses an option outside ${key}'s list: ${value}`);
    }
    map.set(key, {
      key,
      value,
      source: "USER_ENTERED",
      respondentType: "SELF",
      confirmed,
      visibility: q.visibility,
      derived: false,
    } satisfies SignalAnswerView);
  }
  return map;
}

const A = profile("Noida");
const B = profile("Bengaluru");

function dim(report: CompatibilityReport, key: string) {
  return report.dimensions.find((d) => d.key === key);
}

console.log("\nBanding follows the ranking's own numbers");

check("100 is strong alignment", bandFor(100) === "STRONG_ALIGNMENT");
check("90 is the seam", bandFor(90) === "STRONG_ALIGNMENT");
check("85 (one side flexible on living) is manageable", bandFor(85) === "DIFFERENT_BUT_MANAGEABLE");
check("70 (adjacent living, children gap 1) is manageable", bandFor(70) === "DIFFERENT_BUT_MANAGEABLE");
check("35 (children gap 2) is discuss", bandFor(35) === "DISCUSS");
check("25 (opposed living) is discuss", bandFor(25) === "DISCUSS");

console.log("\nUnknown is never a low score");

const noAnswers = buildCompatibilityReport(A, B, new Map(), new Map());
check("two blank profiles produce dimensions", noAnswers.dimensions.length > 0);
check(
  "and every one of them is UNKNOWN",
  noAnswers.dimensions.every((d) => d.status === "UNKNOWN"),
);
check("none of them is DISCUSS", noAnswers.discuss.length === 0);
check("coverage reports nothing known", noAnswers.coverage.known === 0);
check(
  "and each says both sides are missing",
  noAnswers.dimensions.every((d) => d.missing === "both"),
);

const onlyMine = buildCompatibilityReport(
  A,
  B,
  answers({ childrenPreference: "Definitely yes" }),
  new Map(),
);
check(
  "one-sided answer is UNKNOWN, not a mismatch",
  dim(onlyMine, "childrenPreference")?.status === "UNKNOWN",
  dim(onlyMine, "childrenPreference")?.status,
);
check(
  "and it names the candidate as the missing side",
  dim(onlyMine, "childrenPreference")?.missing === "candidate",
);
check(
  "a gap the candidate must close does offer a question",
  Boolean(dim(onlyMine, "childrenPreference")?.suggestedQuestion),
);

const onlyTheirs = buildCompatibilityReport(
  A,
  B,
  new Map(),
  answers({ childrenPreference: "Definitely yes" }),
);
check(
  "when the viewer is the one missing, no question is aimed at the candidate",
  dim(onlyTheirs, "childrenPreference")?.suggestedQuestion === null,
  "asking a stranger to fill a blank the user could fill themselves",
);

console.log("\nThe four modelled dimensions reuse the ranking's comparators");

const agree = buildCompatibilityReport(
  A,
  B,
  answers({ childrenPreference: "Definitely yes", postMarriageLivingPlan: "Nuclear family" }),
  answers({ childrenPreference: "Definitely yes", postMarriageLivingPlan: "Nuclear family" }),
);
check("identical answers align", dim(agree, "childrenPreference")?.status === "STRONG_ALIGNMENT");
check("living too", dim(agree, "postMarriageLivingPlan")?.status === "STRONG_ALIGNMENT");
check("evidence is high when both confirmed", dim(agree, "childrenPreference")?.evidence === "high");
check("an aligned dimension offers no question", dim(agree, "childrenPreference")?.suggestedQuestion === null);

const opposed = buildCompatibilityReport(
  A,
  B,
  answers({ postMarriageLivingPlan: "Joint family", childrenPreference: "Definitely yes" }),
  answers({ postMarriageLivingPlan: "Nuclear family", childrenPreference: "No" }),
);
check(
  "joint vs nuclear is DISCUSS",
  dim(opposed, "postMarriageLivingPlan")?.status === "DISCUSS",
  dim(opposed, "postMarriageLivingPlan")?.status,
);
check(
  "definitely-yes vs no children is DISCUSS",
  dim(opposed, "childrenPreference")?.status === "DISCUSS",
  dim(opposed, "childrenPreference")?.status,
);

const adjacent = buildCompatibilityReport(
  A,
  B,
  answers({ postMarriageLivingPlan: "Joint family" }),
  answers({ postMarriageLivingPlan: "Flexible" }),
);
check(
  "one side flexible is manageable, not a clash",
  dim(adjacent, "postMarriageLivingPlan")?.status === "DIFFERENT_BUT_MANAGEABLE",
  dim(adjacent, "postMarriageLivingPlan")?.status,
);

const nearGap = buildCompatibilityReport(
  A,
  B,
  answers({ childrenPreference: "Definitely yes" }),
  answers({ childrenPreference: "Probably yes" }),
);
check(
  "a one-step children gap is manageable",
  dim(nearGap, "childrenPreference")?.status === "DIFFERENT_BUT_MANAGEABLE",
  dim(nearGap, "childrenPreference")?.status,
);

console.log("\nA parent-entered answer weakens the evidence, not the comparison");

const parentSide = buildCompatibilityReport(
  A,
  B,
  answers({ childrenPreference: "Definitely yes" }),
  answers({ childrenPreference: "No" }, false),
);
check("the comparison still runs", dim(parentSide, "childrenPreference")?.status === "DISCUSS");
check(
  "but the evidence is downgraded",
  dim(parentSide, "childrenPreference")?.evidence === "medium",
  dim(parentSide, "childrenPreference")?.evidence,
);

console.log("\nPRIVACY — a private answer of theirs is never named");

/*
 * The test that matters. `childrenPreference`, `postMarriageLivingPlan`,
 * `conflictFirstResponse` and the money questions are all MATCH_PRIVATE, and
 * the comparison reads every one of them. What must never appear in the output
 * is the candidate's raw option text.
 */
const privateKeys = ["childrenPreference", "conflictFirstResponse", "moneyStyle", "financeModel"]
  .filter((k) => INTELLIGENCE_QUESTION_BY_KEY[k])
  .filter((k) => INTELLIGENCE_QUESTION_BY_KEY[k].visibility !== "PROFILE_VISIBLE");

check("the catalog still has MATCH_PRIVATE questions to protect", privateKeys.length > 0);

for (const key of privateKeys) {
  const q = INTELLIGENCE_QUESTION_BY_KEY[key];
  // Deliberately pick two *different* options so the sentence has something to
  // reveal, and a distinctive one for the candidate so the search is unambiguous.
  const mineOption = q.options[0];
  const theirOption = q.options[q.options.length - 1];
  if (mineOption === theirOption) continue;

  const report = buildCompatibilityReport(
    A,
    B,
    answers({ [key]: mineOption }),
    answers({ [key]: theirOption }),
  );
  const text = formatCompatibilityReport(report, "Priya");
  check(
    `${key}: the candidate's own answer never reaches the text`,
    !text.includes(theirOption),
    `leaked "${theirOption}"`,
  );
  check(
    `${key}: the dimension is flagged private for every downstream reader`,
    dim(report, key)?.candidateAnswerIsPrivate === true,
  );
}

console.log("\nA PROFILE_VISIBLE answer may be named — it is on their page anyway");

const visibleKey = Object.values(INTELLIGENCE_QUESTION_BY_KEY).find(
  (q) => q.visibility === "PROFILE_VISIBLE" && q.compatibilityMode === "EXACT" && !q.multi,
);
check("the catalog has a PROFILE_VISIBLE comparable question", Boolean(visibleKey));
if (visibleKey) {
  const report = buildCompatibilityReport(
    A,
    B,
    answers({ [visibleKey.key]: visibleKey.options[0] }),
    answers({ [visibleKey.key]: visibleKey.options[1] }),
  );
  const text = formatCompatibilityReport(report, "Priya");
  check(
    `${visibleKey.key}: a public answer is allowed into the sentence`,
    text.includes(visibleKey.options[1]),
    "if this fails the rule got stricter than the profile page, which is only confusing",
  );
}

console.log("\nThe block Grio reads");

const mixed = buildCompatibilityReport(
  A,
  B,
  answers({ postMarriageLivingPlan: "Joint family", childrenPreference: "Definitely yes" }),
  answers({ postMarriageLivingPlan: "Nuclear family", childrenPreference: "Definitely yes" }),
);
const block = formatCompatibilityReport(mixed, "Priya");
check("the honest half is stated first", block.indexOf("BAAT KARNE LAYAK") < block.indexOf("YE ACHHA MEL"));
check("unknowns are named as unknowns, not as faults", block.includes("ye zero nahi hai"));
check("and the code-owned framing survives", block.includes("CODE ne ki hai"));
check(
  "the private-answer rule is restated to the model",
  block.includes("Inka apna jawab kya tha, ye aap kabhi nahi bata sakte"),
);

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
process.exit(failures === 0 ? 0 : 1);
