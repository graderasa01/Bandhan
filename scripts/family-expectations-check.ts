import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  buildExpectationGaps,
  formatExpectationGaps,
  familyExpectationQuestions,
  isFamilyExpectationKey,
  familyPhrasingFor,
  type FamilyExpectationKey,
  FAMILY_EXPECTATION_KEYS,
  type FamilyAnswerInput,
} from "../lib/profile/expectationGaps";
import {
  getExpectationGapReport,
  getFamilyQuestionnaire,
  saveFamilyExpectation,
} from "../lib/services/family/familyExpectationService";
import { INTELLIGENCE_QUESTION_BY_KEY } from "../lib/profile/intelligenceQuestions";
import type { SignalAnswerMap, SignalAnswerView } from "../lib/profile/signalAnswers";
import { saveSignalAnswer } from "../lib/services/profile/intelligenceService";
import { saveDraft } from "../lib/services/profile/draftService";
import { inviteFamilyMember } from "../lib/services/family/familyService";

/**
 * Family expectation intelligence.
 *
 * Run: `npx tsx scripts/family-expectations-check.ts`
 *
 * Two halves. The pure half checks the comparison itself; the database half
 * checks the two things a pure test cannot see:
 *
 *   1. **A family answer never overwrites the user's.** `ProfileSignalAnswer`
 *      is unique on `(profileId, key)`, so storing a parent's view on that row
 *      would erase the disagreement in the act of recording it. This asserts
 *      both survive.
 *   2. **The family portal cannot read the owner's answers.** More than half of
 *      these questions are MATCH_PRIVATE, and a parent reading their adult
 *      child's private answers is a violation the child cannot easily refuse.
 *      The test walks the family-facing payload looking for the owner's values.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function selfAnswers(entries: Record<string, string>): SignalAnswerMap {
  const map: SignalAnswerMap = new Map();
  for (const [key, value] of Object.entries(entries)) {
    const q = INTELLIGENCE_QUESTION_BY_KEY[key];
    if (!q) throw new Error(`test uses a key that left the catalog: ${key}`);
    if (!q.options.includes(value)) throw new Error(`option outside ${key}: ${value}`);
    map.set(key, {
      key,
      value,
      source: "USER_ENTERED",
      respondentType: "SELF",
      confirmed: true,
      visibility: q.visibility,
      derived: false,
    } satisfies SignalAnswerView);
  }
  return map;
}

function fam(name: string, key: string, value: string, id = name): FamilyAnswerInput {
  return {
    familyMemberId: id,
    familyMemberName: name,
    relationLabel: "Parent (Papa/Mummy)",
    questionKey: key,
    value,
  };
}

let userId: string | null = null;

/**
 * An active family seat, without the cookie.
 *
 * `inviteFamilyMember` is the real write path and is used as such; only
 * `joinFamily` is bypassed, because it calls `cookies()` and there is no
 * request scope in a script. Flipping `status`/`boundAt` here reproduces
 * exactly what a real join leaves behind on the row.
 */
async function seatFamilyMember(
  ownerUserId: string,
  displayName: string,
  relation: "PARENT" | "SIBLING" | "GUARDIAN",
) {
  const invite = await inviteFamilyMember(ownerUserId, { displayName, relation });
  if (!invite.ok) throw new Error(`invite failed for ${displayName}: ${invite.message}`);
  return prisma.familyMember.update({
    where: { id: invite.member.id },
    data: { status: "ACTIVE", boundAt: new Date() },
  });
}

