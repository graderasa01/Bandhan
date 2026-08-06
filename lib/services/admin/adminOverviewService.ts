import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AdminCountKey } from "@/components/layout/adminNavItems";

/**
 * The numbers the admin panel opens on.
 *
 * Two halves, and the split matters:
 *
 *  - `getAdminPendingCounts` — **work waiting on a human.** Every key is
 *    something that is blocked until an admin clicks. These drive the nav
 *    badges, so the bar is strict: if it can't be cleared by acting, it doesn't
 *    belong here. A badge that never reaches zero teaches people to stop
 *    looking at badges.
 *  - `getAdminMetrics` — **state of the business.** Numbers to read, never to
 *    clear. These never badge anything.
 *
 * Both are plain counts and aggregates rather than a materialised stats table.
 * At this scale that is a handful of indexed COUNTs on one page load, and the
 * alternative — a summary row someone has to remember to invalidate — is how
 * dashboards start quietly lying.
 */

export type AdminPendingCounts = Record<AdminCountKey, number>;

export async function getAdminPendingCounts(): Promise<AdminPendingCounts> {
  const [photos, media, questions, reports, partners, matchmaker, voiceAccess] =
    await Promise.all([
      prisma.profilePhoto.count({ where: { verificationStatus: "PENDING", deletedAt: null } }),
      prisma.mediaAsset.count({ where: { moderation: "PENDING", deletedAt: null, kind: "VOICE_NOTE" } }),
      prisma.profileQuestion.count({ where: { moderation: "PENDING" } }),
      prisma.contentReport.count({ where: { status: "OPEN" } }),
      prisma.partner.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.matchmakerRequest.count({ where: { status: { in: ["OPEN", "CONTACTED"] } } }),
      prisma.user.count({ where: { voiceSelfFillStatus: "PENDING" } }),
    ]);

  return {
    verification: photos,
    // One badge for one page: /admin/moderation renders all three queues, so
    // three separate numbers would be three badges pointing at the same link.
    moderation: media + questions + reports,
    partners,
    matchmaker,
    voiceAccess,
  };
}

export interface AdminMetrics {
  users: { total: number; active: number; newThisWeek: number; suspended: number };
  /**
   * Counted by `profileStatus`, not by "live". `isProfileLive` is computed from
   * draft field values (see `completionService`) and has no column to COUNT, so
   * a "live profiles" number here would be a guess dressed as a fact.
   */
  profiles: { total: number; verified: number };
  revenue: { last30DaysPaise: number; allTimePaise: number; testPaise: number };
  subscriptions: { active: number; byPlan: { planCode: string; count: number }[] };
  engagement: { matches: number; messagesThisWeek: number; reelSwipesThisWeek: number };
  commissions: { pendingPaise: number; pendingCount: number };
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    newUsers,
    suspendedUsers,
    totalProfiles,
    verifiedProfiles,
    revenue30,
    revenueAll,
    revenueTest,
    activeSubs,
    subsByPlan,
    matches,
    messagesWeek,
    swipesWeek,
    pendingCommissions,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { deletedAt: null, status: { in: ["SUSPENDED", "BLOCKED"] } } }),
    prisma.profile.count(),
    prisma.profile.count({ where: { profileStatus: "VERIFIED" } }),
    // Real money only. `isTest` marks dummy-gateway rows, and folding those
    // into revenue would make every pre-Razorpay number fiction.
    prisma.payment.aggregate({
      where: { status: "CAPTURED", isTest: false, capturedAt: { gte: monthAgo } },
      _sum: { amountPaise: true },
    }),
    prisma.payment.aggregate({
      where: { status: "CAPTURED", isTest: false },
      _sum: { amountPaise: true },
    }),
    prisma.payment.aggregate({
      where: { status: "CAPTURED", isTest: true },
      _sum: { amountPaise: true },
    }),
    prisma.subscription.count({
      where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: now } },
    }),
    prisma.subscription.groupBy({
      by: ["planCode"],
      where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: now } },
      _count: { _all: true },
    }),
    prisma.match.count(),
    prisma.message.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.swipeAction.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.partnerCommission.aggregate({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      newThisWeek: newUsers,
      suspended: suspendedUsers,
    },
    profiles: { total: totalProfiles, verified: verifiedProfiles },
    revenue: {
      last30DaysPaise: revenue30._sum.amountPaise ?? 0,
      allTimePaise: revenueAll._sum.amountPaise ?? 0,
      testPaise: revenueTest._sum.amountPaise ?? 0,
    },
    subscriptions: {
      active: activeSubs,
      byPlan: subsByPlan
        .map((s) => ({ planCode: s.planCode as string, count: s._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    engagement: {
      matches,
      messagesThisWeek: messagesWeek,
      reelSwipesThisWeek: swipesWeek,
    },
    commissions: {
      pendingPaise: pendingCommissions._sum.amountPaise ?? 0,
      pendingCount: pendingCommissions._count._all,
    },
  };
}
