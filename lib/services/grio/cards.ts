import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { canViewerUnlockPhotos, photoLockFor } from "@/lib/services/plans/photoAccess";
import { openChatMatchIds } from "@/lib/services/chat/chatUnlockService";
import { GRIO_CARDS_MAX, type GrioProfileCard } from "@/lib/contracts/grioCards";

/**
 * Profile cards for Grio's chat, for the ids the *client* asks about.
 *
 * The ids come from a roster ordinal the server resolved or from a search the
 * Discovery engine ran — but the endpoint does not trust that, because a client
 * can send any id. So every card is re-derived under the same rules the profile
 * page applies to a stranger opened by URL: visible, not a draft, not deleted,
 * not blocked either way, not yourself; the photo only through `photoLockFor`.
 * A card here is never more than `/user/profile/[id]` would already show this
 * viewer on its first screen.
 *
 * Returned in the order asked. The caller decides order from code (roster rank
 * or search order) and the model never gets a say — see `SHOW_MARKER_START`.
 */
export async function buildGrioProfileCards(viewerUserId: string, profileIds: string[]): Promise<GrioProfileCard[]> {
  const ids = [...new Set(profileIds)].slice(0, GRIO_CARDS_MAX);
  if (ids.length === 0) return [];

  const [blocked, canUnlockAll] = await Promise.all([
    getBlockedUserIds(viewerUserId),
    canViewerUnlockPhotos(viewerUserId),
  ]);

  const rows = await prisma.profile.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      isVisible: true,
      profileStatus: { not: "DRAFT" },
      userId: { notIn: [viewerUserId, ...blocked] },
    },
    select: {
      id: true,
      userId: true,
      displayName: true,
      dateOfBirth: true,
      currentCity: true,
      profileStatus: true,
      photoPrivacy: true,
      profession: { select: { jobTitle: true, professionCategory: true } },
      photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true } },
    },
  });
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.userId);
  const [matches, shortlisted, interests] = await Promise.all([
    prisma.match.findMany({
      where: {
        OR: [
          { userAId: viewerUserId, userBId: { in: userIds } },
          { userBId: viewerUserId, userAId: { in: userIds } },
        ],
      },
      select: { id: true, userAId: true, userBId: true },
    }),
    prisma.shortlist.findMany({
      where: { userId: viewerUserId, targetProfileId: { in: rows.map((r) => r.id) } },
      select: { targetProfileId: true },
    }),
    prisma.interest.findMany({
      where: { fromUserId: viewerUserId, toUserId: { in: userIds }, status: { in: ["PENDING", "ACCEPTED"] } },
      select: { toUserId: true },
    }),
  ]);

  const openChats = await openChatMatchIds(matches);
  const matchByUser = new Map(
    matches.map((m) => [m.userAId === viewerUserId ? m.userBId : m.userAId, m.id] as const),
  );
  const shortlistedIds = new Set(shortlisted.map((s) => s.targetProfileId));
  const interestTo = new Set(interests.map((i) => i.toUserId));

  const byId = new Map(
    rows.map((p) => {
      const matchId = matchByUser.get(p.userId) ?? null;
      const photoLock = photoLockFor({
        matched: matchId !== null,
        viewerCanUnlockAll: canUnlockAll,
        ownerPhotoPrivacy: p.photoPrivacy,
      });
      const card: GrioProfileCard = {
        profileId: p.id,
        name: p.displayName?.trim() || "Profile",
        age: ageFromDate(p.dateOfBirth),
        city: p.currentCity,
        profession: p.profession?.jobTitle ?? p.profession?.professionCategory ?? null,
        verified: p.profileStatus === "VERIFIED",
        photoUrl: photoLock === "open" ? (p.photos[0]?.fileUrl ?? null) : null,
        photoLock,
        shortlisted: shortlistedIds.has(p.id),
        interestSent: interestTo.has(p.userId),
        matchId,
        chatOpen: matchId !== null && openChats.has(matchId),
      };
      return [p.id, card] as const;
    }),
  );

  return ids.map((id) => byId.get(id)).filter((c): c is GrioProfileCard => c !== undefined);
}
