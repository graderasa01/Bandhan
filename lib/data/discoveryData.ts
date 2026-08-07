// Real Prisma-backed discovery data — same migration pattern as reelData.ts /
// userDashboardData.ts (no mock/api toggle once a domain is real; the mock
// source in lib/mock/discoveryMock.ts is left in place but unused here).
import { prisma } from "@/lib/db/prisma";
import { makeMockMeta } from "@/lib/contracts/common";
import { ageFromDate } from "@/lib/services/match/age";
import { WITHDRAW_WINDOW_HOURS } from "@/lib/services/match/withdrawInterest";
import type { MatchCardViewModel, MatchesViewModel, InterestViewModel, InterestsViewModel } from "@/lib/contracts/discovery";

const MATCH_PROFILE_SELECT = {
  id: true,
  displayName: true,
  dateOfBirth: true,
  currentCity: true,
  trustScore: true,
  education: { select: { highestEducation: true } },
  profession: { select: { jobTitle: true } },
  // fileUrl was missing: the photo was fetched only to compute the verified
  // badge, so the one screen that has earned the right to show a face was
  // rendering initials instead.
  photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true, verificationStatus: true } },
} as const;

export async function getMatchesData(userId: string): Promise<MatchesViewModel> {
  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { createdAt: "desc" },
    include: {
      userA: { select: { profile: { select: MATCH_PROFILE_SELECT } } },
      userB: { select: { profile: { select: MATCH_PROFILE_SELECT } } },
    },
  });

  const cards: MatchCardViewModel[] = [];
  for (const m of matches) {
    const otherProfile = (m.userAId === userId ? m.userB : m.userA).profile;
    if (!otherProfile) continue;
    const photo = otherProfile.photos[0];
    cards.push({
      id: m.id,
      displayName: otherProfile.displayName ?? "Profile",
      age: ageFromDate(otherProfile.dateOfBirth) ?? 0,
      city: otherProfile.currentCity ?? "",
      education: otherProfile.education?.highestEducation ?? "",
      profession: otherProfile.profession?.jobTitle ?? "",
      trustScore: otherProfile.trustScore,
      verified: photo?.verificationStatus === "APPROVED",
      profileId: otherProfile.id,
      // A Match row existing IS the consent gate's condition, so no extra check.
      photoUrl: photo?.fileUrl ?? null,
    });
  }

  return {
    meta: makeMockMeta("api"),
    matches: cards,
    emptyState: {
      title: "Abhi koi match nahi mila.",
      description: "Rishta Reel par swipe karke matches banayein.",
    },
  };
}

const INTEREST_PROFILE_SELECT = {
  id: true,
  displayName: true,
  dateOfBirth: true,
  currentCity: true,
} as const;

type InterestPersonRow = {
  id: string;
  displayName: string | null;
  dateOfBirth: Date | null;
  currentCity: string | null;
} | null;

function toPersonView(p: InterestPersonRow, fallback: string) {
  return {
    displayName: p?.displayName ?? fallback,
    age: ageFromDate(p?.dateOfBirth ?? null) ?? undefined,
    city: p?.currentCity ?? undefined,
  };
}

export async function getInterestsData(userId: string): Promise<InterestsViewModel> {
  const [viewerProfile, receivedRows, sentRows] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: INTEREST_PROFILE_SELECT }),
    // Asymmetric on purpose. A withdrawn interest disappears completely from
    // the recipient's list — that is what "wapas le liya" has to mean, or the
    // undo undoes nothing. The sender keeps seeing it, marked withdrawn,
    // because it still cost them a slot from `interestsPerMonth` and a row
    // that vanishes from their own list makes that charge look like a bug.
    prisma.interest.findMany({
      where: { toUserId: userId, status: { not: "WITHDRAWN" } },
      orderBy: { createdAt: "desc" },
      include: { fromUser: { select: { profile: { select: INTEREST_PROFILE_SELECT } } } },
    }),
    prisma.interest.findMany({
      where: { fromUserId: userId },
      orderBy: { createdAt: "desc" },
      include: { toUser: { select: { profile: { select: INTEREST_PROFILE_SELECT } } } },
    }),
  ]);

  const viewerView = toPersonView(viewerProfile, "Aap");

  const received: InterestViewModel[] = receivedRows.map((row) => ({
    id: row.id,
    fromUser: toPersonView(row.fromUser.profile, "Profile"),
    toUser: viewerView,
    status: row.status === "PENDING" ? "RECEIVED" : row.status,
    sentDate: row.createdAt.toISOString().slice(0, 10),
    message: row.message ?? undefined,
    profileId: row.fromUser.profile?.id,
  }));

  const withdrawCutoff = Date.now() - WITHDRAW_WINDOW_HOURS * 3_600_000;
  const sent: InterestViewModel[] = sentRows.map((row) => ({
    id: row.id,
    fromUser: viewerView,
    toUser: toPersonView(row.toUser.profile, "Profile"),
    status: row.status === "PENDING" ? "SENT" : row.status,
    sentDate: row.createdAt.toISOString().slice(0, 10),
    message: row.message ?? undefined,
    profileId: row.toUser.profile?.id,
    // Same two conditions `withdrawInterest` enforces, in the same order.
    canWithdraw: row.status === "PENDING" && row.createdAt.getTime() > withdrawCutoff,
  }));

  return {
    meta: makeMockMeta("api"),
    received,
    sent,
    emptyReceived: {
      title: "Abhi koi interest nahi aaya hai.",
      description: "Profile complete karein taaki matches aapko find kar sakein.",
    },
    emptySent: {
      title: "Abhi koi interest send nahi kiya hai.",
      description: "Rishta Reel explore karein aur interest bhejein.",
    },
  };
}
