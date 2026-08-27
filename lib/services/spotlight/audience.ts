import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import {
  ACTIVITY_LOOKBACK_DAYS,
  MAX_PROMOTED_PER_VIEWER_PER_DAY,
  MAX_TARGET_AGE,
  MIN_AUDIENCE_TO_SELL,
  MIN_TARGET_AGE,
  isTargetGender,
} from "./spotlightPolicy";
import type { AdvertiserFacts } from "./eligibility";

/**
 * Who a campaign may be shown to, and how long reaching them would actually
 * take.
 *
 * ## One query, two callers
 *
 * `audienceWhere` is built here and nowhere else. The estimator quotes a
 * number off it before the buyer pays, and the delivery selector will pick
 * cards off the same `where` afterwards. Written twice, they drift, and the
 * failure mode of drift is a promise the app then cannot keep — the buyer was
 * quoted one pool and served out of another.
 *
 * ## The filter runs both ways
 *
 * The buyer picks cities, an age band and a gender. That narrows the pool; it
 * does not define it. A member only enters the pool if the *buyer* also clears
 * that member's own stated preferences — the gender they said they are looking
 * for, and the age band they said they want. Money can widen who sees you. It
 * can never place you in front of someone who already said they did not want
 * someone like you, and that is the line that makes a paid slot defensible at
 * all.
 *
 * City preference is deliberately not part of the reverse check.
 * `preferredCities` is a wish about where a partner lives, not a boundary
 * people treat as absolute, and enforcing it as one would empty most pools
 * without anyone having asked for that.
 *
 * ## Why capacity is quoted, not just audience size
 *
 * "340 people match" is not the same as "we can reach 150 of them in 7 days".
 * A member can be shown at most one promoted card a day
 * (`MAX_PROMOTED_PER_VIEWER_PER_DAY`), so the daily ceiling is however many of
 * that audience actually open the app. In a small city the pack's own window
 * runs out long before the reach does, and the buyer has to be told that
 * *before* paying rather than refunded afterwards.
 */

export interface CampaignSpec {
  /** Empty = anywhere. */
  cities: string[];
  minAge: number;
  maxAge: number;
  /** Whom to show the profile to. */
  targetGender: string;
}

export type SpecValidation = { ok: true; spec: CampaignSpec } | { ok: false; message: string };

/** Server-side, because the buy form's own checks are a convenience and not the boundary. */
export function validateSpec(raw: {
  cities?: unknown;
  minAge?: unknown;
  maxAge?: unknown;
  targetGender?: unknown;
}): SpecValidation {
  const minAge = Number(raw.minAge);
  const maxAge = Number(raw.maxAge);
  if (!Number.isInteger(minAge) || !Number.isInteger(maxAge)) {
    return { ok: false, message: "Umar poore number me likhein." };
  }
  if (minAge < MIN_TARGET_AGE || maxAge > MAX_TARGET_AGE || minAge > maxAge) {
    return { ok: false, message: `Umar ${MIN_TARGET_AGE} se ${MAX_TARGET_AGE} ke beech honi chahiye.` };
  }
  if (typeof raw.targetGender !== "string" || !isTargetGender(raw.targetGender)) {
    return { ok: false, message: "Kise dikhani hai — ye chunna zaroori hai." };
  }
  const cities = Array.isArray(raw.cities)
    ? [...new Set(raw.cities.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim()))]
    : [];
  if (cities.length > 10) return { ok: false, message: "Ek baar me zyada se zyada 10 city chun sakte hain." };

  return { ok: true, spec: { cities, minAge, maxAge, targetGender: raw.targetGender } };
}

function dobRangeForAges(minAge: number, maxAge: number) {
  const now = new Date();
  // Someone who is exactly `minAge` was born on or before today minus minAge years.
  const maxDob = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  const minDob = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1);
  return { minDob, maxDob };
}

/**
 * The pool, as a Prisma `where`.
 *
 * `excludeUserIds` carries three separate exclusions the caller has already
 * resolved — blocks in either direction, and anyone who has already swiped the
 * advertiser's card. All three are "this person has already had their say",
 * and paying must not undo any of them.
 */
export function audienceWhere(
  advertiser: AdvertiserFacts,
  spec: CampaignSpec,
  excludeUserIds: string[],
): Prisma.ProfileWhereInput {
  const { minDob, maxDob } = dobRangeForAges(spec.minAge, spec.maxAge);

  return {
    userId: { notIn: [advertiser.userId, ...excludeUserIds] },
    isVisible: true,
    profileStatus: { in: ["SUBMITTED", "VERIFIED"] },
    deletedAt: null,
    gender: spec.targetGender,
    dateOfBirth: { gte: minDob, lte: maxDob },
    ...(spec.cities.length > 0 ? { currentCity: { in: spec.cities } } : {}),

    // The reverse half of the filter. A member with no preferences row has
    // stated nothing, so nothing of theirs is being overridden — they stay in.
    OR: [
      { partnerPreferences: { is: null } },
      {
        partnerPreferences: {
          is: {
            AND: [
              { OR: [{ lookingForGender: null }, { lookingForGender: advertiser.gender }] },
              { OR: [{ minAge: null }, { minAge: { lte: advertiser.age } }] },
              { OR: [{ maxAge: null }, { maxAge: { gte: advertiser.age } }] },
            ],
          },
        },
      },
    ],
  };
}

