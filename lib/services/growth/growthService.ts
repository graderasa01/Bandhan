import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPlanCatalog, planFeaturesOf, planNameOf, rankOf, type PlanCatalog } from "@/lib/services/plans/planCatalog";
import type {
  AiUsageRow,
  FunnelStep,
  GateLever,
  GrowthSnapshot,
  GrowthWindow,
  MarketplaceSnapshot,
  PartnerSnapshot,
  RetentionRow,
  RevenueSnapshot,
  RishtaProgressStep,
} from "@/lib/contracts/growth";
import { RISHTA_STAGE_ORDER, stageRank } from "@/lib/profile/rishtaStages";
import { buildJourneyHealth } from "./journeyHealthService";
import type { Prisma } from "@prisma/client";
import type { PlanCode } from "@/lib/constants/plans";

/* Types re-exported so a server caller has one import; values deliberately are
   not — `GROWTH_WINDOWS` re-exported from here would let a client component
   reach it and pull this server-only module into the browser bundle. Clients
   import it from `@/lib/contracts/growth` directly. */
export type { GrowthSnapshot, GrowthWindow } from "@/lib/contracts/growth";

/**
 * Growth Console — the business half of `demandService`.
 *
 * `demandService` runs the matching pipeline backwards to tell *one user* how
 * many people they are a match for. This runs the same discipline across the
 * whole product and answers the four questions nobody could answer before:
 * where does a signup die, who comes back, where does the money come from, and
 * which locked door has the most people standing at it.
 *
 * ## The one rule
 *
 * Every number here is a count of rows that exist. No projections, no
 * modelled churn, no "estimated LTV" — same bar `demandService` holds (D-32).
 * The single derived figure on the page, gate-pressure `ceilingPaise`, is
 * plain arithmetic on a real count and is labelled as a ceiling, never as a
 * forecast: it says "if every one of these 41 people upgraded", which is a
 * sentence about today's rows, not about the future.
 *
 * ## Why no event table
 *
 * The obvious way to build a funnel is to log an event per step. This does not:
 * every step below is already implied by a row that exists for its own reasons
 * (a Profile, a SwipeAction, a Payment). An event table would be a second
 * source of truth that drifts from the first one, and it would only start
 * having data from the day it shipped — this reads history back to the first
 * signup.
 *
 * ## What this deliberately does not resolve
 *
 * Plan is read from `Subscription` only — admin entitlement overrides
 * (`UserEntitlementOverride`) and reward credits are *not* folded in. Those are
 * hand-grants and one-off unlocks; resolving them would mean running
 * `getPlanContext` per user (three queries each) to move a handful of rows.
 * The UI says so where it matters.
 */

const ACTIVE_SUB_STATUSES = ["ACTIVE", "CANCELLED"] as const;

/** A CANCELLED subscription still counts until `currentPeriodEnd` — the month was paid for. */
function activeSubWhere(now: Date): Prisma.SubscriptionWhereInput {
  return { status: { in: [...ACTIVE_SUB_STATUSES] }, currentPeriodEnd: { gt: now } };
}

/**
 * "Has no live subscription at or above `floor`" — expressed as a relation
 * filter rather than a `notIn` of user ids, so it stays one query no matter how
 * many paying members there are.
 */
function belowPlan(catalog: PlanCatalog, now: Date, floor: PlanCode): Prisma.UserWhereInput {
  // Codes are compared by rank, not by position in a fixed array — an
  // admin-created plan slots into the ladder and has to count as "at or above"
  // whatever it out-ranks.
  const floorRank = rankOf(catalog, floor);
  const atOrAbove = catalog.all.filter((p) => p.rank >= floorRank).map((p) => p.code);
  return {
    subscriptions: { none: { ...activeSubWhere(now), planCode: { in: atOrAbove } } },
  };
}

/** Real members only — admins, deleted accounts and partner-side logins are not the funnel. */
const REAL_USER: Prisma.UserWhereInput = { role: "USER", deletedAt: null };

// ============================================================
// Funnel
// ============================================================

