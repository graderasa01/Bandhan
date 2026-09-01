import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  BOTTOM_RAIL,
  BOTTOM_RAIL_HREFS,
  NAV_TONE_BY_HREF,
  navSearch,
} from "../components/layout/navItems";
import { buildBandhanJourney, formatBandhanJourney } from "../lib/services/journey/bandhanJourney";
import { buildSelfKnowledge, formatSelfKnowledge } from "../lib/services/grio/selfKnowledge";
import { getCompatibilityReport } from "../lib/services/match/compatibilityData";
import { saveDraft } from "../lib/services/profile/draftService";
import { saveSignalAnswer } from "../lib/services/profile/intelligenceService";

/**
 * The last pass: navigation, unified readiness, and the graph's new sections.
 *
 * Run: `npx tsx scripts/final-phases-check.ts`
 *
 * Navigation is the part most worth a test, and for an unglamorous reason: it
 * was regrouped, not rewritten, and the one way a regroup fails is by silently
 * dropping a route. Nothing type-checks that — a page whose nav entry vanished
 * still builds, still works if you know the URL, and is simply gone.
 *
 * The readiness model gets tested for what it must *not* do: produce a score,
 * or claim something is done that nobody has done.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Every destination that existed before the regroup.
 *
 * Written out rather than derived, because deriving it from the current file
 * would make the test agree with whatever the file says — which is the one
 * thing it must not do.
 */
const ROUTES_BEFORE_REGROUP = [
  "/user/dashboard",
  "/user/reel",
  "/user/matches",
  "/user/shortlist",
  "/user/interests",
  "/user/circle",
  "/user/vibe",
  "/user/messages",
  "/user/inbox",
  "/user/concierge",
  "/user/family",
  "/profile/build",
  "/user/profile/me",
  "/user/biodata",
  "/user/deep-profile",
  "/user/profile/intelligence",
  "/user/profile-trust-score",
  "/user/kundli",
  "/user/app-setup",
  "/user/boost",
  "/user/subscription",
];

let userId: string | null = null;
let otherId: string | null = null;

