import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  MINIMUM_LIVE_KEYS,
  evaluateReadiness,
  isValidFieldValue,
  lifecycleFor,
  needsHumanReview,
} from "../lib/profile/readiness";
import { FIELD_BY_KEY } from "../lib/profile/fields";
import { saveDraft, getOrCreateProfile } from "../lib/services/profile/draftService";
import { saveFieldProvenance } from "../lib/services/profile/provenanceService";
import {
  activateIfReady,
  getProfileReadiness,
  isActivatedOnServer,
} from "../lib/services/profile/readinessService";

/**
 * The live-readiness rule, end to end, against a real database.
 *
 * Run: `npx tsx scripts/profile-readiness-check.ts`
 *
 * This is the check for the claim the whole onboarding rebuild rests on: there
 * is **one** answer to "may this profile be live", the server owns it, and an
 * AI value nobody confirmed can never produce a yes. Each case below is one of
 * the acceptance checks:
 *
 *   1. eight minimum fields, entered by hand  → live
 *   2. optional/later-stage fields missing    → still live
 *   3. a low-confidence required biodata field→ NOT live
 *   4. the user confirms it                   → live
 *   5. the user edits it                      → user provenance replaces AI's
 *   6. re-read from the server (a refresh)    → unconfirmed stays unconfirmed
 *  10. a save that never lands                → nothing claims live
 *
 * It writes real rows and deletes the user it made, like every other check
 * script here.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A complete, valid set of the eight minimum answers. */
const MINIMUM_VALUES: Record<string, string> = {
  fullName: "Rahul Sharma",
  gender: "Ladka",
  dateOfBirth: "12/04/1995",
  height: "5'9\"",
  currentCity: "Jaipur",
  maritalStatus: "Never Married",
  education: "B.Tech",
  profession: "Software Engineer",
};

let userId: string | null = null;

