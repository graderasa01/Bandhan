import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import { appOrigin } from "@/lib/utils/appOrigin";
import {
  getMemberReferralConfig,
  shareMessageOf,
  type MemberReferralConfigValues,
} from "./memberReferralConfig";
import { getOrCreateMemberReferralCode, resolveMemberReferralCode } from "./memberCode";
import type { AttributionMethod, MemberReferralStatus, Prisma } from "@prisma/client";

/**
 * The member referral engine — "dost ko bulao".
 *
 * ## What it is for
 *
 * A matrimony marketplace with no members is not short of *signups*, it is
 * short of **profiles a stranger can honestly be shown**. Everything below is
 * built around that one sentence:
 *
 *   • a referral counts only once the person who joined has a live profile
 *     with an approved photo (`checkJoinerBar`);
 *   • the reward only pays out once the *referrer's own* profile is finished
 *     too (`checkReferrerBar`), so the program grows the pool from both ends
 *     rather than filling it with blank accounts;
 *   • it pays in a time-boxed plan grant, never in money, so an abused
 *     referral costs unused access rather than cash out of the door.
 *
 * ## No scheduler
 *
 * Same discipline as `questService`: nothing runs at midnight. Qualification
 * is re-evaluated at the three moments it can actually change (profile
 * submitted, photo approved, refer screen opened) and settlement is idempotent
 * against `MemberReferralReward`'s unique index, so re-running it costs one
 * query and changes nothing.
 *
 * ## Paying exactly once
 *
 * `@@unique([userId, rung])`. The insert either succeeds — and this is the run
 * that grants — or violates the constraint, and this run grants nothing. There
 * is no read-then-write window to lose. The key is the rung ordinal rather
 * than the referral count so that an admin re-tuning `referralsPerReward` can
 * never re-open an already-paid rung; see the column's own note in
 * `schema.prisma`.
 */

/** Stamped on the entitlement row, beside `"purchase"` and an admin's user id. */
export const REFERRAL_GRANTED_BY = "referral";

/**
 * `MemberReferralReward.rung` 0 is reserved for the *joiner's* own welcome
 * grant (the double-sided half of the program). Real rungs are 1-based, so 0
 * can never collide with one.
 */
const JOINER_WELCOME_RUNG = 0;

/** Profile states in which someone is actually being shown to other members. */
const LIVE_PROFILE_STATUSES: readonly string[] = ["SUBMITTED", "VERIFIED"];