/**
 * Each step's filter *includes every earlier step's filter*, which is what
 * makes this an actual funnel rather than seven unrelated counts that can go
 * up as you read down the page.
 *
 * Ordering note: "profile live" sits before "pehla swipe" because that is the
 * product's real sequence — the Reel is not served to a profile that isn't
 * visible. If that ever changes, this array is the thing to change.
 */
const FUNNEL_STEPS: { id: string; label: string; detail: string; where: Prisma.UserWhereInput }[] = [
  {
    id: "registered",
    label: "Register kiya",
    detail: "Is window mein bane saare member accounts.",
    where: {},
  },
  {
    id: "profileStarted",
    label: "Profile shuru ki",
    detail: "Profile row ban gayi — yaani wizard mein kam se kam ek kadam chala.",
    where: { profile: { isNot: null } },
  },
  {
    id: "profileLive",
    label: "Profile live hui",
    detail: "isVisible = true. Yahan tak nahi pahunche to unhe koi dekh hi nahi sakta.",
    where: { profile: { is: { isVisible: true } } },
  },
  {
    id: "swiped",
    label: "Pehla swipe",
    detail: "Kam se kam ek SwipeAction — Reel asli mein khuli.",
    where: { swipeActions: { some: {} } },
  },
  {
    id: "interest",
    label: "Interest bheja",
    detail: "Pehli baar khud aage badhe.",
    where: { sentInterests: { some: {} } },
  },
  {
    id: "matched",
    label: "Match bana",
    detail: "Dono taraf se haan. Yeh product ka asli 'aha' moment hai.",
    where: { OR: [{ matchesAsA: { some: {} } }, { matchesAsB: { some: {} } }] },
  },
  {
    id: "messaged",
    label: "Message bheja",
    detail: "Baat shuru hui. Chat FREE par locked hai, isliye yahan ka drop pricing ka signal hai.",
    where: { sentMessages: { some: {} } },
  },
  {
    id: "paid",
    label: "Paisa diya",
    detail: "Kam se kam ek CAPTURED payment (test gateway ke payments bhi shaamil).",
    where: { payments: { some: { status: "CAPTURED" } } },
  },
];

async function buildFunnel(from: Date): Promise<FunnelStep[]> {
  const cohort: Prisma.UserWhereInput = { ...REAL_USER, createdAt: { gte: from } };

  const counts = await Promise.all(
    FUNNEL_STEPS.map((_, i) =>
      prisma.user.count({
        where: { ...cohort, AND: FUNNEL_STEPS.slice(0, i + 1).map((s) => s.where) },
      }),
    ),
  );

  const total = counts[0] || 0;
  return FUNNEL_STEPS.map((step, i) => ({
    id: step.id,
    label: step.label,
    detail: step.detail,
    count: counts[i],
    stepPct: i === 0 ? null : pct(counts[i], counts[i - 1]),
    ofTotalPct: pct(counts[i], total),
  }));
}

// ============================================================
// Rishta progress
// ============================================================

/** Every stage at or past `floor`. A journey at MET has passed UNDERSTANDING. */
function stagesFrom(floor: Parameters<typeof stageRank>[0]) {
  return RISHTA_STAGE_ORDER.filter((s) => stageRank(s) >= stageRank(floor) && s !== "CLOSED");
}

/**
 * How far rishtey got, in this window.
 *
 * ## Why this is not `buildFunnel`
 *
 * That funnel counts *people* through signup and every step nests inside the
 * one above it, which is what lets it show a clean drop-off percentage. This
 * one cannot: an interest, a match, a confirmed stage and a meeting live in
 * four different tables and are four different units. Forcing them into one
 * nesting would produce a tidy chart that lies.
 *
 * So each row states its own unit and `stepPct` appears exactly once — between
 * matches and matches-where-both-spoke, the only adjacent pair that counts the
 * same thing and genuinely contains the next.
 *
 * ## Why the confirmed stages are counted by journey row
 *
 * A journey row is one *person's* view (see the `RishtaJourney` model), so two
 * people confirming the same rishta is two rows. That is deliberate and the
 * label says so: the question these rows answer is "how many people took this
 * step", not "how many couples", and de-duplicating pairs would require
 * inventing a couple identity the schema does not have.
 *
 * Same rule as the rest of this file: every number is a count of rows that
 * exist. Nothing here is modelled, and `settled` is never inferred — it is only
 * what somebody tapped in the closure flow.
 */