async function main() {
  console.log("\nThe question set is a subset of the real catalog");

  for (const key of FAMILY_EXPECTATION_KEYS) {
    check(`${key} exists in the Marriage Intelligence catalog`, Boolean(INTELLIGENCE_QUESTION_BY_KEY[key]));
  }
  check("and every one resolves to a question row", familyExpectationQuestions().length === FAMILY_EXPECTATION_KEYS.length);
  check("a key outside the set is rejected", !isFamilyExpectationKey("conflictFirstResponse"));

  /*
   * The phrasing test, which replaced a naive "no selfRequired questions" check.
   *
   * That check failed on `childrenPreference` and the failure was informative:
   * `selfRequired` guards *speaking on the candidate's behalf*, and a family
   * stating their own hope for grandchildren is not that. What actually keeps
   * the two apart is the wording — "aap kya chahte hain" is the family's view,
   * "wo kya sochte hain" is a report about somebody else. So the real invariant
   * is that no family question ever reuses the catalog's phrasings.
   */
  for (const q of familyExpectationQuestions()) {
    const asked = familyPhrasingFor(q.key as FamilyExpectationKey);
    check(`${q.key}: has its own family-facing wording`, asked !== q.question && asked !== q.questionForChild);
    check(
      `${q.key}: asks what the family wants, not what the candidate thinks`,
      !/\bwo\b|\bunhe\b|\bunki\b|\bunka\b/i.test(asked),
      asked,
    );
  }

  console.log("\nDifference is graded, not judged");

  const aligned = buildExpectationGaps(
    selfAnswers({ postMarriageLivingPlan: "Nuclear family" }),
    [fam("Papa", "postMarriageLivingPlan", "Nuclear family")],
  );
  check("same answer is ALIGNED", aligned.gaps.find((g) => g.key === "postMarriageLivingPlan")?.status === "ALIGNED");

  const opposed = buildExpectationGaps(
    selfAnswers({ postMarriageLivingPlan: "Nuclear family" }),
    [fam("Papa", "postMarriageLivingPlan", "Joint family")],
  );
  const livingGap = opposed.gaps.find((g) => g.key === "postMarriageLivingPlan");
  check("joint vs nuclear is NEEDS_DISCUSSION", livingGap?.status === "NEEDS_DISCUSSION", livingGap?.status);
  check("and it says so without calling anybody wrong", Boolean(livingGap?.detail && !/galat|red flag|problem/i.test(livingGap.detail)));

  const flexible = buildExpectationGaps(
    selfAnswers({ postMarriageLivingPlan: "Nuclear family" }),
    [fam("Papa", "postMarriageLivingPlan", "Flexible")],
  );
  check(
    "a flexible family is DIFFERENT, not a clash",
    flexible.gaps.find((g) => g.key === "postMarriageLivingPlan")?.status === "DIFFERENT",
  );

  // No severity model exists for tradition/modern, so a difference stops at
  // DIFFERENT. Promoting it would be a judgement nothing here has earned.
  const tradition = buildExpectationGaps(
    selfAnswers({ traditionModernBalance: "Mostly modern" }),
    [fam("Papa", "traditionModernBalance", "Mostly traditional")],
  );
  check(
    "an unmodelled difference never becomes NEEDS_DISCUSSION",
    tradition.gaps.find((g) => g.key === "traditionModernBalance")?.status === "DIFFERENT",
    tradition.gaps.find((g) => g.key === "traditionModernBalance")?.status,
  );

  console.log("\nTwo family members can disagree with each other");

  const split = buildExpectationGaps(selfAnswers({ postMarriageLivingPlan: "Nuclear family" }), [
    fam("Papa", "postMarriageLivingPlan", "Nuclear family", "m1"),
    fam("Mummy", "postMarriageLivingPlan", "Joint family", "m2"),
  ]);
  const splitGap = split.gaps.find((g) => g.key === "postMarriageLivingPlan");
  check("the harder disagreement decides the row", splitGap?.status === "NEEDS_DISCUSSION", splitGap?.status);
  check("but both answers are carried", splitGap?.familyAnswers.length === 2);
  check("and both names reach the sentence", Boolean(splitGap?.detail.includes("Papa") && splitGap.detail.includes("Mummy")));
  check("both are counted as respondents", split.respondents.length === 2);

  console.log("\nUnanswered is never agreement");

  const silent = buildExpectationGaps(selfAnswers({ childrenPreference: "Definitely yes" }), []);
  check("no family answer produces no report block", formatExpectationGaps(silent) === null);
  check(
    "and every question is UNKNOWN rather than aligned",
    silent.gaps.every((g) => g.status === "UNKNOWN") && silent.aligned.length === 0,
  );
  check(
    "the missing side is named as the family",
    silent.gaps.find((g) => g.key === "childrenPreference")?.missing === "family",
  );

  const onlyFamily = buildExpectationGaps(new Map(), [fam("Papa", "childrenPreference", "Definitely yes")]);
  check(
    "a family answer with no self answer is UNKNOWN, not a match",
    onlyFamily.gaps.find((g) => g.key === "childrenPreference")?.status === "UNKNOWN",
  );
  check(
    "and names the user as the missing side",
    onlyFamily.gaps.find((g) => g.key === "childrenPreference")?.missing === "self",
  );

  console.log("\nThe block Grio reads");

  const block = formatExpectationGaps(split)!;
  check("it names who answered", block.includes("Papa") && block.includes("Mummy"));
  check("it forbids taking a side", block.includes("Kaun sahi hai ye faisla"));
  check("it says difference is not bad", block.includes("Farak hona bura nahi hai"));
  check(
    "it forbids telling the family what the user answered",
    block.includes("user ka apna jawab unhe kabhi nahi dikhta"),
  );
  check("an un-asked question is not called a difference", block.includes("use farak mat kahiye"));

  /* ---------------------------------------------------------------- */
  /* Database half                                                     */
  /* ---------------------------------------------------------------- */

  const user = await prisma.user.create({
    data: {
      fullName: "Family Expectations Check",
      email: `famexp+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      status: "INCOMPLETE",
    },
  });
  userId = user.id;

  try {
    console.log("\nA family answer never overwrites the user's");

    await saveDraft(user.id, { currentCity: "Noida" });
    await saveSignalAnswer(user.id, "postMarriageLivingPlan", "Nuclear family");
    await saveSignalAnswer(user.id, "childrenPreference", "Definitely yes");

    // `joinFamily` sets a cookie, so it cannot run outside a request scope.
    // The seat is activated directly instead — everything under test takes a
    // `FamilyMember` row, so this exercises the real service functions and skips
    // only the session-binding step, which is not what this file is checking.
    const papa = await seatFamilyMember(user.id, "Papa", "PARENT");

    const saved = await saveFamilyExpectation(papa, "postMarriageLivingPlan", "Joint family");
    check("the family answer saves", saved.ok);

    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const ownRow = await prisma.profileSignalAnswer.findUnique({
      where: { profileId_key: { profileId: profile.id, key: "postMarriageLivingPlan" } },
    });
    check(
      "the user's own answer is untouched",
      ownRow?.answerJson === "Nuclear family",
      String(ownRow?.answerJson),
    );
    check(
      "and the family answer lives in its own table",
      (await prisma.familyExpectationAnswer.count({ where: { ownerUserId: user.id } })) === 1,
    );

    const report = (await getExpectationGapReport(user.id))!;
    const gap = report.gaps.find((g) => g.key === "postMarriageLivingPlan");
    check("the gap surfaces end to end", gap?.status === "NEEDS_DISCUSSION", gap?.status);
    check("with the user's own answer intact", gap?.selfAnswer === "Nuclear family");
    check("and the family's beside it", gap?.familyAnswers[0]?.value === "Joint family");

    console.log("\nPRIVACY — the family cannot read the owner's answers");

    const questionnaire = await getFamilyQuestionnaire(papa);

    check(
      "the family sees their own answer",
      questionnaire.find((q) => q.key === "postMarriageLivingPlan")?.answer[0] === "Joint family",
    );

    /*
     * The owner answered `childrenPreference: "Definitely yes"` — a
     * MATCH_PRIVATE question — and Papa has not answered it at all.
     *
     * A naive `!JSON.stringify(payload).includes("Definitely yes")` fails here,
     * and the failure is instructive rather than a bug: that string is one of
     * the question's own *options*, which the family must see in order to
     * choose. What must be empty is the `answer` field, because that is the only
     * place an answer is carried.
     */
    const childrenRow = questionnaire.find((q) => q.key === "childrenPreference");
    check("the private question is still offered to the family", Boolean(childrenRow));
    check(
      "but carries no answer, because the family has not given one",
      childrenRow?.answer.length === 0,
      `leaked: ${childrenRow?.answer.join(", ")}`,
    );
    check(
      "the owner's value appears only as a selectable option, never as an answer",
      childrenRow?.options.includes("Definitely yes") === true && childrenRow.answer.length === 0,
    );
    check(
      "and across the whole payload, the only answers are this member's own",
      questionnaire.filter((q) => q.answer.length > 0).every((q) => q.key === "postMarriageLivingPlan"),
      questionnaire.filter((q) => q.answer.length > 0).map((q) => q.key).join(", "),
    );

    // The one phrasing that must never reach a family member: the catalog's
    // parent-fills-the-profile wording, which asks them to report their child's
    // view rather than state their own.
    const askedLiving = questionnaire.find((q) => q.key === "postMarriageLivingPlan")?.question;
    check(
      "the family is asked what they want, not what the candidate thinks",
      askedLiving !== INTELLIGENCE_QUESTION_BY_KEY.postMarriageLivingPlan.questionForChild &&
        askedLiving !== INTELLIGENCE_QUESTION_BY_KEY.postMarriageLivingPlan.question,
      askedLiving,
    );

    console.log("\nWrite path is validated and role-gated");

    check(
      "an option outside the list is refused",
      !(await saveFamilyExpectation(papa, "postMarriageLivingPlan", "Kuch aur")).ok,
    );
    check(
      "a question outside the family set is refused",
      !(await saveFamilyExpectation(papa, "conflictFirstResponse", "Thoda space dunga/dungi")).ok,
      "a subjective question must never be answerable by family",
    );

    /*
     * The default plan allows one family seat, so a second invite is refused
     * before the guardian rule can be reached. Papa's own row is flipped to
     * GUARDIAN instead — `saveFamilyExpectation` reads `member.relation` off
     * the row it is handed, so this exercises the real check on a real row
     * rather than a fabricated one, and the relation is put back afterwards.
     */
    const asGuardian = await prisma.familyMember.update({
      where: { id: papa.id },
      data: { relation: "GUARDIAN" },
    });
    const refused = await saveFamilyExpectation(asGuardian, "childrenPreference", "Definitely yes");
    check("a guardian cannot state expectations", !refused.ok && refused.error === "FORBIDDEN");
    check(
      "and nothing was written for them",
      (await prisma.familyExpectationAnswer.count({
        where: { familyMemberId: papa.id, questionKey: "childrenPreference" },
      })) === 0,
    );
    await prisma.familyMember.update({ where: { id: papa.id }, data: { relation: "PARENT" } });

    console.log("\nA revoked member stops speaking");

    await prisma.familyMember.update({
      where: { id: papa.id },
      data: { revokedAt: new Date(), status: "REVOKED" },
    });
    const afterRevoke = (await getExpectationGapReport(user.id))!;
    check(
      "their expectation leaves the report",
      afterRevoke.respondents.length === 0,
      afterRevoke.respondents.map((r) => r.name).join(", "),
    );
    check(
      "and the gap reverts to unanswered rather than staying a difference",
      afterRevoke.gaps.find((g) => g.key === "postMarriageLivingPlan")?.status === "UNKNOWN",
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
