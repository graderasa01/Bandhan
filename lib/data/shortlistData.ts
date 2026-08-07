import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { getKundliNotes, type KundliNote } from "@/lib/services/kundli/kundliService";
import { canViewerUnlockPhotos, photoUnlockedFor } from "@/lib/services/plans/photoAccess";

/**
 * The user's own shortlist — the swipe-down pile.
 *
 * `ReelShortlistSheet` has been telling users their swipe-down "aapki apni
 * shortlist me save rahega, jise aap baad me [dekh sakte hain]" while there
 * was no screen that showed it. The rows were written and never read back.
 *
 * Photos follow exactly the same rule the reel uses, which since 2026-08-07 is
 * "a real Match, or a paid plan" — see `photoUnlockAll` in lib/constants/
 * plans.ts for the decision and what it replaced. This file used to say a
 * shortlist "cannot be allowed to buy a look at them"; that is no longer the
 * product's position, and the sentence is recorded here only so the change
 * reads as deliberate rather than as something that eroded.
 */

export interface ShortlistEntry {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoVerified: boolean;
  shortlistedOn: string;
  /** Whether this person has already been sent an interest — hides a duplicate CTA. */
  interestSent: boolean;
  kundliNotes: KundliNote[];
}

export async function getShortlist(userId: string): Promise<ShortlistEntry[]> {
  const rows = await prisma.shortlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      targetProfile: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          dateOfBirth: true,
          currentCity: true,
          trustScore: true,
          education: { select: { highestEducation: true } },
          profession: { select: { jobTitle: true } },
          basicDetails: { select: { gotra: true, manglikStatus: true } },
          photos: {
            where: { isPrimary: true, deletedAt: null },
            take: 1,
            select: { fileUrl: true, verificationStatus: true },
          },
        },
      },
    },
  });

  if (rows.length === 0) return [];

  const targetUserIds = rows.map((r) => r.targetProfile.userId);

  const [viewer, matches, interests, canUnlockAll] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { basicDetails: { select: { gotra: true, manglikStatus: true } } },
    }),
    prisma.match.findMany({
      where: {
        OR: [
          { userAId: userId, userBId: { in: targetUserIds } },
          { userBId: userId, userAId: { in: targetUserIds } },
        ],
      },
      select: { userAId: true, userBId: true },
    }),
    // A withdrawn interest must stop marking the card "interest bheja hua",
    // otherwise the shortlist keeps asserting something the user undid.
    prisma.interest.findMany({
      where: { fromUserId: userId, toUserId: { in: targetUserIds }, status: { not: "WITHDRAWN" } },
      select: { toUserId: true },
    }),
    canViewerUnlockPhotos(userId),
  ]);

  const matchedUserIds = new Set(
    matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== userId),
  );
  const interestedUserIds = new Set(interests.map((i) => i.toUserId));

  return rows.map((r) => {
    const p = r.targetProfile;
    const photo = p.photos[0];
    const photoOpen = photoUnlockedFor({
      matched: matchedUserIds.has(p.userId),
      viewerCanUnlockAll: canUnlockAll,
    });
    return {
      profileId: p.id,
      displayName: p.displayName ?? "Profile",
      age: ageFromDate(p.dateOfBirth),
      city: p.currentCity,
      education: p.education?.highestEducation ?? null,
      profession: p.profession?.jobTitle ?? null,
      trustScore: p.trustScore,
      // Same rule as the reel: the URL itself is the secret. `public/uploads/**`
      // has no auth in front of it, so a locked card must not carry the address.
      photoUrl: photoOpen ? (photo?.fileUrl ?? null) : null,
      photoUnlocked: photoOpen,
      photoVerified: photo?.verificationStatus === "APPROVED",
      shortlistedOn: r.createdAt.toISOString().slice(0, 10),
      interestSent: interestedUserIds.has(p.userId),
      kundliNotes: getKundliNotes(
        { gotra: viewer?.basicDetails?.gotra, manglikStatus: viewer?.basicDetails?.manglikStatus },
        { gotra: p.basicDetails?.gotra, manglikStatus: p.basicDetails?.manglikStatus },
      ),
    };
  });
}
