import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  buildLayerView,
  getIntelligenceState,
  saveSignalAnswer,
} from "../lib/services/profile/intelligenceService";
import { saveFieldProvenance, setRespondentType, getFieldProvenance, isUnconfirmedInference } from "../lib/services/profile/provenanceService";
import { saveDraft } from "../lib/services/profile/draftService";
import { importanceKeyFor } from "../lib/profile/intelligenceQuestions";

/**
 * The half `intelligence-check.ts` cannot cover: what actually reaches Postgres.
 *
 * Run: `npx tsx scripts/intelligence-persistence-check.ts`
 *
 * Creates a throwaway user, drives the real service functions (no
 * reimplementation, no mocks), asserts what came back, and deletes the user on
 * the way out — including on failure. Needs the dev database up
 * (`docker compose up -d db`).
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const EMAIL = `intelligence-check+${Date.now()}@local.test`;

async function main() {
  const user = await prisma.user.create({
    data: { fullName: "Intelligence Check", email: EMAIL, passwordHash: "not-a-login", status: "INCOMPLETE" },
  });

  try {
    console.log("\nWrite path");

    const fresh = await getIntelligenceState(user.id);
    check("a new profile starts at zero understood areas", fresh.progress.completedLayers === 0);
    check("but still has a recommended next layer", fresh.progress.nextLayer?.key === "INTENT");

    const bad = await saveSignalAnswer(user.id, "notARealQuestion", "whatever");
    check("an unknown question key is rejected", !bad.ok && bad.error === "UNKNOWN_KEY");

    const offList = await saveSignalAnswer(user.id, "childrenPreference", "Maybe someday");
    check("an answer outside the option list is rejected", !offList.ok && offList.error === "INVALID_ANSWER");

    const tooMany = await saveSignalAnswer(user.id, "dealBreakerCodes", [
      "NO_SMOKING",
      "NO_DRINKING",
      "DIET",
      "RELIGION",
      "COMMUNITY",
      "NO_RELOCATION",
    ]);
    check("more than five deal breakers is rejected", !tooMany.ok && tooMany.error === "TOO_MANY");

    const saved = await saveSignalAnswer(user.id, "childrenPreference", "Definitely yes");
    check("a valid answer saves", saved.ok);

    console.log("\nRead-back (the reload test)");

    const reloaded = await getIntelligenceState(user.id);
    check("the answer survives a fresh read", reloaded.answers.get("childrenPreference")?.value === "Definitely yes");
    check("it counts toward coverage", reloaded.progress.answeredQuestions === 1);
    check(
      "answering children reveals its follow-ups",
      reloaded.progress.layers.find((l) => l.key === "CHILDREN")!.total === 4,
    );

    console.log("\nVisibility is assigned by the server, not the caller");

    const row = await prisma.profileSignalAnswer.findFirst({
      where: { profileId: reloaded.profileId, key: "childrenPreference" },
    });
    check("a MATCH_PRIVATE question is stored MATCH_PRIVATE", row?.visibility === "MATCH_PRIVATE");
    await saveSignalAnswer(user.id, "postMarriageLivingPlan", "Nuclear family");
    const publicRow = await prisma.profileSignalAnswer.findFirst({
      where: { profileId: reloaded.profileId, key: "postMarriageLivingPlan" },
    });
    check("a PROFILE_VISIBLE question is stored PROFILE_VISIBLE", publicRow?.visibility === "PROFILE_VISIBLE");

    console.log("\nSerious Circle stays in step");

    await saveSignalAnswer(user.id, "marriageTimeline", "0–3 months");
    const afterTimeline = await prisma.profile.findUnique({ where: { userId: user.id } });
    check("declaring a timeline sets the Circle column", afterTimeline?.marriageTimeline === "WITHIN_3_MONTHS");

    await saveSignalAnswer(user.id, "marriageTimeline", "Abhi sure nahi");
    const afterUnsure = await prisma.profile.findUnique({ where: { userId: user.id } });
    check("withdrawing it clears that column rather than leaving a stale claim", afterUnsure?.marriageTimeline === null);

    console.log("\nWrite-back into the older field");

    await saveSignalAnswer(user.id, "relocationBoundary", "Anywhere in India");
    const afterRelocation = await getIntelligenceState(user.id);
    check(
      'a relocation boundary fills the blank "Relocation" field',
      afterRelocation.values.relocateWilling === "Haan",
      afterRelocation.values.relocateWilling,
    );

    await saveDraft(user.id, { familyValues: "Traditional" });
    await saveSignalAnswer(user.id, "traditionModernBalance", "Mostly modern");
    const afterValues = await getIntelligenceState(user.id);
    check(
      "an answer the user already gave in the full form is never overwritten",
      afterValues.values.familyValues === "Traditional",
      afterValues.values.familyValues,
    );

    console.log("\nWho answered");

    await setRespondentType(afterValues.profileId, "son");
    await saveSignalAnswer(user.id, "moneyStyle", "Saver");
    const parentState = await getIntelligenceState(user.id);
    const moneyAnswer = parentState.answers.get("moneyStyle")!;
    check("a parent-entered subjective answer is stored unconfirmed", moneyAnswer.confirmed === false);
    check("and tagged as coming from a parent", moneyAnswer.respondentType === "PARENT");
    const objectiveAnswer = parentState.answers.get("postMarriageLivingPlan")!;
    check("an answer nobody else could get wrong stays confirmed", objectiveAnswer.confirmed === true);

    const layerView = buildLayerView(parentState, "MONEY");
    const moneyQuestion = layerView.questions.find((q) => q.key === "moneyStyle")!;
    check("the screen shows it as awaiting confirmation", moneyQuestion.needsSelfConfirm);
    check("the question is asked in the parent's voice", moneyQuestion.question.includes("Wo "));

    console.log("\nField provenance");

    await saveFieldProvenance(
      parentState.profileId,
      {
        profession: { source: "ai", confidence: 0.82, sourceSpan: "Software Engineer at TCS", confirmed: false },
        currentCity: { source: "user", confirmed: true },
        motherTongue: { source: "inferred", inferredFrom: "Marwari surname", confirmed: false },
      },
      "PARENT",
    );
    const provenance = await getFieldProvenance(parentState.profileId);
    check("an AI-extracted field records where it came from", provenance.get("profession")?.source === "BIODATA_EXTRACTED");
    check("confidence is stored on the 0-100 scale", provenance.get("profession")?.confidence === 82);
    check("the user's own words are kept", provenance.get("profession")?.sourceContext === "Software Engineer at TCS");
    check("a hand-typed value is USER_ENTERED", provenance.get("currentCity")?.source === "USER_ENTERED");
    check("an inference is not filed as an extraction", provenance.get("motherTongue")?.source === "AI_INFERRED");
    check("an unconfirmed inference is flagged as such", isUnconfirmedInference(provenance.get("motherTongue")));
    check("a confirmed hand-typed value is not", !isUnconfirmedInference(provenance.get("currentCity")));

    await saveFieldProvenance(parentState.profileId, { profession: { source: "ai", confirmed: true } }, "SELF");
    const afterConfirm = await getFieldProvenance(parentState.profileId);
    check("confirming an extraction upgrades its source", afterConfirm.get("profession")?.source === "USER_CONFIRMED_AI");
    check("and it stops counting as an unconfirmed guess", !isUnconfirmedInference(afterConfirm.get("profession")));
    check("one row per field, not one per save", (await prisma.profileFieldProvenance.count({ where: { profileId: parentState.profileId } })) === 3);

    console.log("\nImportance answers");

    await saveDraft(user.id, { partnerCastePreference: "Agarwal" });
    const withPref = await getIntelligenceState(user.id);
    const prefLayer = withPref.progress.layers.find((l) => l.key === "PARTNER_PREFERENCES")!;
    check(
      "setting a caste preference reveals its importance question",
      prefLayer.applicableKeys.includes(importanceKeyFor("caste")),
    );
    const impSaved = await saveSignalAnswer(user.id, importanceKeyFor("caste"), "Must match");
    check("the importance answer saves", impSaved.ok);

    console.log("\nNothing is blocked");

    const finalState = await getIntelligenceState(user.id);
    check("coverage never reaches into completion", finalState.progress.answeredQuestions < finalState.progress.totalQuestions);
    check("the profile is still readable with layers unanswered", finalState.progress.nextLayer !== null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
