import "./_env";
import { prisma } from "../lib/db/prisma";
import { placeSpotlightCard, recordReelDeliveries, recountDelivered } from "../lib/services/spotlight/delivery";
import { runCampaignSweep, shortfallRefundPaise } from "../lib/services/spotlight/campaignSweep";
import { getReelData } from "../lib/data/reelData";
import { MIN_ORGANIC_CARDS_BEFORE_PROMOTED, SPOTLIGHT_LABEL } from "../lib/services/spotlight/spotlightPolicy";

/**
 * Spotlight delivery — the half Phase One did not build.
 *
 * What this is checking is not "does a card appear". It is the four promises
 * the card is sold under, each of which is a place the feature could be
 * quietly dishonest:
 *
 *   1. **The two-way filter still holds.** Paying widens who sees you; it
 *      never overrides what somebody said they wanted.
 *   2. **Placed is not delivered.** A card in a deck nobody opened reached
 *      nobody and is not charged against the promise.
 *   3. **Reach counts people, once.** Refreshing the reel does not move the
 *      number.
 *   4. **An unfinishable promise returns money.** Pro-rata, on the unreached
 *      share only.
 *
 * Every assertion runs against a real database — no mocks, no stubbed Prisma —
 * because all four of these are ultimately claims about rows and constraints.
 *
 * Run: `npx tsx scripts/spotlight-delivery-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CITY = "DeliveryTestPur";
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdCampaignIds: string[] = [];

function dobForAge(age: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1);
  return d;
}

async function makeMember(opts: {
  name: string;
  gender: string;
  age: number;
  city?: string | null;
  prefs?: { lookingForGender?: string | null; minAge?: number | null; maxAge?: number | null } | null;
}) {
  const user = await prisma.user.create({
    data: {
      fullName: opts.name,
      email: `sdel-${opts.name.replace(/\W/g, "")}-${stamp}@local.test`,
      passwordHash: "x",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      displayName: opts.name,
      gender: opts.gender,
      dateOfBirth: dobForAge(opts.age),
      currentCity: opts.city === undefined ? CITY : opts.city,
      isVisible: true,
      profileStatus: "VERIFIED",
      fullProfileCompletionScore: 90,
      trustScore: 70,
    },
  });

  if (opts.prefs !== null) {
    await prisma.profilePartnerPreferences.create({
      data: {
        profileId: profile.id,
        lookingForGender: opts.prefs?.lookingForGender ?? null,
        minAge: opts.prefs?.minAge ?? null,
        maxAge: opts.prefs?.maxAge ?? null,
      },
    });
  }

  await prisma.profilePhoto.create({
    data: { profileId: profile.id, fileUrl: "https://local.test/p.jpg", storageKey: `k-${profile.id}` },
  });

  return { user, profile };
}

/**
 * A RUNNING campaign, written directly.
 *
 * The purchase path is `spotlight-check.ts`'s subject and is not re-tested
 * here: it reaches a live gateway, and re-proving that a captured payment
 * starts a campaign would only make this script slower and more fragile
 * without checking anything about delivery.
 */
async function makeCampaign(opts: {
  ownerUserId: string;
  promisedReach: number;
  maxDays?: number;
  targetGender: string;
  minAge?: number;
  maxAge?: number;
  cities?: string[];
  amountPaise?: number;
  endsAt?: Date;
}) {
  const now = new Date();
  const payment = await prisma.payment.create({
    data: {
      userId: opts.ownerUserId,
      kind: "ITEM",
      itemCode: "REACH_50",
      amountPaise: opts.amountPaise ?? 49900,
      status: "CAPTURED",
      capturedAt: now,
      isTest: true,
    },
  });

  const campaign = await prisma.spotlightCampaign.create({
    data: {
      ownerUserId: opts.ownerUserId,
      itemCode: "REACH_50",
      paymentId: payment.id,
      status: "RUNNING",
      cities: opts.cities ?? [],
      minAge: opts.minAge ?? 18,
      maxAge: opts.maxAge ?? 75,
      targetGender: opts.targetGender,
      promisedReach: opts.promisedReach,
      maxDays: opts.maxDays ?? 7,
      startsAt: now,
      endsAt: opts.endsAt ?? new Date(now.getTime() + (opts.maxDays ?? 7) * 86_400_000),
    },
  });
  createdCampaignIds.push(campaign.id);
  return { campaign, payment };
}