function addDays(from: Date, days: number): Date {
  const out = new Date(from);
  out.setDate(out.getDate() + days);
  return out;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export interface ReferralRequirement {
  key: string;
  /** What is required, in the second person. */
  label: string;
  met: boolean;
  /** Where to go and fix it. Omitted when there is nothing to click. */
  fixHref?: string;
  detail?: string;
}

// ============================================================
// Attribution
// ============================================================

export type AttributionOutcome =
  | { attributed: true; referrerUserId: string }
  | { attributed: false; reason: "NO_CODE" | "UNKNOWN_CODE" | "SELF" | "ALREADY_ATTRIBUTED" };

/**
 * Records that `newUserId` joined through `code`. Called from registration.
 *
 * Never throws and never blocks the signup: a broken or retired code must cost
 * somebody their reward, never their account. That is the same rule the
 * partner attribution beside it already follows.
 *
 * Runs even when the program is switched off. Turning the program off stops it
 * *paying*, and an attribution that was silently dropped during a pause can
 * never be recovered — the click that carried it is gone.
 */
export async function attributeMemberSignup(params: {
  newUserId: string;
  code: string | null;
  method: AttributionMethod;
  ipHash: string | null;
}): Promise<AttributionOutcome> {
  const { newUserId, code, method, ipHash } = params;
  if (!code) return { attributed: false, reason: "NO_CODE" };

  try {
    const owner = await resolveMemberReferralCode(code);
    if (!owner) return { attributed: false, reason: "UNKNOWN_CODE" };
    if (owner.userId === newUserId) return { attributed: false, reason: "SELF" };

    await prisma.memberReferral.create({
      data: {
        referrerUserId: owner.userId,
        referredUserId: newUserId,
        codeUsed: owner.code,
        attributionMethod: method,
        signupIpHash: ipHash,
      },
    });
    return { attributed: true, referrerUserId: owner.userId };
  } catch (err) {
    // The unique index on `referredUserId` is the expected failure here: this
    // person is already attributed to somebody, and attribution is permanent.
    console.error(
      "[referral] attributeMemberSignup failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { attributed: false, reason: "ALREADY_ATTRIBUTED" };
  }
}

// ============================================================
// The two bars
// ============================================================

const JOINER_PROFILE_SELECT = {
  isVisible: true,
  profileStatus: true,
  fullProfileCompletionScore: true,
  photos: {
    where: { deletedAt: null, verificationStatus: "APPROVED" },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.ProfileSelect;

/**
 * Whether the person who joined has become a profile worth having.
 *
 * Photos must be **APPROVED**, not merely un-rejected. A pending photo can be
 * anything at all, and this bar is the one standing between the program and a
 * grant of a paid plan. Where an admin has switched
 * `VerificationSettings.photoVerificationRequired` off, uploads are created
 * APPROVED anyway, so this reads correctly in both worlds.
 *
 * `fullProfileCompletionScore`, not `profileCompletionScore`: the latter is
 * required-fields-only and is therefore 100 for *every* submitted profile,
 * which would make the percentage bar decorative.
 */
async function checkJoinerBar(
  userId: string,
  config: MemberReferralConfigValues,
): Promise<{ met: boolean; blocker: string | null }> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, mobileVerifiedAt: true, emailVerifiedAt: true },
    }),
    prisma.profile.findUnique({ where: { userId }, select: JOINER_PROFILE_SELECT }),
  ]);

  if (!user) return { met: false, blocker: "Account nahi mila" };
  if (user.status !== "ACTIVE") return { met: false, blocker: "Profile abhi poori nahi hui" };
  if (!profile || !profile.isVisible || !LIVE_PROFILE_STATUSES.includes(profile.profileStatus)) {
    return { met: false, blocker: "Profile abhi live nahi hai" };
  }
  if (config.requireJoinerPhoto && profile.photos.length === 0) {
    return { met: false, blocker: "Photo abhi approve nahi hui" };
  }
  if (profile.fullProfileCompletionScore < config.joinerMinCompletionPercent) {
    return {
      met: false,
      blocker: `Profile ${profile.fullProfileCompletionScore}% — chahiye ${config.joinerMinCompletionPercent}%`,
    };
  }
  if (config.requireJoinerVerifiedContact && !user.mobileVerifiedAt && !user.emailVerifiedAt) {
    return { met: false, blocker: "Phone ya email verify nahi hua" };
  }
  return { met: true, blocker: null };
}

/**
 * The referrer's own half of the deal — "link bhi share karo, apni profile bhi
 * poori karo".
 *
 * Returned as a requirement list rather than a boolean because the refer
 * screen shows it as a to-do list: a greyed-out reward with no explanation is
 * the version of this feature that produces support messages instead of
 * finished profiles.
 */
export async function checkReferrerBar(
  userId: string,
  config: MemberReferralConfigValues,
): Promise<{ met: boolean; requirements: ReferralRequirement[] }> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
    prisma.profile.findUnique({ where: { userId }, select: JOINER_PROFILE_SELECT }),
  ]);

  const requirements: ReferralRequirement[] = [
    {
      key: "account",
      label: "Aapka account active ho",
      met: user?.status === "ACTIVE",
      detail: user && user.status !== "ACTIVE" ? `Abhi: ${user.status}` : undefined,
    },
  ];

  if (config.requireReferrerProfileComplete) {
    requirements.push({
      key: "profileLive",
      label: "Aapki apni profile live ho",
      met: Boolean(
        profile && profile.isVisible && LIVE_PROFILE_STATUSES.includes(profile.profileStatus),
      ),
      fixHref: "/user/profile",
    });
  }
  if (config.requireReferrerPhoto) {
    requirements.push({
      key: "photo",
      label: "Aapki profile par ek approved photo ho",
      met: (profile?.photos.length ?? 0) > 0,
      fixHref: "/user/profile",
      detail: profile && profile.photos.length === 0 ? "Abhi koi approved photo nahi" : undefined,
    });
  }

  return { met: requirements.every((r) => r.met), requirements };
}