async function buildRishtaProgress(from: Date): Promise<RishtaProgressStep[]> {
  const window = { gte: from };

  const [interests, matchRows, understanding, family, met, outcomes, settled] = await Promise.all([
    prisma.interest.count({ where: { createdAt: window, status: { not: "WITHDRAWN" } } }),
    prisma.match.findMany({ where: { createdAt: window }, select: { id: true, userAId: true, userBId: true } }),
    prisma.rishtaJourney.count({
      where: { confirmedStageAt: window, confirmedStage: { in: stagesFrom("UNDERSTANDING") } },
    }),
    prisma.rishtaJourney.count({
      where: { confirmedStageAt: window, confirmedStage: { in: stagesFrom("FAMILY_INVOLVED") } },
    }),
    prisma.rishtaMeeting.count({ where: { happenedAt: window } }),
    prisma.rishtaJourney.count({ where: { outcomeAt: window } }),
    prisma.rishtaJourney.count({ where: { outcomeAt: window, outcome: { in: ["ENGAGED", "MARRIED"] } } }),
  ]);

  // "Both sides spoke" needs the two senders per match, which one aggregate
  // answers for every match at once — the per-match version is two queries each.
  const matchIds = matchRows.map((m) => m.id);
  const senderRows = matchIds.length
    ? await prisma.message.groupBy({ by: ["matchId", "senderId"], where: { matchId: { in: matchIds } } })
    : [];
  const sendersByMatch = new Map<string, Set<string>>();
  for (const r of senderRows) {
    const set = sendersByMatch.get(r.matchId) ?? new Set<string>();
    set.add(r.senderId);
    sendersByMatch.set(r.matchId, set);
  }
  const talking = matchRows.filter((m) => {
    const senders = sendersByMatch.get(m.id);
    return !!senders && senders.has(m.userAId) && senders.has(m.userBId);
  }).length;

  return [
    {
      id: "interest",
      label: "Interest gaya",
      count: interests,
      unit: "interest",
      stepPct: null,
      detail: "Is window mein bheje gaye interest. Wapas liye gaye (withdrawn) shaamil nahi.",
    },
    {
      id: "mutual",
      label: "Mutual match bana",
      count: matchRows.length,
      unit: "rishta",
      stepPct: null,
      detail: "Dono taraf se haan. Ek match do interest se banta hai, isliye upar wali row se seedha % nahi nikalta.",
    },
    {
      id: "talking",
      label: "Dono ne baat ki",
      count: talking,
      unit: "rishta",
      stepPct: pct(talking, matchRows.length),
      detail: "Isi window ke match jinme dono taraf se kam se kam ek message gaya. Ek taraf ki baat baat nahi hai.",
    },
    {
      id: "understanding",
      label: "Seriously samajh rahe hain",
      count: understanding,
      unit: "logon ne kaha",
      stepPct: null,
      detail:
        "Journey rows jo is window mein UNDERSTANDING ya usse aage confirm hui. Ek rishtey ke do log alag-alag ginege — sawaal 'kitne logon ne ye kadam liya' hai.",
    },
    {
      id: "family",
      label: "Ghar wale jud gaye",
      count: family,
      unit: "logon ne kaha",
      stepPct: null,
      detail: "Wahi ginti, FAMILY_INVOLVED ya usse aage ke liye.",
    },
    {
      id: "met",
      label: "Mil chuke",
      count: met,
      unit: "mulaqat",
      stepPct: null,
      detail: "Wo mulaqatein jinki 'ho gayi' tareekh is window mein padti hai.",
    },
    {
      id: "outcome",
      label: "Outcome darj hua",
      count: outcomes,
      unit: "rishta",
      stepPct: null,
      detail: "Band hote waqt user ne wajah chuni. Bina outcome ke band hua rishta yahan nahi aata.",
    },
    {
      id: "settled",
      label: "Sagai ya shaadi",
      count: settled,
      unit: "rishta",
      stepPct: pct(settled, outcomes),
      detail:
        "Sirf wahi jo user ne khud ENGAGED ya MARRIED mark kiya. Ye kabhi andaaze se nahi bharta — poore product ka yahi ek asli number hai.",
    },
  ];
}

