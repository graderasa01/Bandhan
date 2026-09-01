import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  buildTodayBoard,
  formatTodayBoard,
  PRIORITY_TIERS,
  TOP_PRIORITIES,
  type PriorityTier,
} from "../lib/services/today/priorityEngine";
import { saveDraft } from "../lib/services/profile/draftService";
import { saveSignalAnswer } from "../lib/services/profile/intelligenceService";

/**
 * The Today priority engine, against a real database.
 *
 * Run: `npx tsx scripts/today-priority-check.ts`
 *
 * The interesting assertions are about *ordering*, not about presence. Any
 * implementation returns items; the reason this layer exists is the claim that
 * a person waiting on you outranks a system nudging you, and that claim is one
 * comparator away from silently inverting. So the tests below build states
 * where two tiers are live at once and assert which one won.
 *
 * The second thing it protects is the tier list itself. `PRIORITY_TIERS` is the
 * only place the order is written down; a reorder there is a product decision
 * and should have to be made deliberately, not fall out of an alphabetical sort
 * somewhere.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let userId: string | null = null;

/** Position of a tier in the declared order. Lower wins. */
function rank(tier: PriorityTier): number {
  return PRIORITY_TIERS.indexOf(tier);
}

async function main() {
  console.log("\nThe tier order is the product decision");

  check("urgent is first", PRIORITY_TIERS[0] === "P0_URGENT");
  check("a person waiting is second", PRIORITY_TIERS[1] === "P1_WAITING_ON_ME");
  check(
    "selling is last, always",
    PRIORITY_TIERS[PRIORITY_TIERS.length - 1] === "P8_UPGRADE",
    "if upgrade ever moves up, that is a product decision and this test is the place to argue it",
  );
  check(
    "a waiting person outranks today's reel",
    rank("P1_WAITING_ON_ME") < rank("P4_TODAY_REEL"),
  );
  check(
    "a waiting person outranks a profile nudge",
    rank("P1_WAITING_ON_ME") < rank("P6_TRUST"),
  );
  check(
    "a time-bound event outranks an evergreen gap",
    rank("P2_TIME_BOUND") < rank("P5_INTELLIGENCE_GAP"),
  );
  check("every tier is unique", new Set(PRIORITY_TIERS).size === PRIORITY_TIERS.length);

  const user = await prisma.user.create({
    data: {
      fullName: "Today Priority Check",
      email: `today-check+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      status: "INCOMPLETE",
    },
  });
  userId = user.id;

  try {
    console.log("\nAn incomplete profile is urgent, and nothing else competes with it");

    await saveDraft(user.id, { currentCity: "Noida" });
    const bare = await buildTodayBoard(user.id);
    const first = bare.priorities[0];
    check("a not-live profile produces a P0", first?.tier === "P0_URGENT", first?.tier);
    check("and it is the very first thing", first?.key === "profile-not-live", first?.key);
    check(
      "it names what is actually missing rather than a percentage",
      Boolean(first?.detail && first.detail.length > 0 && !first.detail.includes("%")),
      first?.detail,
    );

    console.log("\nOrdering holds when several tiers are live");

    // A live-enough profile so P0 clears, then a gap (P5) exists naturally
    // because no intelligence question has been answered.
    await saveDraft(user.id, {
      fullName: "Today Priority Check",
      gender: "Male",
      dateOfBirth: "1995-01-01",
      height: "5'8\"",
      maritalStatus: "Never married",
      education: "B.Tech",
      profession: "Engineer",
      motherTongue: "Hindi",
    });

    const withGap = await buildTodayBoard(user.id);
    const tiers = withGap.priorities.map((p) => p.tier);
    check("the board is sorted by tier", tiers.every((t, i) => i === 0 || rank(tiers[i - 1]) <= rank(t)),
      tiers.join(" > "));
    check(
      "an unanswered high-value question shows up as a gap",
      withGap.priorities.some((p) => p.tier === "P5_INTELLIGENCE_GAP"),
      tiers.join(" > "),
    );

    const gapItem = withGap.priorities.find((p) => p.tier === "P5_INTELLIGENCE_GAP");
    check("the gap explains why it matters", Boolean(gapItem?.detail));
    check("and points at the intelligence flow", gapItem?.href === "/user/profile/intelligence");

    // Answering it must remove it — a list that keeps asking for something it
    // was just told is the exact "not listening" failure the graph exists to end.
    await saveSignalAnswer(user.id, gapItem!.key.replace(/^gap-/, ""), "6–12 months").catch(() => null);
    const afterAnswer = await buildTodayBoard(user.id);
    check(
      "an answered question stops being suggested",
      afterAnswer.priorities.find((p) => p.tier === "P5_INTELLIGENCE_GAP")?.key !== gapItem!.key,
      afterAnswer.priorities.find((p) => p.tier === "P5_INTELLIGENCE_GAP")?.key,
    );

    console.log("\nEvery item is actionable");

    for (const p of afterAnswer.priorities) {
      check(`${p.key}: has a destination`, p.href.startsWith("/user/"), p.href);
      check(`${p.key}: has a button label`, p.cta.length > 0);
      check(`${p.key}: says something specific`, p.title.length > 0 && p.detail.length > 0);
    }

    console.log("\nThe block Grio reads is the same list");

    const block = formatTodayBoard(afterAnswer);
    check("a non-empty board produces a block", block !== null);
    if (block) {
      const shown = afterAnswer.priorities.slice(0, TOP_PRIORITIES);
      check(
        "it carries the top three and no more",
        shown.every((p) => block.includes(p.title)) &&
          (afterAnswer.priorities.length <= TOP_PRIORITIES ||
            !block.includes(afterAnswer.priorities[TOP_PRIORITIES].title)),
      );
      check("and tells the model the order is not its own", block.includes("CODE ne tay kiya hai"));
      check(
        "and stops it reciting all three at once",
        block.includes("Ek saath teenon mat gina dijiye"),
      );
    }

    check(
      "an empty board produces no block at all",
      formatTodayBoard({ priorities: [], roster: null, selfKnowledge: null }) === null,
      "an empty heading invents a chore where 'you are clear' is the honest answer",
    );

    console.log("\nCallers can hand over what they already fetched");

    // The Grio route builds both of these on every turn; re-fetching them here
    // would double the two most expensive reads in the app.
    const reused = await buildTodayBoard(user.id, { roster: null, selfKnowledge: null });
    check(
      "passing null roster/graph skips those items rather than re-fetching",
      !reused.priorities.some((p) => p.tier === "P4_TODAY_REEL" || p.tier === "P5_INTELLIGENCE_GAP"),
      reused.priorities.map((p) => p.tier).join(", "),
    );
    check("and returns what it was handed", reused.roster === null && reused.selfKnowledge === null);

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