// ============================================================
// Counting
// ============================================================

interface CountableReferral {
  status: MemberReferralStatus;
  signupIpHash: string | null;
}

/**
 * How many qualified referrals actually count toward a reward.
 *
 * With `oneQualifiedPerDevice` on, referrals are de-duplicated by signup
 * network: six accounts made on one phone are one referral, which is the
 * cheapest possible defence against the obvious way to farm this.
 *
 * Note what it does **not** do: it never changes a referral's status. The
 * second person on a shared home connection genuinely did complete their
 * profile, and telling them they did not would be a lie. They stay QUALIFIED
 * and the refer screen says plainly that one network counts once.
 *
 * A null hash (no client IP reached the server) is one bucket, not one per
 * row — the conservative direction, since the alternative would let anything
 * that can suppress the header count without limit. A deployment that does not
 * forward the client IP at all must switch `oneQualifiedPerDevice` off, and
 * the admin screen says so.
 */
export function countRewardableReferrals(
  rows: CountableReferral[],
  oneQualifiedPerDevice: boolean,
): number {
  const qualified = rows.filter((r) => r.status === "QUALIFIED");
  if (!oneQualifiedPerDevice) return qualified.length;

  const seen = new Set<string>();
  for (const row of qualified) seen.add(row.signupIpHash ?? "unknown");
  return seen.size;
}

// ============================================================
// Qualification + settlement
// ============================================================

/**
 * Re-checks this user's *own* referral (the one where they are the joiner) and,
 * if it just cleared the bar, settles whatever their referrer has earned.
 *
 * Called from the moments the answer can change — `submitProfile`, a photo
 * approval — and never awaited into anything that matters. A referral is a
 * bonus on top of something that already happened; failing to record it must
 * not roll back the profile submission that caused it.
 */
