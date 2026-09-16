import "./_env";
import { prisma } from "../lib/db/prisma";
import { checkCampaignEligibility, loadAdvertiserFacts } from "../lib/services/spotlight/eligibility";
import { estimateCampaign, resolveExclusions, validateSpec, audienceWhere } from "../lib/services/spotlight/audience";
import { getMyCampaigns } from "../lib/services/spotlight/campaignService";
import {
  listSpotlightRefundQueue,
  markSpotlightRefunded,
  pickSpotlightForViewer,
  recordSpotlightDelivery,
  refreshOwnerCampaigns,
  settleExpiredCampaigns,
  SpotlightSlotGone,
} from "../lib/services/spotlight/deliveryService";
import { createItemCheckout, quoteItem } from "../lib/services/items/itemPurchaseService";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import { getItemCatalog, itemOf } from "../lib/services/items/itemCatalog";
import {
  MIN_AUDIENCE_TO_SELL,
  MIN_PROFILE_COMPLETION,
  MIN_TRUST_SCORE,
  SPOTLIGHT_DELIVERY_LIVE,
} from "../lib/services/spotlight/spotlightPolicy";
import type { SpotlightCampaignConfig } from "../lib/constants/serviceItems";

/**
 * Spotlight — the eligibility gate, the two-way audience filter, the capacity
 * estimate, what a captured campaign payment starts, and (D-90 Phase 6) that a
 * campaign is really delivered: one counted row per person, never twice,
 * completed at its promise, closed when its window ends, queued for a refund
 * when it fell short, and paused when its owner stops clearing the bar.
 *
 * Never calls a gateway on the happy path. `createItemCheckout` reaches
 * Razorpay, and this machine is configured with live keys — so the purchase is
 * only exercised through its *refusal* (which returns before any order is
 * created: targeting, eligibility, one-campaign-at-a-time and the audience
 * estimate all run first), and the capture is exercised by writing a Payment
 * row straight into the local DB and handing it to `handleGatewayEvent`,
 * exactly as items-check.ts does.
 *
 * Delivery is exercised without generating a real reel: that would call the
 * AI explanation for every card. The pick and the count are the functions the
 * reel generator calls, run against reel rows written here.
 *
 * Run: `npx tsx scripts/spotlight-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CITY = "SpotlightTestPur";
const PACK = "REACH_50";
const DAY_MS = 86_400_000;
const stamp = Date.now();
const createdUserIds: string[] = [];

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
  ready?: boolean;
}) {
  const user = await prisma.user.create({
    data: {
      fullName: opts.name,
      email: `spotlight-${opts.name.replace(/\W/g, "")}-${stamp}@local.test`,
      passwordHash: "x",
      status: "ACTIVE",
      emailVerifiedAt: opts.ready ? new Date() : null,
    },
  });
  createdUserIds.push(user.id);

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      gender: opts.gender,
      dateOfBirth: dobForAge(opts.age),
      currentCity: opts.city === undefined ? CITY : opts.city,
      isVisible: true,
      profileStatus: "VERIFIED",
      fullProfileCompletionScore: opts.ready ? 90 : 10,
      trustScore: opts.ready ? 70 : 10,
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

  if (opts.ready) {
    await prisma.profilePhoto.create({
      data: { profileId: profile.id, fileUrl: "https://local.test/p.jpg", storageKey: `k-${profile.id}` },
    });
  }

  return { user, profile };
}

async function main() {
  console.log("\nEligibility — a fresh account is told exactly what is missing");

  const bare = await makeMember({ name: "BareUser", gender: "Ladka", age: 30, prefs: null, ready: false });
  const bareCheck = await checkCampaignEligibility(bare.user.id);
  check("a bare account is not eligible", bareCheck.eligible === false);
  check("it names a first blocker", bareCheck.firstBlocker !== null);
  check(
    "completion is one of the unmet requirements",
    bareCheck.requirements.some((r) => r.key === "completion" && !r.met),
  );
  check(
    "every unmet requirement that can be fixed offers a link",
    bareCheck.requirements.filter((r) => !r.met && r.key !== "noComplaints" && r.key !== "account").every((r) => Boolean(r.fixHref)),
  );
  check(
    `the completion bar is stated as ${MIN_PROFILE_COMPLETION}%`,
    bareCheck.requirements.some((r) => r.key === "completion" && r.label.includes(String(MIN_PROFILE_COMPLETION))),
  );
  check(
    `the trust bar is stated as ${MIN_TRUST_SCORE}`,
    bareCheck.requirements.some((r) => r.key === "trust" && r.label.includes(String(MIN_TRUST_SCORE))),
  );

  console.log("\nA fully prepared account clears the bar");

  const advertiser = await makeMember({
    name: "Advertiser",
    gender: "Ladka",
    age: 30,
    prefs: { lookingForGender: "Ladki", minAge: 24, maxAge: 34 },
    ready: true,
  });
  const readyCheck = await checkCampaignEligibility(advertiser.user.id);
  check("eligible", readyCheck.eligible === true, readyCheck.firstBlocker?.label ?? "");

  console.log("\nA safety complaint takes eligibility away again");

  const complainer = await makeMember({ name: "Complainer", gender: "Ladki", age: 28, prefs: null });
  const report = await prisma.contentReport.create({
    data: {
      reporterUserId: complainer.user.id,
      reportedUserId: advertiser.user.id,
      targetType: "PROFILE",
      targetId: advertiser.profile.id,
      reason: "test",
      status: "OPEN",
    },
  });
  check("not eligible while a complaint is open", (await checkCampaignEligibility(advertiser.user.id)).eligible === false);
  await prisma.contentReport.update({ where: { id: report.id }, data: { status: "DISMISSED" } });
  check(
    "a dismissed complaint does not count against them",
    (await checkCampaignEligibility(advertiser.user.id)).eligible === true,
  );

  console.log("\nThe audience filter runs both ways");

  const facts = await loadAdvertiserFacts(advertiser.user.id);
  check("advertiser facts load", facts !== null);
  if (!facts) throw new Error("no advertiser facts");
  check("age is derived, not stored", facts.age === 30, `got ${facts.age}`);

  const wanted = await makeMember({
    name: "WantsHim",
    gender: "Ladki",
    age: 27,
    prefs: { lookingForGender: "Ladka", minAge: 28, maxAge: 35 },
  });
  const wrongGenderPref = await makeMember({
    name: "WantsLadki",
    gender: "Ladki",
    age: 27,
    prefs: { lookingForGender: "Ladki", minAge: 20, maxAge: 40 },
  });
  const tooYoungForHim = await makeMember({
    name: "WantsYounger",
    gender: "Ladki",
    age: 27,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 26 },
  });
  const noPrefs = await makeMember({ name: "NoPrefs", gender: "Ladki", age: 27, prefs: null });
  const swiper = await makeMember({
    name: "AlreadySwiped",
    gender: "Ladki",
    age: 27,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  const blocker = await makeMember({
    name: "Blocked",
    gender: "Ladki",
    age: 27,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  const otherCity = await makeMember({
    name: "OtherCity",
    gender: "Ladki",
    age: 27,
    city: "SomewhereElse",
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });

  await prisma.swipeAction.create({
    data: { actorUserId: swiper.user.id, targetProfileId: advertiser.profile.id, direction: "LEFT" },
  });
  await prisma.userBlock.create({
    data: { blockerUserId: blocker.user.id, blockedUserId: advertiser.user.id },
  });

  const specResult = validateSpec({ cities: [CITY], minAge: 24, maxAge: 34, targetGender: "Ladki" });
  check("the spec validates", specResult.ok === true);
  if (!specResult.ok) throw new Error(specResult.message);
  const spec = specResult.spec;

  const exclusions = await resolveExclusions(facts);
  const pool = await prisma.profile.findMany({
    where: audienceWhere(facts, spec, exclusions),
    select: { userId: true },
  });
  const poolIds = new Set(pool.map((p) => p.userId));

  check("someone whose preferences fit him is in the pool", poolIds.has(wanted.user.id));
  check("someone with no preferences at all is in the pool", poolIds.has(noPrefs.user.id));
  check("someone looking for a Ladki is NOT in the pool", !poolIds.has(wrongGenderPref.user.id));
  check("someone whose max age is below his is NOT in the pool", !poolIds.has(tooYoungForHim.user.id));
  check("someone who already swiped him is NOT in the pool", !poolIds.has(swiper.user.id));
  check("someone who blocked him is NOT in the pool", !poolIds.has(blocker.user.id));
  check("another city is NOT in the pool when a city was chosen", !poolIds.has(otherCity.user.id));
  check("he is not in his own pool", !poolIds.has(advertiser.user.id));

  const wideSpec = validateSpec({ cities: [], minAge: 24, maxAge: 34, targetGender: "Ladki" });
  if (!wideSpec.ok) throw new Error(wideSpec.message);
  const widePool = await prisma.profile.findMany({
    where: audienceWhere(facts, wideSpec.spec, exclusions),
    select: { userId: true },
  });
  check(
    "dropping the city filter widens the pool",
    widePool.some((p) => p.userId === otherCity.user.id),
  );

  console.log("\nThe estimate refuses what cannot be delivered");

  const item = itemOf(await getItemCatalog(), PACK);
  check(`${PACK} is a campaign pack in the catalog`, item !== null && item.kind === "SPOTLIGHT_CAMPAIGN");
  if (!item) throw new Error("no campaign pack");
  const config = item.config as SpotlightCampaignConfig;

  const estimate = await estimateCampaign(facts, spec, config.reach, config.maxDays);
  check("it counts the same pool the delivery query would", estimate.eligibleCount === poolIds.size, `${estimate.eligibleCount} vs ${poolIds.size}`);
  check("a tiny audience cannot be sold", estimate.canDeliver === false);
  check(
    `and the reason names the ${MIN_AUDIENCE_TO_SELL}-person floor`,
    estimate.blockers.some((b) => b.includes(String(MIN_AUDIENCE_TO_SELL))),
    estimate.blockers.join(" | "),
  );

  console.log(
    SPOTLIGHT_DELIVERY_LIVE
      ? "\nDelivery is live — a pack can be quoted"
      : "\nNothing delivers a campaign yet — no pack is sold (D-90)",
  );

  const quote = await quoteItem(advertiser.user.id, PACK);
  if (SPOTLIGHT_DELIVERY_LIVE) {
    check("an eligible member can get a quote", quote.ok === true, quote.ok ? "" : quote.message);
  } else {
    check("the quote is refused", quote.ok === false);
    check(
      "and the refusal says it is not ready",
      quote.ok === false && quote.message.includes("taiyaar nahi"),
      quote.ok === false ? quote.message : "",
    );
  }

  console.log("\nCheckout refuses before it ever reaches a gateway");

  const refused = await createItemCheckout(advertiser.user.id, PACK, { campaign: spec });
  check("the purchase is refused", refused.ok === false);
  check("no payment row was created", (await prisma.payment.count({ where: { userId: advertiser.user.id } })) === 0);
  check("no campaign row was created", (await prisma.spotlightCampaign.count({ where: { ownerUserId: advertiser.user.id } })) === 0);

  const noSpec = await createItemCheckout(advertiser.user.id, PACK, {});
  check("a campaign pack without targeting is refused", noSpec.ok === false);

  console.log("\nA captured campaign payment starts the campaign it paid for");

  const orderId = `test_order_spotlight_${stamp}`;
  const payment = await prisma.payment.create({
    data: {
      userId: advertiser.user.id,
      kind: "ITEM",
      planCode: null,
      itemCode: PACK,
      amountPaise: item.priceInPaise,
      status: "CREATED",
      externalOrderId: orderId,
      isTest: true,
    },
  });
  const draft = await prisma.spotlightCampaign.create({
    data: {
      ownerUserId: advertiser.user.id,
      itemCode: PACK,
      paymentId: payment.id,
      status: "DRAFT",
      cities: spec.cities,
      minAge: spec.minAge,
      maxAge: spec.maxAge,
      targetGender: spec.targetGender,
      promisedReach: config.reach,
      maxDays: config.maxDays,
    },
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { itemRefId: draft.id } });

  const before = new Date();
  const outcome = await handleGatewayEvent({
    orderId,
    paymentId: `pay_${stamp}`,
    status: "CAPTURED",
    amountPaise: item.priceInPaise,
  });
  check("the capture is handled", outcome.handled === true && outcome.action === "captured");

  const live = await prisma.spotlightCampaign.findUnique({ where: { id: draft.id } });
  check("the campaign is RUNNING", live?.status === "RUNNING");
  check("it has a start", live?.startsAt !== null);
  check(
    `its window is the pack's ${config.maxDays} days`,
    live?.endsAt
      ? Math.abs((live.endsAt.getTime() - before.getTime()) / DAY_MS - config.maxDays) < 0.1
      : false,
  );
  check("nothing has been delivered yet, and it says 0", live?.deliveredReach === 0);
  check("no subscription came out of a campaign payment", (await prisma.subscription.count({ where: { userId: advertiser.user.id } })) === 0);
  check("no commission either", (await prisma.partnerCommission.count({ where: { userId: advertiser.user.id } })) === 0);

  const notices = await prisma.notice.findMany({ where: { userId: advertiser.user.id } });
  check("the buyer was told", notices.length === 1 && notices[0]?.href === "/user/spotlight");
  if (SPOTLIGHT_DELIVERY_LIVE) {
    check(
      "the notice says how the profile will be shown — as a labelled card",
      notices.length === 1 && notices[0]!.body.includes("Spotlight") && !notices[0]!.body.includes("shuru nahi"),
      notices[0]?.body ?? "",
    );
  } else {
    // The notice must not claim a delivery nobody performs.
    check(
      "the notice does not claim a delivery nobody performs",
      notices.length === 1 && !notices[0]!.body.includes("pahunch rahi") && notices[0]!.body.includes("shuru nahi"),
      notices[0]?.body ?? "",
    );
  }

  console.log("\nA redelivered webhook does not restart it");

  const endsAtBefore = live?.endsAt?.getTime();
  const replay = await handleGatewayEvent({
    orderId,
    paymentId: `pay_${stamp}`,
    status: "CAPTURED",
    amountPaise: item.priceInPaise,
  });
  check("recognised as duplicate", replay.handled && replay.action === "duplicate");
  const afterReplay = await prisma.spotlightCampaign.findUnique({ where: { id: draft.id } });
  check("the window did not move", afterReplay?.endsAt?.getTime() === endsAtBefore);

  console.log("\nOne campaign at a time");

  const second = await createItemCheckout(advertiser.user.id, PACK, { campaign: spec });
  check("a second campaign is refused while one is live", second.ok === false);
  // While delivery is not live the sale is closed before the one-at-a-time
  // rule is even reached, so the refusal names that instead.
  check(
    "and the reason says so",
    second.ok === false &&
      (SPOTLIGHT_DELIVERY_LIVE ? second.message.includes("pehle se chal raha") : second.message.includes("taiyaar nahi")),
    second.ok === false ? second.message : "",
  );

  console.log("\nA failed payment retires its draft");

  const failOrder = `test_order_spotlight_fail_${stamp}`;
  const failPayment = await prisma.payment.create({
    data: {
      userId: bare.user.id,
      kind: "ITEM",
      planCode: null,
      itemCode: PACK,
      amountPaise: item.priceInPaise,
      status: "CREATED",
      externalOrderId: failOrder,
      isTest: true,
    },
  });
  const failDraft = await prisma.spotlightCampaign.create({
    data: {
      ownerUserId: bare.user.id,
      itemCode: PACK,
      paymentId: failPayment.id,
      status: "DRAFT",
      cities: [],
      minAge: 24,
      maxAge: 34,
      targetGender: "Ladki",
      promisedReach: config.reach,
      maxDays: config.maxDays,
    },
  });
  await handleGatewayEvent({
    orderId: failOrder,
    paymentId: `pay_fail_${stamp}`,
    status: "FAILED",
    amountPaise: item.priceInPaise,
    failureReason: "test",
  });
  check(
    "the draft is CANCELLED, not left looking un-started",
    (await prisma.spotlightCampaign.findUnique({ where: { id: failDraft.id } }))?.status === "CANCELLED",
  );

  console.log("\nThe owner sees their own campaign");

  const mine = await getMyCampaigns(advertiser.user.id);
  check("it appears on their list", mine.some((c) => c.id === draft.id));
  check("with the targeting they chose", mine[0]?.cities.join(",") === CITY);

  if (!SPOTLIGHT_DELIVERY_LIVE) {
    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
    return;
  }

  console.log("\nDelivery — who can be picked");

  // A promise small enough to fill here: two people.
  await prisma.spotlightCampaign.update({ where: { id: draft.id }, data: { promisedReach: 2 } });
  const extra = await makeMember({
    name: "AlsoWantsHim",
    gender: "Ladki",
    age: 27,
    prefs: { lookingForGender: "Ladka", minAge: 20, maxAge: 40 },
  });
  const organic = ["organic-1", "organic-2", "organic-3"];
  const viewerOf = (m: { user: { id: string }; profile: { id: string } }, organicProfileIds = organic) => ({
    viewerUserId: m.user.id,
    viewerProfileId: m.profile.id,
    organicProfileIds,
    poolFilters: null,
  });

  check(
    "a reel with fewer than three organic cards gets no paid card",
    (await pickSpotlightForViewer(viewerOf(wanted, organic.slice(0, 2)))) === null,
  );
  check(
    "a STRICT viewer never gets one",
    (await pickSpotlightForViewer({
      ...viewerOf(wanted),
      poolFilters: { filterMode: "STRICT", verifiedOnly: false, minTrustScore: null },
    })) === null,
  );
  check(
    "a viewer whose own trust floor is above his does not get him",
    (await pickSpotlightForViewer({
      ...viewerOf(wanted),
      poolFilters: { filterMode: "FLEXIBLE", verifiedOnly: false, minTrustScore: 80 },
    })) === null,
  );
  check("someone outside the audience is never picked", (await pickSpotlightForViewer(viewerOf(wrongGenderPref))) === null);
  check("someone who already swiped him is never picked", (await pickSpotlightForViewer(viewerOf(swiper))) === null);
  check("someone who blocked him is never picked", (await pickSpotlightForViewer(viewerOf(blocker))) === null);
  check(
    "not when he is already in their reel on his own",
    (await pickSpotlightForViewer(viewerOf(wanted, [...organic, advertiser.profile.id]))) === null,
  );

  const pick1 = await pickSpotlightForViewer(viewerOf(wanted));
  check(
    "a member in the audience is picked, for his campaign",
    pick1?.campaignId === draft.id && pick1.profileId === advertiser.profile.id,
    JSON.stringify(pick1),
  );

  console.log("\nDelivery — counted once per person, in the reel's own transaction");

  const now0 = new Date();
  const todayUtc = new Date(Date.UTC(now0.getUTCFullYear(), now0.getUTCMonth(), now0.getUTCDate()));
  const deliver = async (viewerUserId: string, campaignId: string, reelDate = todayUtc) => {
    const reel = await prisma.dailyReel.create({
      data: {
        userId: viewerUserId,
        reelDate,
        dailyLimit: 16,
        candidates: {
          create: [{ profileId: advertiser.profile.id, rank: 3, trustScoreFactor: 0, recentActivityScore: 0, finalScore: 0 }],
        },
      },
      select: { candidates: { select: { id: true } } },
    });
    return prisma.$transaction((tx) =>
      recordSpotlightDelivery(tx, {
        campaignId,
        viewerUserId,
        dailyReelProfileId: reel.candidates[0]!.id,
        now: new Date(),
      }),
    );
  };

  const first = await deliver(wanted.user.id, draft.id);
  const afterOne = await prisma.spotlightCampaign.findUnique({ where: { id: draft.id } });
  check("deliveredReach moved to 1 — a counted row, not a guess", afterOne?.deliveredReach === 1, String(afterOne?.deliveredReach));
  check(
    "the delivery row exists, tied to the reel card",
    (await prisma.spotlightDelivery.count({
      where: { campaignId: draft.id, viewerUserId: wanted.user.id, dailyReelProfileId: { not: null } },
    })) === 1,
  );
  check("the promise is not met yet", first.completed === false && afterOne?.status === "RUNNING");
  check("the same member is not picked again", (await pickSpotlightForViewer(viewerOf(wanted))) === null);

  const dup = await deliver(wanted.user.id, draft.id, new Date(todayUtc.getTime() - DAY_MS)).then(
    () => "written",
    () => "refused",
  );
  check("a second delivery to the same member is refused by the database", dup === "refused");
  check(
    "and the refused write counted nothing",
    (await prisma.spotlightCampaign.findUnique({ where: { id: draft.id } }))?.deliveredReach === 1,
  );

  const pick2 = await pickSpotlightForViewer(viewerOf(noPrefs));
  check("a second member in the audience is picked", pick2?.campaignId === draft.id);
  const secondDelivery = await deliver(noPrefs.user.id, draft.id);
  const full = await prisma.spotlightCampaign.findUnique({ where: { id: draft.id } });
  check(
    "the second person completes the promise",
    secondDelivery.completed === true && full?.status === "COMPLETED" && full.deliveredReach === 2,
    `${full?.status} ${full?.deliveredReach}`,
  );
  check("and the completion is stamped", full?.completedAt instanceof Date);

  const late = await deliver(extra.user.id, draft.id).then(
    () => "written",
    (err) => (err instanceof SpotlightSlotGone ? "gone" : String(err)),
  );
  check("a completed campaign cannot be delivered again", late === "gone", late);
  check("and nobody else is picked for it", (await pickSpotlightForViewer(viewerOf(extra))) === null);
  check("a fully delivered campaign never enters the refund queue", !(await listSpotlightRefundQueue()).some((r) => r.campaignId === draft.id));

  console.log("\nA window that runs out settles on read, and a shortfall is queued for a refund");

  const shortPayment = await prisma.payment.create({
    data: {
      userId: advertiser.user.id,
      kind: "ITEM",
      itemCode: PACK,
      amountPaise: 10_000,
      status: "CAPTURED",
      externalOrderId: `test_order_spotlight_short_${stamp}`,
      externalPaymentId: `pay_short_${stamp}`,
      isTest: true,
      capturedAt: new Date(),
    },
  });
  const expired = await prisma.spotlightCampaign.create({
    data: {
      ownerUserId: advertiser.user.id,
      itemCode: PACK,
      paymentId: shortPayment.id,
      status: "RUNNING",
      cities: spec.cities,
      minAge: spec.minAge,
      maxAge: spec.maxAge,
      targetGender: spec.targetGender,
      promisedReach: 10,
      maxDays: 7,
      deliveredReach: 3,
      startsAt: new Date(Date.now() - 8 * DAY_MS),
      endsAt: new Date(Date.now() - DAY_MS),
    },
  });
  await settleExpiredCampaigns(new Date(), advertiser.user.id);
  check("the ended window is COMPLETED", (await prisma.spotlightCampaign.findUnique({ where: { id: expired.id } }))?.status === "COMPLETED");
  check(
    "and the owner was told the real number",
    (await prisma.notice.count({ where: { userId: advertiser.user.id, relatedId: `spotlight-complete:${expired.id}` } })) === 1,
  );

  const queued = (await listSpotlightRefundQueue()).find((r) => r.campaignId === expired.id);
  check("the shortfall is in the refund queue", Boolean(queued));
  check("with 70% of what was paid as the refund (7 of 10 people missing)", queued?.suggestedRefundPaise === 7_000, String(queued?.suggestedRefundPaise));
  check("and the gateway id to find it by", queued?.paymentRef === `pay_short_${stamp}`);
  check(
    "marking it refunded takes it off the list",
    (await markSpotlightRefunded(expired.id, "rfnd_test")) &&
      !(await listSpotlightRefundQueue()).some((r) => r.campaignId === expired.id),
  );

  console.log("\nAn owner who stops clearing the bar is paused, not shown — and resumes once fixed");

  const pausable = await prisma.spotlightCampaign.create({
    data: {
      ownerUserId: advertiser.user.id,
      itemCode: PACK,
      status: "RUNNING",
      cities: spec.cities,
      minAge: spec.minAge,
      maxAge: spec.maxAge,
      targetGender: spec.targetGender,
      promisedReach: 5,
      maxDays: 7,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * DAY_MS),
    },
  });
  const complaint = await prisma.contentReport.create({
    data: {
      reporterUserId: complainer.user.id,
      reportedUserId: advertiser.user.id,
      targetType: "PROFILE",
      targetId: advertiser.profile.id,
      reason: "test again",
      status: "OPEN",
    },
  });
  check("an owner with an open complaint is not shown", (await pickSpotlightForViewer(viewerOf(extra))) === null);
  const pausedRow = await prisma.spotlightCampaign.findUnique({ where: { id: pausable.id } });
  check(
    "and the campaign is PAUSED, with the reason",
    pausedRow?.status === "PAUSED" && Boolean(pausedRow.pausedReason),
    `${pausedRow?.status} ${pausedRow?.pausedReason}`,
  );

  await prisma.contentReport.update({ where: { id: complaint.id }, data: { status: "DISMISSED" } });
  await refreshOwnerCampaigns(advertiser.user.id);
  check(
    "clearing the bar again resumes it",
    (await prisma.spotlightCampaign.findUnique({ where: { id: pausable.id } }))?.status === "RUNNING",
  );

  console.log("\nOne paid card a day per member");

  check(
    "a member already shown a card today gets no second one",
    (await pickSpotlightForViewer(viewerOf(wanted))) === null,
  );
  check(
    "while a member not shown one today still can be",
    (await pickSpotlightForViewer(viewerOf(extra)))?.campaignId === pausable.id,
  );

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    for (const id of createdUserIds) await prisma.user.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