/** Blocks, plus everyone who has already swiped this profile. */
export async function resolveExclusions(advertiser: AdvertiserFacts): Promise<string[]> {
  const [blocked, alreadySwiped] = await Promise.all([
    getBlockedUserIds(advertiser.userId),
    // Explicit id list rather than a nested `none` on the viewer side: there is
    // no "swipes I made" relation on Profile, only on User, and resolving it
    // through the relation turns a small indexed read into a correlated
    // subquery on every audience count.
    prisma.swipeAction.findMany({
      where: { targetProfileId: advertiser.profileId },
      select: { actorUserId: true },
      distinct: ["actorUserId"],
    }),
  ]);
  return [...new Set([...blocked, ...alreadySwiped.map((s) => s.actorUserId)])];
}

export interface CampaignEstimate {
  /** People who could ever be shown this campaign. */
  eligibleCount: number;
  /** Of those, how many open the app on an average day. */
  avgDailyOpeners: number;
  /** How long delivering `promisedReach` would take. Null when nobody opens. */
  projectedDays: number | null;
  /** Other campaigns live right now, sharing the same daily inventory. */
  runningCampaigns: number;
  /** True when the pool is big enough to owe this reach at all. */
  canDeliver: boolean;
  /** True when `projectedDays` fits inside the pack's own window. */
  withinWindow: boolean;
  /** Plain sentences for whatever is wrong. Empty when the pack can be sold. */
  blockers: string[];
  /** Softer notes — true, worth saying, not a reason to refuse. */
  warnings: string[];
}

export async function estimateCampaign(
  advertiser: AdvertiserFacts,
  spec: CampaignSpec,
  promisedReach: number,
  maxDays: number,
): Promise<CampaignEstimate> {
  const exclusions = await resolveExclusions(advertiser);
  const where = audienceWhere(advertiser, spec, exclusions);

  const audience = await prisma.profile.findMany({ where, select: { userId: true } });
  const eligibleCount = audience.length;
  const audienceIds = audience.map((a) => a.userId);

  const since = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 86_400_000);
  const [opens, runningCampaigns] = await Promise.all([
    // One reel per person per day, so a count of opened reels over the window
    // *is* the number of person-days of attention this audience produced.
    audienceIds.length > 0
      ? prisma.dailyReel.count({
          where: { userId: { in: audienceIds }, openedAt: { not: null }, reelDate: { gte: since } },
        })
      : Promise.resolve(0),
    prisma.spotlightCampaign.count({ where: { status: "RUNNING" } }),
  ]);

  const avgDailyOpeners = opens / ACTIVITY_LOOKBACK_DAYS;
  const dailyCapacity = avgDailyOpeners * MAX_PROMOTED_PER_VIEWER_PER_DAY;
  const projectedDays = dailyCapacity > 0 ? Math.ceil(promisedReach / dailyCapacity) : null;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (eligibleCount < MIN_AUDIENCE_TO_SELL) {
    blockers.push(
      `Is targeting par abhi sirf ${eligibleCount} log eligible hain. Kam se kam ${MIN_AUDIENCE_TO_SELL} chahiye — city ya umar thodi chaudi karein.`,
    );
  }
  if (eligibleCount < promisedReach) {
    blockers.push(
      `Ye pack ${promisedReach} logon ka wada karta hai, par is targeting par ${eligibleCount} hi maujood hain.`,
    );
  }
  if (projectedDays === null) {
    blockers.push("In logon me se koi abhi app nahi khol raha — campaign deliver hi nahi ho payega.");
  } else if (projectedDays > maxDays) {
    warnings.push(
      `Is raftaar par ${promisedReach} tak pahunchne me kareeb ${projectedDays} din lagenge, jabki pack ${maxDays} din ka hai. Reach poori na hui to din apne aap badha diye jayenge.`,
    );
  }
  if (runningCampaigns > 0) {
    warnings.push(
      `${runningCampaigns} aur campaign abhi chal rahe hain — roz ki jagah aapas me bant-ti hai, to asli raftaar isse thodi dheemi ho sakti hai.`,
    );
  }

  return {
    eligibleCount,
    avgDailyOpeners: Math.round(avgDailyOpeners * 10) / 10,
    projectedDays,
    runningCampaigns,
    canDeliver: blockers.length === 0,
    withinWindow: projectedDays !== null && projectedDays <= maxDays,
    blockers,
    warnings,
  };
}

/**
 * Cities worth offering in the picker — the ones members actually live in.
 *
 * A free-text city field is how "Delhi", "delhi" and "New Delhi" become three
 * audiences of one. Offering only cities that exist in the data means every
 * option a buyer can pick is an option that can be delivered.
 */
export async function listTargetableCities(limit = 40): Promise<{ city: string; count: number }[]> {
  const rows = await prisma.profile.groupBy({
    by: ["currentCity"],
    where: { isVisible: true, profileStatus: { in: ["SUBMITTED", "VERIFIED"] }, currentCity: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { currentCity: "desc" } },
    take: limit,
  });
  return rows
    .filter((r): r is typeof r & { currentCity: string } => Boolean(r.currentCity))
    .map((r) => ({ city: r.currentCity, count: r._count._all }));
}