export async function syncJoinerQualification(userId: string): Promise<void> {
  try {
    const referral = await prisma.memberReferral.findUnique({
      where: { referredUserId: userId },
      select: { id: true, referrerUserId: true, status: true },
    });
    if (!referral || referral.status !== "PENDING") return;

    const config = await getMemberReferralConfig();
    const bar = await checkJoinerBar(userId, config);
    if (!bar.met) return;

    // Conditional update, same shape as the quest payout claim: whoever moves
    // the row off PENDING is the one run that notifies and settles.
    const claimed = await prisma.memberReferral.updateMany({
      where: { id: referral.id, status: "PENDING" },
      data: { status: "QUALIFIED", qualifiedAt: new Date() },
    });
    if (claimed.count === 0) return;

    await Promise.all([
      notifyReferrerOfProgress(referral.referrerUserId, config),
      grantJoinerWelcome(userId, config),
    ]);
    await settleReferralRewards(referral.referrerUserId);
  } catch (err) {
    console.error(
      "[referral] syncJoinerQualification failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Re-evaluates every one of a referrer's still-pending referrals, then settles.
 *
 * This is the belt to `syncJoinerQualification`'s braces: it runs when the
 * referrer opens their own refer screen, so a qualification that slipped past
 * every hook — a profile edited through a path nobody thought to instrument, a
 * photo approved while the app was mid-deploy — is picked up by the person who
 * has the strongest reason to look.
 */
export async function refreshReferralsFor(referrerUserId: string): Promise<void> {
  try {
    const config = await getMemberReferralConfig();
    const pending = await prisma.memberReferral.findMany({
      where: { referrerUserId, status: "PENDING" },
      select: { id: true, referredUserId: true },
    });

    for (const row of pending) {
      const bar = await checkJoinerBar(row.referredUserId, config);
      if (!bar.met) continue;
      await prisma.memberReferral.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: { status: "QUALIFIED", qualifiedAt: new Date() },
      });
      await grantJoinerWelcome(row.referredUserId, config);
    }

    await settleReferralRewards(referrerUserId);
  } catch (err) {
    console.error(
      "[referral] refreshReferralsFor failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export interface SettledReward {
  rung: number;
  planCode: string;
  days: number;
  expiresAt: Date;
}

/**
 * Grants every rung this referrer has earned and not yet been paid.
 *
 * Loops rather than granting only the newest rung: a referrer whose own
 * profile was incomplete can be sitting on three unpaid rungs the moment they
 * upload a photo, and paying one of them would quietly swallow the rest.
 */
export async function settleReferralRewards(referrerUserId: string): Promise<SettledReward[]> {
  const config = await getMemberReferralConfig();
  if (!config.enabled || config.maxRewardsPerUser === 0 || config.referralsPerReward <= 0) return [];

  const gate = await checkReferrerBar(referrerUserId, config);
  if (!gate.met) return [];

  const rows = await prisma.memberReferral.findMany({
    where: { referrerUserId },
    select: { status: true, signupIpHash: true },
  });
  const rewardable = countRewardableReferrals(rows, config.oneQualifiedPerDevice);

  const rungs = Math.min(
    Math.floor(rewardable / config.referralsPerReward),
    config.maxRewardsPerUser,
  );
  if (rungs === 0) return [];

  const settled: SettledReward[] = [];
  for (let rung = 1; rung <= rungs; rung++) {
    const granted = await grantRung({
      userId: referrerUserId,
      rung,
      referralsAtGrant: rewardable,
      planCode: config.rewardPlanCode,
      days: config.rewardDays,
      reason: `Member referral: rung ${rung} at ${rewardable} qualified referrals`,
    });
    if (granted) settled.push({ rung, ...granted });
  }

  if (settled.length > 0) {
    const catalog = await getPlanCatalog();
    const last = settled[settled.length - 1];
    await createNotice({
      userId: referrerUserId,
      kind: "PLAN_GRANTED",
      title: `${planNameOf(catalog, last.planCode)} plan aapko mil gaya hai`,
      // Deliberately does not name anyone. This becomes a push on a lock
      // screen, and who somebody invited is not for the room to read.
      body: `Aapke bulaye hue logon ne apni profile poori kar li — ${planNameOf(catalog, last.planCode)} ab ${formatDate(last.expiresAt)} tak aapka hai. Koi payment nahi lagi.`,
      href: "/user/subscription",
    });
  }

  return settled;
}

/**
 * The joiner's side of a double-sided program. No-op while
 * `joinerRewardDays` is 0, which is how it ships.
 */
async function grantJoinerWelcome(
  userId: string,
  config: MemberReferralConfigValues,
): Promise<void> {
  if (!config.enabled || config.joinerRewardDays <= 0) return;

  const granted = await grantRung({
    userId,
    rung: JOINER_WELCOME_RUNG,
    referralsAtGrant: 0,
    planCode: config.joinerRewardPlanCode,
    days: config.joinerRewardDays,
    reason: "Member referral: joined through an invite and completed profile",
  });
  if (!granted) return;

  const catalog = await getPlanCatalog();
  await createNotice({
    userId,
    kind: "PLAN_GRANTED",
    title: `${planNameOf(catalog, granted.planCode)} plan aapko mil gaya hai`,
    body: `Invite se judne aur profile poori karne par ${planNameOf(catalog, granted.planCode)} ${formatDate(granted.expiresAt)} tak aapka hai. Koi payment nahi lagi.`,
    href: "/user/subscription",
  });
}

/**
 * Writes the ledger row and the entitlement together, or neither.
 *
 * Returns null when this rung was already paid — the unique index is the
 * check, so the caller can re-run settlement as often as it likes.
 *
 * Like the item-purchase path, a second grant **extends** an unexpired
 * referral grant instead of restarting it: earning the next rung on day five
 * must not throw away the days already held.
 */
async function grantRung(params: {
  userId: string;
  rung: number;
  referralsAtGrant: number;
  planCode: string;
  days: number;
  reason: string;
}): Promise<{ planCode: string; days: number; expiresAt: Date } | null> {
  const { userId, rung, referralsAtGrant, planCode, days, reason } = params;
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      // Throws on the unique index if this rung is already paid, which rolls
      // the whole transaction back before any entitlement is written.
      const ledger = await tx.memberReferralReward.create({
        data: { userId, rung, referralsAtGrant, planCode, days },
        select: { id: true },
      });

      const existing = await tx.userEntitlementOverride.findFirst({
        where: {
          userId,
          planCode,
          grantedBy: REFERRAL_GRANTED_BY,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: "desc" },
        select: { id: true, expiresAt: true },
      });

      const base = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
      const expiresAt = addDays(base, days);

      const override = existing
        ? await tx.userEntitlementOverride.update({
            where: { id: existing.id },
            data: { expiresAt },
            select: { id: true },
          })
        : await tx.userEntitlementOverride.create({
            data: {
              userId,
              planCode,
              // `reason` is mandatory on this table and is read by admins, not
              // users. The rung and the count behind it are in it, so "why
              // does this user have Standard" is answerable in one lookup.
              reason,
              grantedBy: REFERRAL_GRANTED_BY,
              expiresAt,
            },
            select: { id: true },
          });

      await tx.memberReferralReward.update({
        where: { id: ledger.id },
        data: { overrideId: override.id },
      });

      return { planCode, days, expiresAt };
    });
  } catch {
    // Already paid. Not an error — settlement is meant to be re-run.
    return null;
  }
}