async function main() {
  // ── The arithmetic, before any rows ────────────────────────────────────────
  console.log("\nWhat a shortfall is worth");

  check("nothing is owed when the promise was met", shortfallRefundPaise(49900, 50, 50) === 0);
  check("nothing is owed when it was beaten", shortfallRefundPaise(49900, 51, 50) === 0);
  check(
    "31 of 50 returns the other 19",
    shortfallRefundPaise(49900, 31, 50) === Math.ceil((49900 * 19) / 50),
    String(shortfallRefundPaise(49900, 31, 50)),
  );
  check("delivering nobody returns the whole fee", shortfallRefundPaise(49900, 0, 50) === 49900);
  check("the refund can never exceed what was paid", shortfallRefundPaise(49900, -10, 50) <= 49900);
  check("a free campaign owes nothing back", shortfallRefundPaise(0, 0, 50) === 0);

  // ── The two-way filter ────────────────────────────────────────────────────
  console.log("\nWho a paid card may be put in front of");

  const advertiser = await makeMember({
    name: "AdvMan",
    gender: "Ladka",
    age: 30,
    prefs: { lookingForGender: "Ladki", minAge: 24, maxAge: 34 },
  });

  const wants = await makeMember({
    name: "WantsHim",
    gender: "Ladki",
    age: 28,
    prefs: { lookingForGender: "Ladka", minAge: 27, maxAge: 35 },
  });
  const tooOldForHer = await makeMember({
    name: "HeIsTooOld",
    gender: "Ladki",
    age: 28,
    prefs: { lookingForGender: "Ladka", minAge: 22, maxAge: 27 },
  });
  const wrongGender = await makeMember({
    name: "WantsLadki",
    gender: "Ladki",
    age: 28,
    prefs: { lookingForGender: "Ladki", minAge: 20, maxAge: 40 },
  });
  const statedNothing = await makeMember({ name: "NoPrefs", gender: "Ladki", age: 28, prefs: null });

  const { campaign } = await makeCampaign({
    ownerUserId: advertiser.user.id,
    promisedReach: 3,
    targetGender: "Ladki",
    cities: [CITY],
  });

  // A deck long enough to legally hold one, made of profiles that are not the
  // advertiser — the selector must never duplicate a card already in the deck.
  const filler = [
    await makeMember({ name: "Filler1", gender: "Ladka", age: 31, prefs: null }),
    await makeMember({ name: "Filler2", gender: "Ladka", age: 32, prefs: null }),
    await makeMember({ name: "Filler3", gender: "Ladka", age: 33, prefs: null }),
    await makeMember({ name: "Filler4", gender: "Ladka", age: 34, prefs: null }),
  ];
  const deck = filler.map((f) => f.profile.id);

  check("somebody whose preferences fit him gets the card", (await placeSpotlightCard(wants.user.id, deck)) !== null);
  check(
    "somebody who said he is too old does NOT",
    (await placeSpotlightCard(tooOldForHer.user.id, deck)) === null,
  );
  check(
    "somebody looking for a Ladki does NOT",
    (await placeSpotlightCard(wrongGender.user.id, deck)) === null,
  );
  check(
    "somebody who stated no preference does — nothing of theirs is being overridden",
    (await placeSpotlightCard(statedNothing.user.id, deck)) !== null,
  );
  check(
    "the advertiser never gets their own card",
    (await placeSpotlightCard(advertiser.user.id, deck)) === null,
  );

  const outOfTown = await makeMember({
    name: "Elsewhere",
    gender: "Ladki",
    age: 28,
    city: "SomewhereElse",
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  check("a city the campaign did not buy gets nothing", (await placeSpotlightCard(outOfTown.user.id, deck)) === null);

  const blocker = await makeMember({
    name: "Blocker",
    gender: "Ladki",
    age: 28,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  await prisma.userBlock.create({ data: { blockerUserId: blocker.user.id, blockedUserId: advertiser.user.id } });
  check("a block is not something money can cross", (await placeSpotlightCard(blocker.user.id, deck)) === null);

  const swiper = await makeMember({
    name: "AlreadySwiped",
    gender: "Ladki",
    age: 28,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  await prisma.swipeAction.create({
    data: { actorUserId: swiper.user.id, targetProfileId: advertiser.profile.id, direction: "LEFT" },
  });
  check("nor is a swipe somebody already made", (await placeSpotlightCard(swiper.user.id, deck)) === null);

  // ── Where in the deck ─────────────────────────────────────────────────────
  console.log("\nWhere the card is allowed to sit");

  const placement = await placeSpotlightCard(wants.user.id, deck);
  check(
    `never above rank ${MIN_ORGANIC_CARDS_BEFORE_PROMOTED} — the opening stays unsold`,
    placement !== null && placement.rank >= MIN_ORGANIC_CARDS_BEFORE_PROMOTED,
    String(placement?.rank),
  );
  check(
    "a deck too short to have an unsold opening gets no card at all",
    (await placeSpotlightCard(wants.user.id, deck.slice(0, MIN_ORGANIC_CARDS_BEFORE_PROMOTED - 1))) === null,
  );
  check(
    "a profile already in the deck on merit is not sold the same slot twice",
    (await placeSpotlightCard(wants.user.id, [...deck, advertiser.profile.id])) === null,
  );

  // ── Placed is not delivered ───────────────────────────────────────────────
  console.log("\nPlaced is not delivered");

  const beforePlace = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("placing the card charges nothing against the promise", beforePlace.deliveredReach === 0);
  check("and writes no delivery row", (await prisma.spotlightDelivery.count({ where: { campaignId: campaign.id } })) === 0);

  const opened = await recordReelDeliveries(wants.user.id, [{ spotlightCampaignId: campaign.id }]);
  check("opening the deck is what counts", opened.recorded === 1);
  const afterOpen = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("reach moved by exactly one", afterOpen.deliveredReach === 1);

  const again = await recordReelDeliveries(wants.user.id, [{ spotlightCampaignId: campaign.id }]);
  check("the same person opening again counts nothing", again.recorded === 0);
  const afterRefresh = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("so reach is still one — people, not impressions", afterRefresh.deliveredReach === 1);

  check(
    "and they never see that campaign again",
    (await placeSpotlightCard(wants.user.id, deck)) === null,
  );

  // ── The daily cap ─────────────────────────────────────────────────────────
  console.log("\nOne promoted card a day, across every surface");

  const advertiser2 = await makeMember({
    name: "AdvMan2",
    gender: "Ladka",
    age: 30,
    prefs: { lookingForGender: "Ladki", minAge: 24, maxAge: 34 },
  });
  await makeCampaign({
    ownerUserId: advertiser2.user.id,
    promisedReach: 5,
    targetGender: "Ladki",
    cities: [CITY],
  });

  check(
    "a second campaign cannot reach somebody who already saw one today",
    (await placeSpotlightCard(wants.user.id, deck)) === null,
  );
  check(
    "somebody who has seen none today still gets one",
    (await placeSpotlightCard(statedNothing.user.id, deck)) !== null,
  );

  // ── Finishing ─────────────────────────────────────────────────────────────
  console.log("\nA campaign that reaches its number closes itself");

  const remaining = [tooOldForHer, wrongGender];
  for (const person of remaining) {
    await recordReelDeliveries(person.user.id, [{ spotlightCampaignId: campaign.id }]);
  }
  const finished = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("reach hit the promised number", finished.deliveredReach === 3, String(finished.deliveredReach));
  check("and the campaign is COMPLETED", finished.status === "COMPLETED");
  check("with a completion time", finished.completedAt !== null);
  check(
    "the owner was told",
    (await prisma.notice.count({ where: { userId: advertiser.user.id, kind: "SPOTLIGHT_UPDATE" } })) === 1,
  );
  check(
    "a completed campaign stops being delivered",
    (await placeSpotlightCard(statedNothing.user.id, deck)) !== null &&
      (await prisma.spotlightDelivery.count({ where: { campaignId: campaign.id } })) === 3,
  );

  // ── The counter is a cache ────────────────────────────────────────────────
  console.log("\nThe counter is a cache of the rows, and can be rebuilt from them");

  await prisma.spotlightCampaign.update({ where: { id: campaign.id }, data: { deliveredReach: 99 } });
  const recounted = await prisma.$transaction((tx) => recountDelivered(tx, campaign.id));
  check("a drifted counter is corrected from the delivery rows", recounted === 3);
  const repaired = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check("and written back", repaired.deliveredReach === 3);

  // ── The sweep: extend ─────────────────────────────────────────────────────
  console.log("\nA window that runs out with people still left to reach is extended");

  const advertiser3 = await makeMember({
    name: "AdvMan3",
    gender: "Ladka",
    age: 30,
    prefs: { lookingForGender: "Ladki", minAge: 24, maxAge: 34 },
  });
  const { campaign: expiring } = await makeCampaign({
    ownerUserId: advertiser3.user.id,
    promisedReach: 50,
    maxDays: 7,
    targetGender: "Ladki",
    cities: [CITY],
    endsAt: new Date(Date.now() - 3600_000),
  });

  const dry = await runCampaignSweep({ dryRun: true });
  check("a dry run reports the extension", dry.extended >= 1);
  const untouched = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: expiring.id } });
  check("and writes nothing", untouched.endsAt !== null && untouched.endsAt.getTime() < Date.now());

  const swept = await runCampaignSweep();
  check("the real run extends it", swept.extended >= 1);
  const extended = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: expiring.id } });
  check("the window is now in the future", extended.endsAt !== null && extended.endsAt.getTime() > Date.now());
  check("and it is still RUNNING, not quietly closed", extended.status === "RUNNING");
  check("no money moved for a campaign that can still deliver", extended.refundPaise === 0);

  // ── The sweep: end short and refund ───────────────────────────────────────
  console.log("\nA promise nobody is left to keep returns the unreached share");

  const advertiser4 = await makeMember({
    name: "AdvMan4",
    gender: "Ladka",
    age: 30,
    prefs: { lookingForGender: "Ladki", minAge: 24, maxAge: 34 },
  });
  // Targeting a city with exactly one qualifying member, then reaching them.
  const onlyPersonInTown = await makeMember({
    name: "OnlyOne",
    gender: "Ladki",
    age: 28,
    city: "TinyTown",
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  const { campaign: short, payment: shortPayment } = await makeCampaign({
    ownerUserId: advertiser4.user.id,
    promisedReach: 4,
    targetGender: "Ladki",
    cities: ["TinyTown"],
    amountPaise: 40000,
    endsAt: new Date(Date.now() - 3600_000),
  });
  await recordReelDeliveries(onlyPersonInTown.user.id, [{ spotlightCampaignId: short.id }]);

  const closed = await runCampaignSweep();
  const ended = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: short.id } });
  check("the campaign is ENDED_SHORT, not COMPLETED", ended.status === "ENDED_SHORT", ended.status);
  check("it delivered the one person who existed", ended.deliveredReach === 1);
  const owed = shortfallRefundPaise(40000, 1, 4);
  check(`three unreached quarters came back (${owed}p)`, ended.refundPaise === owed, String(ended.refundPaise));
  check("with a refund time", ended.refundedAt !== null);
  check("and the run reported it", closed.endedShort >= 1 && closed.refundedPaise >= owed);

  const paymentAfter = await prisma.payment.findUniqueOrThrow({ where: { id: shortPayment.id } });
  check("the payment records the partial refund", paymentAfter.refundedPaise === owed);
  check(
    "and is NOT marked fully REFUNDED — the buyer kept what they received",
    paymentAfter.status === "CAPTURED",
    paymentAfter.status,
  );
  check(
    "the owner was told what happened and what came back",
    (await prisma.notice.count({ where: { userId: advertiser4.user.id, kind: "SPOTLIGHT_UPDATE" } })) === 1,
  );

  const secondPass = await runCampaignSweep();
  const stillEnded = await prisma.spotlightCampaign.findUniqueOrThrow({ where: { id: short.id } });
  check("a second sweep does not refund it twice", stillEnded.refundPaise === owed);
  check("and does not count it again", secondPass.endedShort === 0);

  // ── What the viewer actually sees ─────────────────────────────────────────
  console.log("\nThe card carries its disclosure, and only the paid one does");

  const advertiser5 = await makeMember({
    name: "AdvMan5",
    gender: "Ladka",
    age: 30,
    prefs: { lookingForGender: "Ladki", minAge: 24, maxAge: 34 },
  });
  await makeCampaign({
    ownerUserId: advertiser5.user.id,
    promisedReach: 5,
    targetGender: "Ladki",
    cities: [CITY],
  });
  const viewer = await makeMember({
    name: "Viewer",
    gender: "Ladki",
    age: 28,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });

  const view = await getReelData(viewer.user.id);
  const promotedCards = view.cards.filter((c) => c.spotlight !== null);
  check("at most one promoted card in a deck", promotedCards.length <= 1);

  // Deliberately not asserted against `labelled`: several campaigns are live
  // by this point in the script, and the selector gives the slot to whichever
  // is furthest behind — so pinning the expected advertiser here would be
  // testing the fixture order rather than the feature. What has to be true is
  // that whichever card carries the label is the card of the campaign that was
  // actually delivered, and the delivery row is where that is checked from.
  const deliveries = await prisma.spotlightDelivery.findMany({
    where: { viewerUserId: viewer.user.id },
    include: { campaign: true },
  });
  check("one open produced at most one delivery", deliveries.length <= 1);
  check("a labelled card and a delivery row come together", deliveries.length === promotedCards.length);

  if (promotedCards.length === 1 && deliveries.length === 1) {
    check("it is labelled with the product's own word", promotedCards[0].spotlight?.label === SPOTLIGHT_LABEL);
    check("and carries the note behind it", Boolean(promotedCards[0].spotlight?.note));

    const advertiserProfile = await prisma.profile.findUniqueOrThrow({
      where: { userId: deliveries[0].campaign.ownerUserId },
      select: { id: true },
    });
    check(
      "the labelled card belongs to the campaign that was charged for it",
      promotedCards[0].id === advertiserProfile.id,
    );
    check(
      "it is not in the opening of the deck",
      view.cards.findIndex((c) => c.spotlight !== null) >= MIN_ORGANIC_CARDS_BEFORE_PROMOTED,
    );
    check("the delivery is recorded against the reel surface", deliveries[0].surface === "reel");
  } else {
    // Not a silent pass: a deck too thin to carry a promoted card means the
    // assertions above checked nothing, and a run that says so is worth more
    // than one that looks green.
    console.log("  note the generated deck carried no promoted card — label assertions did not run");
  }

  const reelRow = await prisma.dailyReel.findFirstOrThrow({ where: { userId: viewer.user.id } });
  check("opening the deck marks the reel opened — the estimator's own input", reelRow.openedAt !== null);

  const reopened = await getReelData(viewer.user.id);
  check(
    "reopening it delivers nothing new",
    (await prisma.spotlightDelivery.count({ where: { viewerUserId: viewer.user.id } })) === deliveries.length,
  );
  check(
    "and shows the same deck",
    reopened.cards.filter((c) => c.spotlight !== null).length === promotedCards.length,
  );

  console.log(failures === 0 ? "\nPASS" : `\n${failures} FAILED`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    // Campaigns cascade from their owner; payments and deliveries cascade too.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