async function main() {
  console.log("\nThe rule itself — no database needed");

  check(
    "the minimum gate is exactly stage 1's eight required fields",
    MINIMUM_LIVE_KEYS.length === 8 &&
      MINIMUM_LIVE_KEYS.every((k) => FIELD_BY_KEY[k]?.stage === 1 && FIELD_BY_KEY[k]?.required),
    MINIMUM_LIVE_KEYS.join(", "),
  );

  check("an empty draft is not ready", evaluateReadiness({}).ready === false);
  check(
    "and reports every one of the eight as missing",
    evaluateReadiness({}).blockers.length === 8 &&
      evaluateReadiness({}).blockers.every((b) => b.reason === "missing"),
  );

  const full = evaluateReadiness(MINIMUM_VALUES);
  check("(1) all eight, hand-entered → ready", full.ready === true, full.blockers.map((b) => b.label).join(", "));
  check("and the counter reads 8 of 8", full.done === 8 && full.total === 8);

  check(
    "(2) optional and later-stage fields missing does not block it",
    evaluateReadiness({ ...MINIMUM_VALUES }).ready === true &&
      // motherTongue/diet/familyType/partnerAgeRange are *required* fields in
      // stage 2 — the old activation rule waited for these four as well.
      ["motherTongue", "diet", "familyType", "partnerAgeRange"].every(
        (k) => FIELD_BY_KEY[k]?.required && !MINIMUM_LIVE_KEYS.includes(k),
      ),
  );

  const aiUnconfirmed = evaluateReadiness(MINIMUM_VALUES, {
    education: { source: "ai", confirmed: false },
  });
  check("(3) an unconfirmed AI required value blocks it", aiUnconfirmed.ready === false);
  check(
    "and says so as 'unconfirmed', not as 'missing'",
    aiUnconfirmed.blockers.length === 1 && aiUnconfirmed.blockers[0].reason === "unconfirmed",
    JSON.stringify(aiUnconfirmed.blockers),
  );
  check(
    "an unconfirmed *inference* blocks it too",
    evaluateReadiness(MINIMUM_VALUES, { height: { source: "inferred", confirmed: false } }).ready === false,
  );
  check(
    "(4) the same value, confirmed, does not block it",
    evaluateReadiness(MINIMUM_VALUES, { education: { source: "ai", confirmed: true } }).ready === true,
  );
  check(
    "a field with no provenance at all is trusted — profiles predate this table",
    needsHumanReview(undefined) === false,
  );

  console.log("\nA value outside its own options is not an answer");

  check(
    "an education the catalog has no rung for is invalid",
    evaluateReadiness({ ...MINIMUM_VALUES, education: "Bachelors-ish" }).blockers[0]?.reason === "invalid",
  );
  check("31 February is not a date", !isValidFieldValue(FIELD_BY_KEY.dateOfBirth, "31/02/1995"));
  check("nor is a 12-year-old's", !isValidFieldValue(FIELD_BY_KEY.dateOfBirth, "01/01/2015"));
  check("the DB's own ISO shape is", isValidFieldValue(FIELD_BY_KEY.dateOfBirth, "1995-04-12"));

  console.log("\nThe four states are distinguishable");

  const readyNoServer = lifecycleFor({
    readiness: evaluateReadiness(MINIMUM_VALUES),
    hasAnyValue: true,
    activatedOnServer: false,
  });
  check("(10) minimum met but the server has not confirmed → 'ready', never 'live'", readyNoServer === "ready");
  check(
    "everything filled but awaiting a check → 'needs_review'",
    lifecycleFor({
      readiness: evaluateReadiness(MINIMUM_VALUES, { height: { source: "ai", confirmed: false } }),
      hasAnyValue: true,
      activatedOnServer: false,
    }) === "needs_review",
  );
  check(
    "a half-filled draft → 'draft'",
    lifecycleFor({
      readiness: evaluateReadiness({ fullName: "Rahul Sharma" }),
      hasAnyValue: true,
      activatedOnServer: false,
    }) === "draft",
  );
  check(
    "nothing at all → 'empty'",
    lifecycleFor({ readiness: evaluateReadiness({}), hasAnyValue: false, activatedOnServer: false }) === "empty",
  );

  /* ------------------------------------------------------------------ */
  /* Against the real write path                                        */
  /* ------------------------------------------------------------------ */

  console.log("\nAgainst a real profile row");

  const user = await prisma.user.create({
    data: {
      email: `readiness-check-${Date.now()}@bandhantak.test`,
      mobile: `9${Date.now().toString().slice(-9)}`,
      passwordHash: "x",
      fullName: "Readiness Check",
      role: "USER",
      status: "INCOMPLETE",
    },
  });
  userId = user.id;

  // Seven of eight — one short.
  const partial = { ...MINIMUM_VALUES };
  delete (partial as Record<string, string>).profession;
  await saveDraft(user.id, partial);
  let profile = await getOrCreateProfile(user.id);
  let act = await activateIfReady(user.id, profile);
  check("seven of eight does not activate", act.justActivated === false && act.view.activatedOnServer === false);
  check("and the user stays INCOMPLETE", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status === "INCOMPLETE");

  // The eighth.
  await saveDraft(user.id, MINIMUM_VALUES);
  profile = await getOrCreateProfile(user.id);
  act = await activateIfReady(user.id, profile);
  check("(1) the eighth field activates the profile", act.justActivated === true);
  check("the row is SUBMITTED and visible", act.profileStatus === "SUBMITTED" && isActivatedOnServer(await getOrCreateProfile(user.id)));
  check(
    "and the account is ACTIVE, so post-login routing agrees",
    (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status === "ACTIVE",
  );
  check("running it again is a no-op, not a second activation", (await activateIfReady(user.id, await getOrCreateProfile(user.id))).justActivated === false);

  /* --- (3) a low-confidence biodata value on a required field --- */

  const second = await prisma.user.create({
    data: {
      email: `readiness-bio-${Date.now()}@bandhantak.test`,
      mobile: `8${Date.now().toString().slice(-9)}`,
      passwordHash: "x",
      fullName: "Biodata Check",
      role: "USER",
      status: "INCOMPLETE",
    },
  });

  try {
    await saveDraft(second.id, MINIMUM_VALUES);
    const bioProfile = await getOrCreateProfile(second.id);
    await saveFieldProvenance(
      bioProfile.id,
      { education: { source: "ai", confidence: 0.4, sourceSpan: "B.E. (Computer)", confirmed: false } },
      "SELF",
    );

    let view = await getProfileReadiness(await getOrCreateProfile(second.id));
    check("(3) a biodata field nobody checked keeps the profile off", view.readiness.ready === false);
    check("named as needing review, not as missing", view.readiness.needsReview.includes("education"));
    const blocked = await activateIfReady(second.id, await getOrCreateProfile(second.id));
    check("and activation refuses", blocked.justActivated === false);
    check(
      "the profile is genuinely not visible",
      !isActivatedOnServer(await getOrCreateProfile(second.id)),
    );

    /* --- (6) re-read from the server: unconfirmed stays unconfirmed --- */

    view = await getProfileReadiness(await getOrCreateProfile(second.id));
    check(
      "(6) a fresh server read still reports it unconfirmed",
      view.meta.education?.confirmed === false && view.meta.education?.source === "ai",
      JSON.stringify(view.meta.education),
    );

    /* --- (4) the user confirms it --- */

    await saveFieldProvenance(bioProfile.id, { education: { source: "ai", confirmed: true } }, "SELF");
    const afterConfirm = await activateIfReady(second.id, await getOrCreateProfile(second.id));
    check("(4) confirming it activates the profile", afterConfirm.justActivated === true);
    check(
      "and the stored source records that a human vouched for a model's reading",
      (await prisma.profileFieldProvenance.findFirstOrThrow({
        where: { profileId: bioProfile.id, fieldKey: "education" },
      })).source === "USER_CONFIRMED_AI",
    );

    /* --- (5) editing replaces AI provenance rather than merging into it --- */

    await saveFieldProvenance(
      bioProfile.id,
      { currentCity: { source: "ai", confidence: 0.3, sourceSpan: "Res: Jodhpur", confirmed: false } },
      "SELF",
    );
    // What `editField` on the client sends: source user, confirmed, and no
    // trace of the reading it replaced.
    await saveFieldProvenance(bioProfile.id, { currentCity: { source: "user", confirmed: true } }, "SELF");
    const edited = await prisma.profileFieldProvenance.findFirstOrThrow({
      where: { profileId: bioProfile.id, fieldKey: "currentCity" },
    });
    check("(5) a hand correction becomes USER_ENTERED", edited.source === "USER_ENTERED");
    check("with no stale confidence", edited.confidence === null);
    check("and no stale source span", edited.sourceContext === null);
    check("and it is confirmed", edited.confirmed === true);
  } finally {
    await prisma.user.delete({ where: { id: second.id } }).catch(() => {});
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