async function main() {
  console.log("\nNavigation — regrouped, nothing lost");

  const hrefs = new Set(NAV_ITEMS.map((i) => i.href));
  const missing = ROUTES_BEFORE_REGROUP.filter((r) => !hrefs.has(r));
  check("every pre-regroup route still has a nav entry", missing.length === 0, missing.join(", "));
  check(
    "and nothing is listed twice",
    hrefs.size === NAV_ITEMS.length,
    "a duplicate would render the same tile in two spaces",
  );

  const ids = NAV_GROUPS.map((g) => g.id);
  check("the four spaces exist", ["today", "rishte", "grio", "me"].every((k) => ids.includes(k)), ids.join(", "));
  check("family is the fifth, not folded into me", ids.includes("family"));
  check("and there is no separate Upgrade heading", !ids.includes("upgrade"));
  check(
    "selling still has a home inside Me",
    NAV_GROUPS.find((g) => g.id === "me")?.items.some((i) => i.href === "/user/subscription") === true,
  );

  check("every group has at least one item", NAV_GROUPS.every((g) => g.items.length > 0));
  check("every item has a tone", NAV_ITEMS.every((i) => Boolean(NAV_TONE_BY_HREF[i.href])));

  check("the rail has one slot per space plus Reel", BOTTOM_RAIL_HREFS.length === 5);
  check("and every rail href resolves to a real item", BOTTOM_RAIL.every(Boolean));
  check("Grio is one tap away", BOTTOM_RAIL_HREFS.includes("/user/concierge"));
  check("so is the daily loop", BOTTOM_RAIL_HREFS.includes("/user/reel"));

  // Hinglish search terms are how people actually find things here.
  check("search finds the reel by a Hinglish word", navSearch("rishta").length > 0);
  check("search finds intelligence by 'samajh'", navSearch("samajh").some((i) => i.href.includes("intelligence")));
  check("search finds family by 'ghar wale'", navSearch("ghar wale").some((i) => i.href === "/user/family"));

  /* ---------------------------------------------------------------- */

  const [a, b] = await Promise.all([
    prisma.user.create({
      data: { fullName: "Final A", email: `final-a+${Date.now()}@local.test`, passwordHash: "x", status: "INCOMPLETE" },
    }),
    prisma.user.create({
      data: { fullName: "Final B", email: `final-b+${Date.now()}@local.test`, passwordHash: "x", status: "INCOMPLETE" },
    }),
  ]);
  userId = a.id;
  otherId = b.id;

  try {
    console.log("\nBandhan Journey — a mirror, not a score");

    check("a user with no profile has no journey", (await buildBandhanJourney(a.id)) === null);

    await saveDraft(a.id, { currentCity: "Noida", profession: "CA" });
    const journey = (await buildBandhanJourney(a.id))!;

    check("six areas", journey.areas.length === 6, String(journey.areas.length));
    check("all six share one shape", journey.areas.every((x) => typeof x.percent === "number" && x.label.length > 0));
    check("percent is always bounded", journey.areas.every((x) => x.percent >= 0 && x.percent <= 100));
    check(
      "a brand-new user has nothing marked done",
      journey.complete === 0,
      journey.areas.filter((x) => x.done).map((x) => x.key).join(", "),
    );
    check("and every unfinished area offers a way forward", journey.areas.every((x) => x.done || Boolean(x.href)));
    check(
      "the suggested next area is the least far along",
      journey.next !== null &&
        journey.areas.filter((x) => !x.done).every((x) => x.percent >= journey.next!.percent),
    );

    const jBlock = formatBandhanJourney(journey);
    check("the block forbids inventing a total score", jBlock.includes("Ye koi score nahi hai"));
    check("and forbids using it as a gate", jBlock.includes("kisi feature ko rokti nahi"));
    check("and asks for one suggestion at a time", jBlock.includes("Ek baar me ek hi cheez"));

    // Family "done" needs both a seat and an answer — a silent seat is an
    // invite that was accepted and then ignored.
    const familyArea = journey.areas.find((x) => x.key === "FAMILY")!;
    check("family starts undone with an invite CTA", !familyArea.done && familyArea.cta === "Invite");

    console.log("\nThe graph carries behaviour and live rishtey");

    const snap = (await buildSelfKnowledge(a.id))!;
    check("the snapshot exposes active rishtey", Array.isArray(snap.activeRishtey));
    check("empty for a user with no matches", snap.activeRishtey.length === 0);

    const match = await prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
    await prisma.profile.upsert({
      where: { userId: b.id },
      create: { userId: b.id, displayName: "Priya" },
      update: { displayName: "Priya" },
    });
    await prisma.message.create({ data: { matchId: match.id, senderId: b.id, body: "hi" } });

    const snap2 = (await buildSelfKnowledge(a.id))!;
    const rishta = snap2.activeRishtey[0];
    check("a match appears", snap2.activeRishtey.length === 1);
    check("named", rishta?.name === "Priya", rishta?.name);
    check("and the user is shown as owing a reply", rishta?.awaitingReply === true);
    check(
      "which reaches the behaviour lines",
      snap2.behaviour.some((x) => x.includes("rishtey abhi chal rahe hain")),
      snap2.behaviour.join(" | "),
    );

    const block = formatSelfKnowledge(snap2);
    check(
      "and behaviour is still tagged as behaviour, not preference",
      block.includes("USER KE ISTEMAAL SE NIKLI BAATEIN"),
    );

    console.log("\nCompatibility Lab is reachable outside Grio");

    // Both sides answer the same question differently, so the page has
    // something real to render.
    await saveSignalAnswer(a.id, "postMarriageLivingPlan", "Nuclear family");
    await saveSignalAnswer(b.id, "postMarriageLivingPlan", "Joint family");
    await prisma.profile.update({
      where: { userId: b.id },
      data: { isVisible: true, profileStatus: "VERIFIED" },
    });

    const bProfile = await prisma.profile.findUniqueOrThrow({ where: { userId: b.id } });
    const report = await getCompatibilityReport(a.id, bProfile.id);
    check("the page-side fetch returns a report", report !== null);
    check(
      "with the same verdict the dossier would give",
      report?.discuss.some((d) => d.key === "postMarriageLivingPlan") === true,
      report?.dimensions.find((d) => d.key === "postMarriageLivingPlan")?.status,
    );
    check("looking at yourself returns nothing", (await getCompatibilityReport(a.id, (await prisma.profile.findUniqueOrThrow({ where: { userId: a.id } })).id)) === null);

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