// ============================================================
// Retention
// ============================================================

/**
 * Calendar-week cohorts, not per-user anniversaries.
 *
 * "Signed up in week W, came back during week W+1" is a slightly blunter
 * question than "came back on days 8-14 of their own life", and it is the one
 * that can be answered in two queries per cohort instead of pulling every
 * activity row into memory. The UI labels it exactly that way — a retention
 * number whose definition is hidden is worse than none.
 *
 * "Active" means the user *did* something (swipe, interest, message, poll
 * vote, shortlist). Deliberately not "logged in": a session can be a month
 * long, so login dates would quietly count people who never came back.
 */
function activeIn(from: Date, to: Date): Prisma.UserWhereInput {
  const range = { gte: from, lt: to };
  return {
    OR: [
      { swipeActions: { some: { createdAt: range } } },
      { sentInterests: { some: { createdAt: range } } },
      { sentMessages: { some: { createdAt: range } } },
      { shortlists: { some: { createdAt: range } } },
      { pollVotes: { some: { votedAt: range } } },
    ],
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function buildRetention(now: Date, weeks = 6): Promise<RetentionRow[]> {
  const thisWeekStart = startOfWeek(now);
  const rows: RetentionRow[] = [];

  for (let i = weeks; i >= 1; i--) {
    const start = new Date(thisWeekStart.getTime() - i * WEEK_MS);
    const end = new Date(start.getTime() + WEEK_MS);
    const cohort: Prisma.UserWhereInput = { ...REAL_USER, createdAt: { gte: start, lt: end } };

    const w1From = end;
    const w1To = new Date(end.getTime() + WEEK_MS);
    const w4From = new Date(start.getTime() + 4 * WEEK_MS);
    const w4To = new Date(w4From.getTime() + WEEK_MS);

    const [signups, week1, week4] = await Promise.all([
      prisma.user.count({ where: cohort }),
      // A week that hasn't finished yet would read as a fake drop, so it reads "—".
      w1To <= now
        ? prisma.user.count({ where: { ...cohort, AND: [activeIn(w1From, w1To)] } })
        : Promise.resolve(null),
      w4To <= now
        ? prisma.user.count({ where: { ...cohort, AND: [activeIn(w4From, w4To)] } })
        : Promise.resolve(null),
    ]);

    rows.push({ label: weekLabel(start, end), signups, week1, week4 });
  }

  return rows;
}

// ============================================================
// Revenue
// ============================================================

async function buildRevenue(now: Date, from: Date): Promise<RevenueSnapshot> {
  const [plans, subsByPlan, captured, test, refunded, failedCount, cohortSize, cohortPaid] =
    await Promise.all([
      prisma.plan.findMany({ select: { code: true, priceInPaise: true } }),
      prisma.subscription.groupBy({
        by: ["planCode"],
        where: activeSubWhere(now),
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { status: "CAPTURED", isTest: false, capturedAt: { gte: from } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { status: "CAPTURED", isTest: true, capturedAt: { gte: from } },
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { status: "REFUNDED", refundedAt: { gte: from } },
        _sum: { amountPaise: true },
      }),
      prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: from } } }),
      prisma.user.count({ where: { ...REAL_USER, createdAt: { gte: from } } }),
      prisma.user.count({
        where: {
          ...REAL_USER,
          createdAt: { gte: from },
          payments: { some: { status: "CAPTURED" } },
        },
      }),
    ]);

  const priceOf = new Map(plans.map((p) => [p.code, p.priceInPaise]));
  const countOf = new Map(subsByPlan.map((s) => [s.planCode, s._count._all]));

  // Straight from the catalog rather than a fixed four-code list: an
  // admin-created plan earns real money and has to appear in MRR.
  const catalog = await getPlanCatalog();
  const planMix = catalog.all
    .filter((p) => p.priceInPaise > 0)
    .map((p) => {
      const subscribers = countOf.get(p.code) ?? 0;
      const pricePaise = priceOf.get(p.code) ?? p.priceInPaise;
      return {
        code: p.code,
        name: p.name,
        subscribers,
        pricePaise,
        mrrPaise: subscribers * pricePaise,
      };
    });

  const payingUsers = planMix.reduce((s, p) => s + p.subscribers, 0);
  const capturedPaise = captured._sum.amountPaise ?? 0;

  return {
    mrrPaise: planMix.reduce((s, p) => s + p.mrrPaise, 0),
    payingUsers,
    planMix,
    capturedPaise,
    capturedCount: captured._count._all,
    testPaise: test._sum.amountPaise ?? 0,
    testCount: test._count._all,
    refundedPaise: refunded._sum.amountPaise ?? 0,
    failedCount,
    arpuPaise: payingUsers > 0 ? Math.round(capturedPaise / payingUsers) : 0,
    paidConversionPct: pct(cohortPaid, cohortSize),
  };
}