/** "Ek invite poora hua — 2/3." Never names the person who joined. */
async function notifyReferrerOfProgress(
  referrerUserId: string,
  config: MemberReferralConfigValues,
): Promise<void> {
  if (!config.enabled) return;
  const rows = await prisma.memberReferral.findMany({
    where: { referrerUserId },
    select: { status: true, signupIpHash: true },
  });
  const count = countRewardableReferrals(rows, config.oneQualifiedPerDevice);
  const toward = count % config.referralsPerReward;
  const remaining = toward === 0 ? 0 : config.referralsPerReward - toward;

  await createNotice({
    userId: referrerUserId,
    kind: "REWARD_EARNED",
    title: "Aapka ek invite poora hua",
    body:
      remaining === 0
        ? "Aapke bulaye hue ek aur member ne apni profile poori kar li."
        : `Aapke bulaye hue ek member ne apni profile poori kar li — ${remaining} aur, phir reward.`,
    href: "/user/refer",
  });
}

// ============================================================
// Read models
// ============================================================

export interface InvitedRow {
  id: string;
  /** First name only. See the privacy note on `getMemberReferralSummary`. */
  name: string;
  joinedAt: Date;
  status: MemberReferralStatus;
  /** What this person still has to do, when they are PENDING. */
  blocker: string | null;
}

export interface MemberReferralSummary {
  enabled: boolean;
  code: string;
  link: string;
  shareText: string;
  rewardPlanName: string;
  rewardDays: number;
  referralsPerReward: number;
  maxRewards: number;
  rewardsEarned: number;
  atCap: boolean;
  /**
   * Rungs earned on count alone but not yet paid, because the referrer's own
   * profile is unfinished. Without this the progress bar reads 0/3 to somebody
   * who has already brought three people — technically the modulo, and exactly
   * the wrong thing to show them.
   */
  unclaimedRungs: number;
  /** Qualified referrals that count — after the same-network de-duplication. */
  rewardable: number;
  pending: number;
  /** 0..referralsPerReward — progress toward the next rung. */
  towardNext: number;
  ownRequirements: ReferralRequirement[];
  ownGateMet: boolean;
  joinerBar: string[];
  invited: InvitedRow[];
  /** The live referral grant, when one is running. */
  activeGrant: { planName: string; expiresAt: Date } | null;
}

/**
 * Everything `/user/refer` renders.
 *
 * ## What the referrer may see about the people they invited
 *
 * First name, join date, and whether that person has finished their profile —
 * and nothing else. Never a link to the profile, never a contact detail, never
 * anything about who they are talking to. The referrer already knows this
 * person (they sent them the link); what they need is enough to nudge them,
 * which is exactly a name and a blocker.
 */
