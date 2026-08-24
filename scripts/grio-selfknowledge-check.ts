import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  authorizeLearnMarkers,
  buildLearnAllowlist,
  buildSelfKnowledge,
  formatSelfKnowledge,
  GRIO_LEARN_INSTRUCTIONS,
} from "../lib/services/grio/selfKnowledge";
import { LEARN_MARKER_START } from "../lib/contracts/concierge";
import { saveSignalAnswer } from "../lib/services/profile/intelligenceService";
import { saveDraft } from "../lib/services/profile/draftService";
import { saveFieldProvenance, setRespondentType } from "../lib/services/profile/provenanceService";
import { addMemoryFact } from "../lib/services/grio/memory";
import { parseGrioSegments } from "../lib/contracts/grio";

/**
 * The Marriage Graph, exercised against a real database.
 *
 * Run: `npx tsx scripts/grio-selfknowledge-check.ts`
 *
 * Same shape and the same reasons as `intelligence-persistence-check.ts`: a
 * throwaway user, the real service functions rather than reimplementations, and
 * a delete on the way out even when an assertion fails. Needs the dev database
 * up (`docker compose up -d db`).
 *
 * What it is actually protecting is one property, stated three ways:
 *
 *   **An inference must never come out the other end looking like a fact.**
 *
 * So the interesting assertions are not "the snapshot has data" — they are that
 * a parent-entered subjective answer lands in `needsConfirmation` and carries
 * the family tag, that an unconfirmed AI extraction is tagged as a guess, and
 * that the rendered prompt block prints those tags rather than dropping them.
 * The last one matters most: everything upstream can be correct and the feature
 * still fails if the tag does not survive into the string the model reads.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const EMAIL = `selfknowledge-check+${Date.now()}@local.test`;

/** The second throwaway user, created mid-run; hoisted so `finally` can delete it. */
let parentUserId: string | null = null;