// ============================================================
// Marketplace health
// ============================================================

/**
 * The metric a matrimony product dies of first, and the one nothing else on
 * the admin panel shows: supply balance. A 6:1 gender ratio does not announce
 * itself in revenue for months — it announces itself as "koi reply nahi karta"
 * from the majority side, and by then the churn already happened.
 */
async function buildMarketplace(from: Date): Promise<MarketplaceSnapshot> {
  const liveWhere: Prisma.ProfileWhereInput = { isVisible: true, deletedAt: null };

  const [byGenderRaw, liveProfiles, newLiveInWindow, citiesRaw, neverReceivedInterest] =
    await Promise.all([
      prisma.profile.groupBy({ by: ["gender"], where: liveWhere, _count: { _all: true } }),
      prisma.profile.count({ where: liveWhere }),
      prisma.profile.count({ where: { ...liveWhere, createdAt: { gte: from } } }),
      prisma.profile.groupBy({
        by: ["currentCity"],
        where: { ...liveWhere, currentCity: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { currentCity: "desc" } },
        take: 8,
      }),
      prisma.profile.count({
        where: { ...liveWhere, user: { is: { gotInterests: { none: {} } } } },
      }),
    ]);

  const byGender = byGenderRaw
    .map((g) => ({ label: g.gender ?? "Nahi bataya", count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  // The app's own Hinglish option strings (lib/profile/fields.ts), not a
  // Postgres enum — so match on the value, and if it isn't there, say so with
  // a null rather than inventing a ratio out of two zeroes.
  const ladka = byGender.find((g) => g.label === "Ladka")?.count ?? 0;
  const ladki = byGender.find((g) => g.label === "Ladki")?.count ?? 0;

  return {
    liveProfiles,
    byGender,
    ratio: ladka > 0 && ladki > 0 ? Math.round((ladka / ladki) * 100) / 100 : null,
    newLiveInWindow,
    topCities: citiesRaw.map((c) => ({ city: c.currentCity ?? "—", count: c._count._all })),
    neverReceivedInterest,
  };
}

// ============================================================
// Gate pressure — the pricing lever
// ============================================================

/**
 * Who is standing at a locked door right now.
 *
 * This is the part of the console that changes decisions. Everything else says
 * what happened; this says which *single* capability is currently blocking the
 * most real people, which is the only honest way to argue about where a plan
 * boundary should sit. Every row is people who already did the work — got
 * matched, got shortlisted, received a voice note — and hit a wall we drew.
 *
 * `ceilingPaise` is people × the unlocking plan's live price. It is the
 * arithmetic ceiling of that door, stated as such. Nobody should read it as
 * expected revenue, and the UI does not present it as one.
 */
async function buildGates(now: Date): Promise<GateLever[]> {
  const catalog = await getPlanCatalog();
  const [plans, monthlyInterestSenders, todaysReels] = await Promise.all([
    prisma.plan.findMany({ select: { code: true, priceInPaise: true } }),
    prisma.interest.groupBy({
      by: ["fromUserId"],
      where: { createdAt: { gte: startOfMonth(now) } },
      _count: { _all: true },
    }),
    prisma.dailyReel.findMany({
      where: { reelDate: { gte: startOfDay(now) } },
      select: { userId: true, dailyLimit: true, _count: { select: { swipes: true } } },
    }),
  ]);

  const priceOf = new Map(plans.map((p) => [p.code, p.priceInPaise]));

  // Free tier's interest budget is the app's one anti-spam quota — the people
  // who spent all of it this month are, by definition, the people using the
  // product hardest on the plan that limits them most.
  const freeInterestCap = planFeaturesOf(catalog, "FREE").interestsPerMonth;
  const exhaustedIds = freeInterestCap
    ? monthlyInterestSenders.filter((r) => r._count._all >= freeInterestCap).map((r) => r.fromUserId)
    : [];

  const reelOutIds = todaysReels.filter((r) => r._count.swipes >= r.dailyLimit).map((r) => r.userId);

  const [chatLocked, voiceLocked, admirerBlind, viewerBlind, interestOut, reelOut] =
    await Promise.all([
      prisma.user.count({
        where: {
          ...REAL_USER,
          ...belowPlan(catalog, now, "BASIC"),
          OR: [{ matchesAsA: { some: {} } }, { matchesAsB: { some: {} } }],
        },
      }),
      prisma.user.count({
        where: {
          ...REAL_USER,
          ...belowPlan(catalog, now, "BASIC"),
          voiceNotesReceived: { some: { unlockedAt: null } },
        },
      }),
      prisma.user.count({
        where: {
          ...REAL_USER,
          ...belowPlan(catalog, now, "STANDARD"),
          profile: { is: { shortlistedBy: { some: {} } } },
        },
      }),
      prisma.user.count({
        where: {
          ...REAL_USER,
          ...belowPlan(catalog, now, "PREMIUM"),
          profile: { is: { swipedBy: { some: {} } } },
        },
      }),
      exhaustedIds.length
        ? prisma.user.count({
            where: { ...REAL_USER, ...belowPlan(catalog, now, "BASIC"), id: { in: exhaustedIds } },
          })
        : Promise.resolve(0),
      reelOutIds.length
        ? prisma.user.count({
            where: { ...REAL_USER, ...belowPlan(catalog, now, "BASIC"), id: { in: reelOutIds } },
          })
        : Promise.resolve(0),
    ]);

  // `unlockPlan` is narrowed to PlanCode here even though the contract types it
  // as string — the contract is shared with the browser bundle and must not
  // depend on a Prisma-generated enum, but inside the service the enum is what
  // keeps `PLAN_NAMES[...]` and the price lookup honest.
  const rows: (Omit<GateLever, "unlockPlan" | "unlockPlanName" | "ceilingPaise"> & {
    unlockPlan: PlanCode;
  })[] = [
    {
      id: "chat",
      label: "Match ho gaya, par chat locked hai",
      detail: "FREE members jinka kam se kam ek match hai. FREE par chat:false hai.",
      people: chatLocked,
      unlockPlan: "BASIC",
    },
    {
      id: "voice",
      label: "Voice note aayi hai, khul nahi rahi",
      detail: "FREE members jinke paas kam se kam ek locked (unlockedAt = null) voice note hai.",
      people: voiceLocked,
      unlockPlan: "BASIC",
    },
    {
      id: "admirer",
      label: "Kisi ne shortlist kiya, naam nahi dikh raha",
      detail: "FREE/BASIC members jinki profile kam se kam ek baar shortlist hui hai.",
      people: admirerBlind,
      unlockPlan: "STANDARD",
    },
    {
      id: "viewer",
      label: "Profile dekhi gayi, dekhne wale ka naam locked",
      detail: "PREMIUM se neeche ke members jinki profile par kam se kam ek swipe aayi hai.",
      people: viewerBlind,
      unlockPlan: "PREMIUM",
    },
    {
      id: "interestQuota",
      label: "Is mahine ka interest quota khatam",
      detail: `FREE members jinhone is calendar month mein ${freeInterestCap ?? 0} ya usse zyada interest bhej diye.`,
      people: interestOut,
      unlockPlan: "BASIC",
    },
    {
      id: "reelQuota",
      label: "Aaj ki Reel khatam ho gayi",
      detail: "Aaj ka daily limit poora swipe kar chuke FREE members.",
      people: reelOut,
      unlockPlan: "BASIC",
    },
  ];

  return rows
    .map((r) => ({
      ...r,
      unlockPlanName: planNameOf(catalog, r.unlockPlan),
      ceilingPaise: r.people * (priceOf.get(r.unlockPlan) ?? 0),
    }))
    .sort((a, b) => b.people - a.people);
}

// ============================================================
// Partner channel
// ============================================================

async function buildPartners(from: Date): Promise<PartnerSnapshot> {
  const paid: Prisma.UserWhereInput = { payments: { some: { status: "CAPTURED" } } };
  const cohort: Prisma.UserWhereInput = { ...REAL_USER, createdAt: { gte: from } };

  const [activePartners, referredSignups, referredPaid, organicSignups, organicPaid, owed, paidOut] =
    await Promise.all([
      // Same pair `outreachJob` treats as live: APPROVED has a code and can
      // refer, ACTIVE is the same partner after they've been switched on.
      prisma.partner.count({ where: { status: { in: ["APPROVED", "ACTIVE"] } } }),
      prisma.user.count({ where: { ...cohort, partnerReferral: { isNot: null } } }),
      prisma.user.count({ where: { ...cohort, partnerReferral: { isNot: null }, AND: [paid] } }),
      prisma.user.count({ where: { ...cohort, partnerReferral: { is: null } } }),
      prisma.user.count({ where: { ...cohort, partnerReferral: { is: null }, AND: [paid] } }),
      prisma.partnerCommission.aggregate({
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountPaise: true },
      }),
      prisma.partnerCommission.aggregate({
        where: { status: "PAID" },
        _sum: { amountPaise: true },
      }),
    ]);

  const refConv = pct(referredPaid, referredSignups);
  const orgConv = pct(organicPaid, organicSignups);

  return {
    activePartners,
    referredSignups,
    referredPaid,
    organicSignups,
    organicPaid,
    // Only meaningful once both sides have someone in them — a "+100pp lift"
    // off three referred signups is noise dressed as a result.
    liftPoints:
      referredSignups >= 5 && organicSignups >= 5 ? Math.round((refConv - orgConv) * 10) / 10 : null,
    commissionOwedPaise: owed._sum.amountPaise ?? 0,
    commissionPaidPaise: paidOut._sum.amountPaise ?? 0,
  };
}

// ============================================================
// AI usage
// ============================================================

async function buildAi(from: Date): Promise<AiUsageRow[]> {
  const [rows, blockedRows] = await Promise.all([
    prisma.aiInteraction.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.aiInteraction.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: from }, wasBlocked: true },
      _count: { _all: true },
    }),
  ]);

  const blockedOf = new Map(blockedRows.map((r) => [r.feature, r._count._all]));

  return rows
    .map((r) => ({
      feature: r.feature,
      calls: r._count._all,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      blocked: blockedOf.get(r.feature) ?? 0,
    }))
    .sort((a, b) => b.calls - a.calls);
}

// ============================================================
// Entry point
// ============================================================

export async function getGrowthSnapshot(windowDays: GrowthWindow): Promise<GrowthSnapshot> {
  const now = new Date();
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [funnel, rishta, journey, retention, revenue, marketplace, gates, partners, ai] = await Promise.all([
    buildFunnel(from),
    buildRishtaProgress(from),
    // Phase 7 — the §14 metrics nothing reported. Lives in its own file rather
    // than here because it asks a different question of the same rows: not
    // "how many moved" but "are the ones that exist being worked".
    buildJourneyHealth(from),
    buildRetention(now),
    buildRevenue(now, from),
    buildMarketplace(from),
    buildGates(now),
    buildPartners(from),
    buildAi(from),
  ]);

  return {
    generatedAt: now.toISOString(),
    windowDays,
    windowFrom: from.toISOString(),
    funnel,
    rishta,
    journey,
    retention,
    revenue,
    marketplace,
    gates,
    partners,
    ai,
  };
}

// ============================================================
// Small helpers
// ============================================================

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Weeks start Monday — the same convention the rest of the product's copy uses. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const dow = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - dow * 24 * 60 * 60 * 1000);
}

function weekLabel(start: Date, end: Date): string {
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(new Date(end.getTime() - 1))}`;
}
