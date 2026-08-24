import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  deriveStage,
  effectiveStage,
  nextStages,
  requiresConfirmation,
  MAX_DERIVED_STAGE,
  RISHTA_STAGE_ORDER,
  type RishtaSignals,
} from "../lib/profile/rishtaStages";
import {
  addRishtaMeeting,
  addRishtaReflection,
  confirmRishtaStage,
  formatRishtaSummary,
  getRishtaSummary,
  seedTopicsFromCompatibility,
  upsertRishtaTopic,
} from "../lib/services/rishta/journeyService";
import { saveDraft } from "../lib/services/profile/draftService";
import { GRIO_ACTIONS, type GrioActionSpec } from "../lib/contracts/grio";

/**
 * Rishta Journey — stage derivation and relationship memory.
 *
 * Run: `npx tsx scripts/rishta-journey-check.ts`
 *
 * The two properties worth protecting, and neither is "it stores rows":
 *
 *   1. **Derivation stops at TALKING.** Nothing in a database distinguishes
 *      "chatting politely" from "seriously considering marriage", and a system
 *      that guessed would tell somebody they are in an understanding with a
 *      person they were being courteous to. Everything past TALKING is a human
 *      saying so.
 *
 *   2. **Every fact has a row behind it.** "Hum kahan tak aaye the" is asked
 *      precisely because the user cannot remember, which makes it the one place
 *      an invented answer would never be caught. The formatted block must
 *      contain only counts, timestamps and the user's own words.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function signals(over: Partial<RishtaSignals> = {}): RishtaSignals {
  return {
    interestSent: false,
    interestReceived: false,
    matched: false,
    messagesFromUser: 0,
    messagesFromOther: 0,
    familyTouched: false,
    ...over,
  };
}

let userId: string | null = null;
let otherId: string | null = null;

async function main() {
  console.log("\nDerivation reads events, and stops where events stop meaning anything");

  check("nothing at all is DISCOVERED", deriveStage(signals()) === "DISCOVERED");
  check("an interest sent is INTERESTED", deriveStage(signals({ interestSent: true })) === "INTERESTED");
  check("an interest received counts too", deriveStage(signals({ interestReceived: true })) === "INTERESTED");
  check("a match is MUTUAL_MATCH", deriveStage(signals({ matched: true })) === "MUTUAL_MATCH");
  check(
    "one-sided messages are NOT talking",
    deriveStage(signals({ matched: true, messagesFromUser: 6 })) === "MUTUAL_MATCH",
    "six unanswered messages is somebody being ignored, not a conversation",
  );
  check(
    "a reply is what makes it TALKING",
    deriveStage(signals({ matched: true, messagesFromUser: 1, messagesFromOther: 1 })) === "TALKING",
  );
  check(
    "and derivation never reaches past TALKING, however much happens",
    deriveStage(signals({ matched: true, messagesFromUser: 200, messagesFromOther: 200, familyTouched: true })) ===
      MAX_DERIVED_STAGE,
    "message volume cannot prove intent",
  );

  console.log("\nConfirmed and derived combine without either lying");

  check("no confirmation means the derived stage", effectiveStage("TALKING", null) === "TALKING");
  check(
    "a confirmation ahead of events wins",
    effectiveStage("TALKING", "FAMILY_INVOLVED") === "FAMILY_INVOLVED",
  );
  check(
    "new messages never drag a confirmed stage backwards",
    effectiveStage("TALKING", "MET") === "MET",
    "a user who met somebody has met them, whatever the message count says",
  );
  check(
    "a stale confirmation does not hold the journey back",
    effectiveStage("TALKING", "INTERESTED") === "TALKING",
  );
  check("CLOSED is absolute", effectiveStage("TALKING", "CLOSED") === "CLOSED");

  console.log("\nOnly judgements are confirmable");

  check("MUTUAL_MATCH cannot be confirmed", !requiresConfirmation("MUTUAL_MATCH"));
  check("TALKING cannot be confirmed", !requiresConfirmation("TALKING"));
  check("UNDERSTANDING must be", requiresConfirmation("UNDERSTANDING"));
  check("MET must be", requiresConfirmation("MET"));

  const from = nextStages("TALKING");
  check("the next step is offered", from.some((s) => s === "UNDERSTANDING"));
  check("family is reachable out of order", from.includes("FAMILY_INVOLVED"), from.join(", "));
  check("closing is always available", from.includes("CLOSED"));
  check("but MET is not reachable from TALKING", !from.includes("MET"));
  check("a closed rishta offers nothing", nextStages("CLOSED").length === 0);
  check("stage order has no duplicates", new Set(RISHTA_STAGE_ORDER).size === RISHTA_STAGE_ORDER.length);

  console.log("\nThe three rishta writes are wired as real actions");

  /*
   * Phase 8 asked for a long action list, and most of it is deliberately not in
   * the catalog: GET_MY_TODAY, WHAT_DO_YOU_KNOW_ABOUT_ME, GET_RISHTA_SUMMARY
   * and the rest are *reads* Grio already has in its prompt, so an action would
   * add a round-trip to fetch what the model can already see. What had no home
   * at all was the writing direction — these three.
   */
  for (const key of ["saveRishtaReflection", "addRishtaMeeting", "markRishtaTopicResolved"] as const) {
    // Widened: reading a field across three differently-shaped literal rows
    // narrows the union to `never` otherwise.
    const spec = GRIO_ACTIONS[key] as GrioActionSpec;
    check(`${key} is in the catalog`, Boolean(spec));
    check(`${key} opens a sheet rather than firing`, spec.kind === "sheet");
    check(
      `${key} lands on one person`,
      "needs" in spec && spec.needs === "profile",
      "without this the client never asks who, and the note is filed against nobody",
    );
    check(`${key} tells the model when to offer it`, spec.when.length > 0);
    check(`${key} has code-owned outcome copy`, Boolean(spec.outcome ?? spec.done));
  }
  check(
    "no read-only action was added",
    !Object.keys(GRIO_ACTIONS).some((k) => /^get[A-Z]/.test(k)),
    "a read action would fetch what is already in the prompt",
  );

  /* ---------------------------------------------------------------- */

  const [a, b] = await Promise.all([
    prisma.user.create({
      data: {
        fullName: "Rishta A",
        email: `rishta-a+${Date.now()}@local.test`,
        passwordHash: "x",
        status: "INCOMPLETE",
      },
    }),
    prisma.user.create({
      data: {
        fullName: "Rishta B",
        email: `rishta-b+${Date.now()}@local.test`,
        passwordHash: "x",
        status: "INCOMPLETE",
      },
    }),
  ]);
  userId = a.id;
  otherId = b.id;

  try {
    console.log("\nNo relationship means no journey");

    await saveDraft(a.id, { currentCity: "Noida" });
    await saveDraft(b.id, { currentCity: "Pune", fullName: "Priya" });
    await prisma.profile.update({ where: { userId: b.id }, data: { displayName: "Priya" } });

    check("strangers produce nothing", (await getRishtaSummary(a.id, b.id)) === null);
    check("and a user has no journey with themselves", (await getRishtaSummary(a.id, a.id)) === null);

    console.log("\nA real journey, end to end");

    await prisma.interest.create({ data: { fromUserId: a.id, toUserId: b.id, status: "PENDING" } });
    let summary = (await getRishtaSummary(a.id, b.id))!;
    check("an interest starts the journey", summary.stage === "INTERESTED", summary.stage);
    check("it is not marked confirmed", summary.stageConfirmed === false);
    check("the other person is named", summary.name === "Priya", summary.name);

    const match = await prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
    await prisma.message.create({ data: { matchId: match.id, senderId: a.id, body: "Namaste" } });
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("one-sided messages stay at MUTUAL_MATCH", summary.stage === "MUTUAL_MATCH", summary.stage);
    check("and the ball is in their court", summary.awaitingReplyFrom === "other", String(summary.awaitingReplyFrom));

    await prisma.message.create({ data: { matchId: match.id, senderId: b.id, body: "Namaste ji" } });
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("a reply makes it TALKING", summary.stage === "TALKING", summary.stage);
    check("and now the user owes a reply", summary.awaitingReplyFrom === "user");
    check("message counts are real", summary.messagesFromUser === 1 && summary.messagesFromOther === 1);

    console.log("\nConfirmation is guarded");

    const tooFar = await confirmRishtaStage(a.id, b.id, "MET");
    check("a stage two steps ahead is refused", !tooFar.ok, "MET from TALKING");

    const derivable = await confirmRishtaStage(a.id, b.id, "MUTUAL_MATCH");
    check(
      "a derivable stage cannot be confirmed",
      !derivable.ok && derivable.error === "NOT_ALLOWED",
      "storing a claim events already prove would let the two disagree later",
    );

    const ok = await confirmRishtaStage(a.id, b.id, "UNDERSTANDING");
    check("the next real step is accepted", ok.ok);
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("and now reads as confirmed", summary.stage === "UNDERSTANDING" && summary.stageConfirmed);

    // More messages must not report the user back down to TALKING.
    await prisma.message.create({ data: { matchId: match.id, senderId: a.id, body: "aur" } });
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("further activity does not regress the stage", summary.stage === "UNDERSTANDING");

    console.log("\nRelationship memory");

    await upsertRishtaTopic(a.id, b.id, { label: "Relocation", questionKey: "relocationBoundary" });
    await upsertRishtaTopic(a.id, b.id, { label: "Bachche" });
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("unresolved topics are listed", summary.unresolvedTopics.length === 2);

    await upsertRishtaTopic(a.id, b.id, { label: "Bachche", resolved: true, outcome: "Dono ready hain" });
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("resolving moves it across", summary.unresolvedTopics.length === 1 && summary.resolvedTopics.length === 1);
    check("with the user's own outcome", summary.resolvedTopics[0]?.outcome === "Dono ready hain");

    // Seeding runs on every candidate-scoped turn; it must never re-open this.
    await seedTopicsFromCompatibility(a.id, b.id, [
      { key: "childrenPreference", label: "Bachche" },
      { key: "moneyStyle", label: "Paise ki soch" },
    ]);
    summary = (await getRishtaSummary(a.id, b.id))!;
    check(
      "re-seeding never un-resolves a closed topic",
      summary.resolvedTopics.some((t) => t.label === "Bachche"),
      "a seed that could reopen topics would punish the user for revisiting the profile",
    );
    check("but does add genuinely new ones", summary.unresolvedTopics.some((t) => t.label === "Paise ki soch"));
    check("and never duplicates", summary.unresolvedTopics.filter((t) => t.label === "Relocation").length === 1);

    await addRishtaReflection(a.id, b.id, "Baat karke achha laga, par relocation par clear nahi hain");
    await addRishtaMeeting(a.id, b.id, { scheduledFor: new Date(Date.now() + 86_400_000), place: "Cafe" });
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("a reflection is kept in the user's words", summary.reflections[0]?.body.includes("relocation"));
    check("a planned meeting is kept", summary.meetings[0]?.place === "Cafe" && summary.meetings[0].happenedAt === null);

    console.log("\nThe block Grio reads is only rows");

    const block = formatRishtaSummary(summary);
    check("it states the stage", block.includes("Seriously samajh rahe hain"));
    check("with real counts", block.includes("kul 3"));
    check("it lists what is unresolved", block.includes("Relocation") && block.includes("Paise ki soch"));
    check("it quotes the reflection rather than summarising it", block.includes("Baat karke achha laga"));
    check("it forbids inventing history", block.includes("Isse aage koi baat, koi message, koi mulaqat apne se mat jodiye"));
    check("and forbids characterising the relationship", block.includes("aisa koi nateeja mat nikaliye"));

    console.log("\nThe two sides are independent");

    const theirs = await getRishtaSummary(b.id, a.id);
    check("the other person has their own journey", theirs !== null);
    check(
      "and it is NOT at the stage the user confirmed",
      theirs?.stage === "TALKING",
      `${theirs?.stage} — a shared row would leak one side's private stage to the other`,
    );
    check("nor does it carry their topics", theirs?.unresolvedTopics.length === 0);
    check("nor their reflections", theirs?.reflections.length === 0);

    console.log("\nA journey cannot be filed against a stranger");

    /*
     * Every write helper creates the journey row on demand, which is right for
     * the service and wrong as an authorization boundary — without a guard, a
     * crafted id would let somebody file reflections about a user they have no
     * relationship with. `/api/rishta/[otherUserId]` refuses first; this asserts
     * the condition that route checks is actually falsy for a stranger.
     */
    const stranger = await prisma.user.create({
      data: {
        fullName: "Stranger",
        email: `rishta-x+${Date.now()}@local.test`,
        passwordHash: "x",
        status: "INCOMPLETE",
      },
    });
    try {
      check(
        "a stranger has no summary, which is what the route gates on",
        (await getRishtaSummary(a.id, stranger.id)) === null,
      );
      const refused = await confirmRishtaStage(a.id, stranger.id, "UNDERSTANDING");
      check(
        "and confirming a stage with them is refused",
        !refused.ok && refused.error === "NO_RISHTA",
      );
      check(
        "with no journey row left behind",
        (await prisma.rishtaJourney.count({ where: { userId: a.id, otherUserId: stranger.id } })) === 0,
      );
    } finally {
      await prisma.user.delete({ where: { id: stranger.id } }).catch(() => {});
    }

    console.log("\nClosing");

    const closed = await confirmRishtaStage(a.id, b.id, "CLOSED", "Timing match nahi hui");
    check("a rishta can be closed with a reason", closed.ok);
    summary = (await getRishtaSummary(a.id, b.id))!;
    check("and stays closed", summary.stage === "CLOSED");
    check("with the reason in the user's words", summary.closedReason === "Timing match nahi hui");
    check("nothing further is offered", summary.nextStages.length === 0);

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    for (const id of [userId, otherId]) {
      if (id) await prisma.user.delete({ where: { id } }).catch(() => {});
    }
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