async function main() {
  const user = await prisma.user.create({
    data: { fullName: "Self Knowledge Check", email: EMAIL, passwordHash: "not-a-login", status: "INCOMPLETE" },
  });

  try {
    console.log("\nEmpty state");

    const empty = await buildSelfKnowledge(user.id);
    check("a user with no profile row compiles to nothing", empty === null);

    // `saveDraft` creates the profile, so everything below has one.
    await saveDraft(user.id, {
      currentCity: "Noida",
      profession: "Chartered Accountant",
      education: "CA",
      dateOfBirth: "1997-04-12",
    });

    const fresh = await buildSelfKnowledge(user.id);
    check("a fresh profile still compiles", fresh !== null);
    check(
      "and reports zero understood areas out of nine",
      fresh?.coverage.layersComplete === 0 && fresh?.coverage.layersTotal === 9,
    );
    check("with the highest-value gap ranked first", fresh?.unknowns[0]?.key === "marriageTimeline");
    check(
      "and every gap carries what is needed to ask it",
      Boolean(fresh?.unknowns[0]?.question && (fresh?.unknowns[0]?.options.length ?? 0) > 0),
    );

    console.log("\nProvenance");

    const dobFact = fresh?.areas
      .find((a) => a.kind === "identity")
      ?.facts.find((f) => f.label === "Umar");
    check("a date of birth is reflected back as an age, not a date", dobFact?.value === "29 saal", dobFact?.value);
    // The value is real; nobody recorded how it got there. Rounding that up to
    // "aapne khud bataya" is the invented-certainty this whole file forbids.
    check(
      "a field with no provenance row is UNKNOWN_SOURCE, never DECLARED",
      dobFact?.source === "UNKNOWN_SOURCE",
      dobFact?.source,
    );

    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });

    // An extraction nobody confirmed — the exact thing that must not become a fact.
    await saveFieldProvenance(profile.id, { profession: { source: "inferred", confidence: 0.7 } }, "SELF");
    // A value the user typed themselves, recorded as such. This is what
    // DECLARED is actually for, and the only way to earn it on a profile field.
    await saveFieldProvenance(profile.id, { currentCity: { source: "user", confirmed: true } }, "SELF");

    const inferred = await buildSelfKnowledge(user.id);
    const identityNow = inferred?.areas.find((a) => a.kind === "identity");
    check(
      "an unconfirmed AI reading is INFERRED, not DECLARED",
      identityNow?.facts.find((f) => f.label === "Profession")?.source === "INFERRED",
      identityNow?.facts.find((f) => f.label === "Profession")?.source,
    );
    check(
      "a recorded user-entered field is DECLARED",
      identityNow?.facts.find((f) => f.label === "Current City")?.source === "DECLARED",
      identityNow?.facts.find((f) => f.label === "Current City")?.source,
    );

    console.log("\nVERIFIED comes only from real evidence");

    check(
      "an unverified profile produces no VERIFIED fact at all",
      !(inferred?.areas ?? []).flatMap((a) => a.facts).some((f) => f.source === "VERIFIED"),
    );
    // `trustScoreService` awards points for "Education Added" / "Profession
    // Added", which read like verification and mean only "non-empty". Wiring
    // VERIFIED to those would tag a self-typed value as evidence-backed.
    check(
      "and trust factors never leak into fact-level VERIFIED",
      (inferred?.trust.verified.length ?? 0) > 0 &&
        !(inferred?.areas ?? []).flatMap((a) => a.facts).some((f) => f.source === "VERIFIED"),
      `trust factors present: ${inferred?.trust.verified.join(", ")}`,
    );

    await prisma.user.update({ where: { id: user.id }, data: { mobileVerifiedAt: new Date() } });
    const withMobile = await buildSelfKnowledge(user.id);
    const verifiedArea = withMobile?.areas.find((a) => a.kind === "verified");
    check(
      "a real OTP round-trip does produce VERIFIED",
      verifiedArea?.facts.some((f) => f.label === "Mobile number" && f.source === "VERIFIED") === true,
    );
    check(
      "and only for the thing actually verified",
      verifiedArea?.facts.length === 1,
      verifiedArea?.facts.map((f) => f.label).join(", "),
    );

    console.log("\nSelf-declared answers");

    await saveSignalAnswer(user.id, "marriageTimeline", "6–12 months");
    await saveSignalAnswer(user.id, "childrenPreference", "Definitely yes");

    const declared = await buildSelfKnowledge(user.id);
    const timeline = declared?.areas.flatMap((a) => a.facts).find((f) => f.value === "6–12 months");
    check("an answer the user tapped themselves is DECLARED", timeline?.source === "DECLARED", timeline?.source);
    check(
      "an answered question leaves the unknown list",
      !declared?.unknowns.some((u) => u.key === "marriageTimeline"),
    );
    check(
      "and the answer count moved",
      (declared?.coverage.answered ?? 0) > (fresh?.coverage.answered ?? 0),
    );

    console.log("\nFamily-provided answers");

    // A parent filling for their child: subjective `selfRequired` answers are
    // stored, shown, and explicitly *not* treated as the candidate's own.
    await setRespondentType(profile.id, "son");
    await saveSignalAnswer(user.id, "conflictFirstResponse", "Thoda space dunga/dungi");

    const family = await buildSelfKnowledge(user.id);
    const conflict = family?.areas
      .flatMap((a) => a.facts)
      .find((f) => f.value === "Thoda space dunga/dungi");
    check("a parent's subjective answer is FAMILY_SAID", conflict?.source === "FAMILY_SAID", conflict?.source);
    check(
      "and it is surfaced separately as needing confirmation",
      family?.needsConfirmation.some((f) => f.source === "FAMILY_SAID") === true,
    );

    /*
     * The regression this whole section exists for.
     *
     * `postMarriageLivingPlan` is NOT `selfRequired`, so a parent answering it
     * is stored `confirmed: true`. Reading `confirmed` before `respondentType`
     * therefore classified it DECLARED, and Grio would say "aapne bataya tha"
     * about something the candidate never said. The row is right; the reading
     * was wrong. This asserts the reading.
     */
    await saveSignalAnswer(user.id, "postMarriageLivingPlan", "Joint family");
    const objectiveByParent = await buildSelfKnowledge(user.id);
    const living = objectiveByParent?.areas
      .flatMap((a) => a.facts)
      .find((f) => f.key === "postMarriageLivingPlan");
    check(
      "a parent answering a NON-selfRequired question is still FAMILY_SAID",
      living?.source === "FAMILY_SAID",
      `${living?.source} (confirmed=${living?.confirmed})`,
    );
    check(
      "even though the row itself is stored confirmed",
      living?.confirmed === true,
      "if this flips, saveSignalAnswer changed and the test lost its teeth",
    );

    /*
     * The other half of the same rule, and the reason this is not simply
     * "PARENT profile ⇒ everything is family".
     *
     * `marriageTimeline` was answered above while the profile was still SELF,
     * so its row carries `respondentType: SELF`. Flipping the profile to PARENT
     * afterwards must NOT retroactively reclassify it — the candidate really did
     * give that answer, and per-row provenance is the more precise record.
     * Profile-level respondent is the fallback for facts that have no row of
     * their own, never an override for facts that do.
     */
    const stillSelf = await buildSelfKnowledge(user.id);
    check(
      "an answer given while the profile was SELF stays DECLARED after a flip",
      stillSelf?.areas
        .flatMap((a) => a.facts)
        .find((f) => f.key === "marriageTimeline")?.source === "DECLARED",
    );
    check(
      "and an explicit SELF provenance row outranks a PARENT profile",
      stillSelf?.areas
        .find((a) => a.kind === "identity")
        ?.facts.find((f) => f.label === "Current City")?.source === "DECLARED",
    );
    check(
      "while a field with no row of its own falls back to the profile respondent",
      stillSelf?.areas
        .find((a) => a.kind === "identity")
        ?.facts.find((f) => f.label === "Umar")?.source === "FAMILY_SAID",
    );

    console.log("\nA profile a parent filled from the start");

    /*
     * The real scenario, tested honestly on its own user: `fillingFor` is
     * chosen once at interview start, so every row is written under PARENT.
     *
     * `derivedSignals` is what makes this worth its own case — it translates
     * legacy profile fields into answers with a hard-coded `confirmed: true`,
     * carrying the profile's respondentType along. On a parent-built profile
     * that is a whole set of confident-looking answers the candidate never gave.
     */
    const parentUser = await prisma.user.create({
      data: {
        fullName: "Parent Filled Check",
        email: `selfknowledge-parent+${Date.now()}@local.test`,
        passwordHash: "not-a-login",
        status: "INCOMPLETE",
      },
    });
    parentUserId = parentUser.id;

    await saveDraft(parentUser.id, { currentCity: "Jaipur", education: "B.Com" });
    const parentProfile = await prisma.profile.findUniqueOrThrow({ where: { userId: parentUser.id } });
    await setRespondentType(parentProfile.id, "son");
    // Legacy fields that `derivedSignals` translates, plus a real answer.
    await saveDraft(parentUser.id, { relocateWilling: "Haan", familyValues: "Traditional" });
    await saveSignalAnswer(parentUser.id, "postMarriageLivingPlan", "Joint family");

    const parentSnap = await buildSelfKnowledge(parentUser.id);
    const parentFacts = (parentSnap?.areas ?? [])
      .filter((a) => a.kind === "identity" || a.kind === "layer")
      .flatMap((a) => a.facts);
    check("the parent-filled profile produced facts at all", parentFacts.length > 0);
    check(
      "and not one of them is DECLARED",
      !parentFacts.some((f) => f.source === "DECLARED"),
      parentFacts.filter((f) => f.source === "DECLARED").map((f) => f.label).join(", "),
    );
    check(
      "every one is attributed to the family",
      parentFacts.every((f) => f.source === "FAMILY_SAID"),
      parentFacts.map((f) => `${f.label}=${f.source}`).join(", "),
    );
    check(
      "including the ones derivedSignals hard-codes as confirmed",
      parentSnap?.areas
        .flatMap((a) => a.facts)
        .find((f) => f.key === "familyStructurePreference" || f.key === "familyValuesStyle")
        ?.source !== "DECLARED",
    );

    console.log("\nMemory and trust");

    await addMemoryFact(user.id, "Bangalore preferred hai", 8);
    const withMemory = await buildSelfKnowledge(user.id);
    check(
      "what the user asked Grio to remember is carried",
      withMemory?.memory.some((m) => m.body === "Bangalore preferred hai") === true,
    );
    check("trust is read, not recomputed here", withMemory?.trust.label !== undefined);

    console.log("\nThe block the model actually reads");

    const snap = withMemory!;
    const full = formatSelfKnowledge(snap);

    // Every rendered fact, checked one by one rather than by a shape regex: the
    // block also contains list lines that are *supposed* to have no tag (the
    // gaps, the family warning), and a regex loose enough to skip those is
    // loose enough to miss a real untagged fact.
    const untagged = snap.areas
      .flatMap((a) => a.facts)
      .filter((f) => !full.includes(`- ${f.label}: ${f.value} [`));
    check("every fact line carries its source tag", untagged.length === 0, untagged.map((f) => f.label).join(", "));
    check("a declared answer prints as declared", full.includes("[user ne khud bataya]"));
    check("an inference prints as a guess", full.includes("[andaaza — user ne khud nahi kaha]"));
    check("a parent-entered answer prints its own warning block", full.includes("YE PARIVAAR NE BATAYA HAI"));
    check("the gaps are stated, not hidden", full.includes("YE AAPKO ABHI NAHI PATA"));
    check(
      "coverage is described as understanding, never as profile completion",
      full.includes("aapko kitna samjha gaya hai"),
    );
    check("full mode hands over the keys needed to ask", full.includes("key: "));
    // `dealBreakerCodes` is the only multi-select in the catalog. It must be
    // nameable as a gap and never targetable by a marker, because
    // `saveSignalAnswer` replaces the set rather than appending to it.
    const multiGap = snap.unknowns.find((u) => u.key === "dealBreakerCodes");
    check("the one multi-select question is still found as a gap", multiGap !== undefined);
    check("but is marked un-askable in chat", multiGap?.askableInChat === false);
    check(
      "and no gap that is un-askable is ever handed a key",
      !snap.unknowns
        .slice(0, 5)
        .some((u) => !u.askableInChat && full.includes(`key: ${u.key}`)),
    );

    const compactSnap = (await buildSelfKnowledge(user.id, "compact"))!;
    const compact = formatSelfKnowledge(compactSnap);
    check("compact mode is shorter", compact.length < full.length);
    check("compact mode still states the gaps", compact.includes("YE AAPKO ABHI NAHI PATA"));
    check(
      "but withholds the keys — a scoped turn is not for profiling",
      !compact.includes("key: "),
    );
    check(
      "and compact mode does not even fetch the sections it would not print",
      compactSnap.trust.score === null && compactSnap.family.members === 0 && compactSnap.behaviour.length === 0,
    );
    check(
      "compact drops the Vibe log and Deep Profile read, by kind not by position",
      !compactSnap.areas.some((a) => a.kind === "vibe" || a.kind === "deep"),
    );
    check(
      "but keeps every Marriage Intelligence area — that is what a comparison needs",
      compactSnap.areas.filter((a) => a.kind === "layer").length ===
        snap.areas.filter((a) => a.kind === "layer").length,
    );

    // `DUMP=1 npx tsx scripts/grio-selfknowledge-check.ts` prints the block
    // verbatim. Worth having: every assertion above tests one property of this
    // string, and none of them can tell you whether the whole thing reads like
    // something a person would want an assistant to have been told.
    if (process.env.DUMP) console.log(`\n${"─".repeat(60)}\n${full}\n${"─".repeat(60)}`);

    console.log("\nLEARN server authorization");

    /*
     * The prompt hands the model keys only for open questions, and it was
     * tempting to call that structural. It is not: `GRIO_LEARN_INSTRUCTIONS`
     * permanently contains one real catalog key as its worked example, and
     * `/api/profile/intelligence` upserts. So the allowlist has to be enforced
     * on the way out, not requested on the way in.
     */
    const allow = buildLearnAllowlist(snap);
    const openKey = snap.unknowns.find((u) => u.askableInChat)!;

    check("an open question is on the allowlist", allow.byKey.has(openKey.key));
    check(
      "an already-answered question is not",
      !allow.byKey.has("marriageTimeline"),
      "marriageTimeline was answered earlier in this run",
    );
    check(
      "and neither is the multi-select",
      !allow.byKey.has("dealBreakerCodes"),
    );

    const okMarker = `<<<LEARN:${openKey.key}=${openKey.options[0]}>>>\nConfirm kar dijiye.`;
    check(
      "an authorized marker survives untouched",
      authorizeLearnMarkers(okMarker, allow) === okMarker,
    );

    // The exact hole the review found: a real key the model saw in its own
    // instruction block, for a question this user already answered.
    const staleMarker = "<<<LEARN:marriageTimeline=0–3 months>>>\nSamajh gaya.";
    const stale = authorizeLearnMarkers(staleMarker, allow);
    check("an answered key is stripped from the reply", !stale.includes("<<<LEARN:"), stale);
    check("but the sentence around it survives", stale.includes("Samajh gaya."));

    check(
      "a key that is not in the catalog at all is stripped",
      !authorizeLearnMarkers("<<<LEARN:favouriteColour=Blue>>>ok", allow).includes("<<<LEARN:"),
    );
    check(
      "an option outside the question's own list is stripped",
      !authorizeLearnMarkers(`<<<LEARN:${openKey.key}=Kuch aur hi>>>ok`, allow).includes("<<<LEARN:"),
    );
    check(
      "the multi-select cannot be targeted even by hand",
      !authorizeLearnMarkers("<<<LEARN:dealBreakerCodes=NO_SMOKING>>>ok", allow).includes("<<<LEARN:"),
    );

    // A near-miss is repaired rather than dropped: the card would have
    // recovered by showing every option, but the common case should stay one
    // tap, and the catalog spelling is authoritative on the server.
    const nearMiss = authorizeLearnMarkers(
      `<<<LEARN:${openKey.key}=${openKey.options[0].toLowerCase().replace(/–/g, "-")}>>>ok`,
      allow,
    );
    check(
      "a near-miss option is rewritten to the catalog spelling",
      nearMiss.includes(`<<<LEARN:${openKey.key}=${openKey.options[0]}>>>`),
      nearMiss,
    );

    check(
      "a truncated marker leaves no visible syntax behind",
      !authorizeLearnMarkers(`baat poori ${LEARN_MARKER_START}${openKey.key}=Haan`, allow).includes("<<<"),
    );

    console.log("\nThe LEARN marker");

    // The prompt's worked example is generated from the catalog and degrades to
    // an empty string if its question is ever renamed or removed. That
    // degradation is the safe failure — but it is also invisible, so this is the
    // one place it becomes loud. Without it, a catalog rename would quietly ship
    // a smaller model an instruction block with no example in it.
    check(
      "the prompt's worked example still resolves against the catalog",
      GRIO_LEARN_INSTRUCTIONS.includes("UDAHARAN"),
      "LEARN_EXAMPLE_KEY or its option no longer exists in intelligenceQuestions.ts",
    );
    check(
      "and the example it teaches is a marker the parser accepts",
      (() => {
        const line = GRIO_LEARN_INSTRUCTIONS.split("\n").find((l) => l.startsWith("<<<LEARN:"));
        return line !== undefined && parseGrioSegments(line).some((s) => s.type === "learn");
      })(),
    );

    const segs = parseGrioSegments(
      "<<<LEARN:childrenTimeline=1–2 years>>>\nAgar sahi samjha ho to confirm kar dijiye.",
    );
    const learn = segs.find((s) => s.type === "learn");
    check("a well-formed marker parses", learn?.type === "learn" && learn.key === "childrenTimeline");
    check(
      "and the value keeps its own dashes",
      learn?.type === "learn" && learn.value === "1–2 years",
      learn?.type === "learn" ? learn.value : "not a learn segment",
    );
    check("the prose around it survives", segs.some((s) => s.type === "text" && s.value.includes("confirm")));

    check(
      "a marker with no value is dropped, not half-saved",
      !parseGrioSegments("<<<LEARN:childrenTimeline=>>>").some((s) => s.type === "learn"),
    );
    check(
      "so is one with no key",
      !parseGrioSegments("<<<LEARN:=Haan>>>").some((s) => s.type === "learn"),
    );
    check(
      "an unterminated marker never leaks into the text",
      !parseGrioSegments("theek hai <<<LEARN:childrenTimeline=Jaldi")
        .some((s) => s.type === "text" && s.value.includes("<<<")),
    );
    check(
      "a LEARN next to an ACT does not swallow it",
      parseGrioSegments("<<<LEARN:childrenTimeline=Haan>>>\n<<<ACT:openVibe>>>\nTheek hai.")
        .filter((s) => s.type === "learn" || s.type === "action").length === 2,
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    // Both throwaway users, deleted even when an assertion above threw.
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    if (parentUserId) await prisma.user.delete({ where: { id: parentUserId } }).catch(() => {});
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