export async function getMemberReferralSummary(userId: string): Promise<MemberReferralSummary> {
  const config = await getMemberReferralConfig();
  const [code, catalog, gate] = await Promise.all([
    getOrCreateMemberReferralCode(userId),
    getPlanCatalog(),
    checkReferrerBar(userId, config),
  ]);

  const rows = await prisma.memberReferral.findMany({
    where: { referrerUserId: userId },
    orderBy: { joinedAt: "desc" },
    select: {
      id: true,
      status: true,
      signupIpHash: true,
      joinedAt: true,
      referredUserId: true,
      referred: { select: { fullName: true } },
    },
  });

  const invited: InvitedRow[] = [];
  for (const row of rows) {
    const blocker =
      row.status === "PENDING" ? (await checkJoinerBar(row.referredUserId, config)).blocker : null;
    invited.push({
      id: row.id,
      name: row.referred.fullName.trim().split(/\s+/)[0] ?? row.referred.fullName,
      joinedAt: row.joinedAt,
      status: row.status,
      blocker,
    });
  }

  const rewardable = countRewardableReferrals(rows, config.oneQualifiedPerDevice);
  const rewards = await prisma.memberReferralReward.findMany({
    where: { userId, rung: { gt: JOINER_WELCOME_RUNG } },
    select: { rung: true },
  });
  const earnedRungs =
    config.referralsPerReward > 0
      ? Math.min(Math.floor(rewardable / config.referralsPerReward), config.maxRewardsPerUser)
      : 0;

  const activeOverride = await prisma.userEntitlementOverride.findFirst({
    where: {
      userId,
      grantedBy: REFERRAL_GRANTED_BY,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
    select: { planCode: true, expiresAt: true },
  });

  const origin = appOrigin();
  const joinerBar = ["Profile live ho"];
  if (config.requireJoinerPhoto) joinerBar.push("Ek approved photo ho");
  joinerBar.push(`Profile kam se kam ${config.joinerMinCompletionPercent}% poori ho`);
  if (config.requireJoinerVerifiedContact) joinerBar.push("Phone ya email verified ho");

  return {
    enabled: config.enabled,
    code,
    link: `${origin}/i/${code}`,
    shareText: `${shareMessageOf(config)} ${origin}/i/${code}`,
    rewardPlanName: planNameOf(catalog, config.rewardPlanCode),
    rewardDays: config.rewardDays,
    referralsPerReward: config.referralsPerReward,
    maxRewards: config.maxRewardsPerUser,
    rewardsEarned: rewards.length,
    atCap: rewards.length >= config.maxRewardsPerUser,
    unclaimedRungs: Math.max(0, earnedRungs - rewards.length),
    rewardable,
    pending: rows.filter((r) => r.status === "PENDING").length,
    towardNext: config.referralsPerReward > 0 ? rewardable % config.referralsPerReward : 0,
    ownRequirements: gate.requirements,
    ownGateMet: gate.met,
    joinerBar,
    invited,
    activeGrant:
      activeOverride?.planCode && activeOverride.expiresAt
        ? { planName: planNameOf(catalog, activeOverride.planCode), expiresAt: activeOverride.expiresAt }
        : null,
  };
}

export interface ReferralNudge {
  rewardable: number;
  referralsPerReward: number;
  rewardPlanName: string;
  rewardDays: number;
  ownGateMet: boolean;
  atCap: boolean;
  /**
   * Rungs the referrer has already earned on count alone but has not been paid,
   * because their own profile is not finished. The strongest honest nudge this
   * feature has: the hard part is done, one photo is in the way.
   */
  unclaimedRungs: number;
}

/**
 * The cheap read for `priorityEngine` — three queries, no per-invite bar check.
 *
 * Separate from `getMemberReferralSummary` on purpose: that one re-evaluates
 * every pending invite to render a blocker line each, which is right for a page
 * somebody opened and far too much for a dashboard that also builds eleven
 * other priorities. Returns null when there is nothing worth saying, so the
 * caller has no rule of its own to get wrong.
 */
export async function getReferralNudge(userId: string): Promise<ReferralNudge | null> {
  const config = await getMemberReferralConfig();
  if (!config.enabled || config.referralsPerReward <= 0 || config.maxRewardsPerUser === 0) return null;

  const rows = await prisma.memberReferral.findMany({
    where: { referrerUserId: userId },
    select: { status: true, signupIpHash: true },
  });
  const rewardable = countRewardableReferrals(rows, config.oneQualifiedPerDevice);
  // Never at zero. A referral program at 0/3 is an advertisement; at 2/3 it is
  // a thing the user started and would want finished — the same line
  // `priorityEngine` already draws for quests.
  if (rewardable === 0) return null;

  const [gate, paidRungs, catalog] = await Promise.all([
    checkReferrerBar(userId, config),
    prisma.memberReferralReward.count({
      where: { userId, rung: { gt: JOINER_WELCOME_RUNG } },
    }),
    getPlanCatalog(),
  ]);

  const earnedRungs = Math.min(
    Math.floor(rewardable / config.referralsPerReward),
    config.maxRewardsPerUser,
  );

  return {
    rewardable,
    referralsPerReward: config.referralsPerReward,
    rewardPlanName: planNameOf(catalog, config.rewardPlanCode),
    rewardDays: config.rewardDays,
    ownGateMet: gate.met,
    atCap: paidRungs >= config.maxRewardsPerUser,
    unclaimedRungs: Math.max(0, earnedRungs - paidRungs),
  };
}

export interface ReferralLeaderRow {
  userId: string;
  name: string;
  joined: number;
  qualified: number;
  rewardsEarned: number;
}

export interface AdminReferralOverview {
  totalJoined: number;
  totalQualified: number;
  totalPending: number;
  rewardsGranted: number;
  /** Plan-days handed out. The program's whole cost, in the only unit it has. */
  planDaysGranted: number;
  leaders: ReferralLeaderRow[];
  recent: {
    id: string;
    referrerName: string;
    joinerName: string;
    status: MemberReferralStatus;
    joinedAt: Date;
  }[];
}

/**
 * The admin console's numbers.
 *
 * `planDaysGranted` is the only cost figure that exists and it is a plain sum
 * of a column, not a modelled rupee value — the same bar `growthService` holds
 * about counting rows that exist rather than projecting.
 */
export async function getAdminReferralOverview(limit = 20): Promise<AdminReferralOverview> {
  const [byStatus, rewards, recentRows] = await Promise.all([
    prisma.memberReferral.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.memberReferralReward.findMany({ select: { userId: true, days: true } }),
    prisma.memberReferral.findMany({
      orderBy: { joinedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        joinedAt: true,
        referrer: { select: { fullName: true } },
        referred: { select: { fullName: true } },
      },
    }),
  ]);

  const countOf = (status: MemberReferralStatus) =>
    byStatus.find((r) => r.status === status)?._count._all ?? 0;

  const rewardsByUser = new Map<string, number>();
  for (const r of rewards) rewardsByUser.set(r.userId, (rewardsByUser.get(r.userId) ?? 0) + 1);

  const topReferrers = await prisma.memberReferral.groupBy({
    by: ["referrerUserId"],
    _count: { _all: true },
    orderBy: { _count: { referrerUserId: "desc" } },
    take: limit,
  });

  const referrerIds = topReferrers.map((r) => r.referrerUserId);
  const [names, qualifiedCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: referrerIds } },
      select: { id: true, fullName: true },
    }),
    prisma.memberReferral.groupBy({
      by: ["referrerUserId"],
      where: { referrerUserId: { in: referrerIds }, status: "QUALIFIED" },
      _count: { _all: true },
    }),
  ]);
  const nameById = new Map(names.map((n) => [n.id, n.fullName]));
  const qualifiedById = new Map(qualifiedCounts.map((q) => [q.referrerUserId, q._count._all]));

  return {
    totalJoined: byStatus.reduce((sum, r) => sum + r._count._all, 0),
    totalQualified: countOf("QUALIFIED"),
    totalPending: countOf("PENDING"),
    rewardsGranted: rewards.length,
    planDaysGranted: rewards.reduce((sum, r) => sum + r.days, 0),
    leaders: topReferrers.map((r) => ({
      userId: r.referrerUserId,
      name: nameById.get(r.referrerUserId) ?? "—",
      joined: r._count._all,
      qualified: qualifiedById.get(r.referrerUserId) ?? 0,
      rewardsEarned: rewardsByUser.get(r.referrerUserId) ?? 0,
    })),
    recent: recentRows.map((r) => ({
      id: r.id,
      referrerName: r.referrer.fullName,
      joinerName: r.referred.fullName,
      status: r.status,
      joinedAt: r.joinedAt,
    })),
  };
}
