import "server-only";
import { prisma } from "@/lib/db/prisma";
import { canSeeAdmirerIdentity, canSeeViewerIdentity } from "@/lib/services/plans/entitlements";

/**
 * Profile activity — the signals the app has always recorded and never shown
 * to the one person they are about.
 *
 * Privacy shape, as originally shipped:
 *  - LEFT swipes are counted in `views` and were never identifiable. Telling
 *    someone who rejected them is cruel and buys nothing.
 *  - RIGHT swipes already surface as a received Interest, so they were not
 *    repeated here as a separate "admirer".
 *  - DOWN (shortlist) was the one identifiable signal: someone saved you for
 *    the family without committing yet.
 *
 * **2026-08-02 — Devesh explicitly overrode the viewer half of this** after
 * being told the tradeoff (viewers includes people who rejected the card):
 * he wants "Viewed You" clickable through to a real profile too, same as
 * "Shortlisted You" already was. Rather than silently open it at the same
 * `admirerIdentity` gate, it got its own stricter `viewerIdentity` entitlement
 * (Premium-only, vs admirerIdentity's Standard+) — see D-15 and
 * `viewerIdentity`'s doc comment in `plans.ts`. The original reasoning above
 * is kept, not deleted, because it's still *why* this reveal sits behind a
 * higher price floor than the shortlist one, not why it doesn't exist.
 *
 * `views` counts distinct people, not impressions — a card seen twice is one
 * person, and a number that inflates itself is a number nobody believes.
 */

export interface AdmirerFace {
  /** React key. For unlocked rows this is the same as `profileId`. */
  key: string;
  /** The person's own Profile id — `/user/profile/[id]` accepts this directly. */
  profileId: string;
  displayName: string | null;
  photoUrl: string | null;
  at: Date;
}

export interface ActivitySnapshot {
  viewers: number;
  shortlisted: number;
  pendingInterests: number;
  /** Populated only when the plan allows it; otherwise the UI blurs `shortlisted`. */
  faces: AdmirerFace[];
  canSeeIdentity: boolean;
  /** Last 10 distinct recent viewers, any swipe direction. Premium-gated — see module docstring. */
  viewerFaces: AdmirerFace[];
  canSeeViewerIdentity: boolean;
}

export async function getActivitySnapshot(userId: string, profileId: string): Promise<ActivitySnapshot> {
  const [
    viewerRows,
    recentViewers,
    shortlistedTotal,
    shortlists,
    pendingInterests,
    canSeeIdentity,
    canSeeViewers,
  ] = await Promise.all([
    prisma.swipeAction.findMany({
      where: { targetProfileId: profileId },
      distinct: ["actorUserId"],
      select: { actorUserId: true },
    }),
    // Capped: the panel shows a face row, not a directory. `viewerRows` above
    // is the number the user is actually told.
    prisma.swipeAction.findMany({
      where: { targetProfileId: profileId },
      distinct: ["actorUserId"],
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        createdAt: true,
        actor: {
          select: {
            profile: {
              select: {
                id: true,
                displayName: true,
                photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.shortlist.count({ where: { targetProfileId: profileId } }),
    // Capped: the panel shows a face row, not a directory. `shortlistedTotal`
    // above is the number the user is actually told.
    prisma.shortlist.findMany({
      where: { targetProfileId: profileId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        user: {
          select: {
            profile: {
              select: {
                id: true,
                displayName: true,
                photos: {
                  where: { isPrimary: true, deletedAt: null },
                  take: 1,
                  select: { fileUrl: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.interest.count({ where: { toUserId: userId, status: "PENDING" } }),
    canSeeAdmirerIdentity(userId),
    canSeeViewerIdentity(userId),
  ]);

  const faces: AdmirerFace[] = canSeeIdentity
    ? shortlists
        .filter((s) => s.user.profile !== null)
        .map((s) => ({
          key: s.id,
          profileId: s.user.profile!.id,
          displayName: s.user.profile!.displayName,
          photoUrl: s.user.profile!.photos[0]?.fileUrl ?? null,
          at: s.createdAt,
        }))
    : [];

  const viewerFaces: AdmirerFace[] = canSeeViewers
    ? recentViewers
        .filter((v) => v.actor.profile !== null)
        .map((v) => ({
          key: v.actor.profile!.id,
          profileId: v.actor.profile!.id,
          displayName: v.actor.profile!.displayName,
          photoUrl: v.actor.profile!.photos[0]?.fileUrl ?? null,
          at: v.createdAt,
        }))
    : [];

  return {
    viewers: viewerRows.length,
    shortlisted: shortlistedTotal,
    pendingInterests,
    faces,
    canSeeIdentity,
    viewerFaces,
    canSeeViewerIdentity: canSeeViewers,
  };
}

/**
 * Most recent people with a still-pending Interest sent to this user.
 *
 * Deliberately not gated like `faces`/`viewerFaces` above: an Interest is a
 * direct, mutual-intent signal the recipient must see in full to act on
 * (accept/decline on /user/interests already shows the sender plainly — see
 * `discoveryData.ts`'s `getInterestsData`), unlike a passive view or a
 * save-for-later shortlist. Reusing `AdmirerFace` here is just shape reuse,
 * not a claim that Interests belong to the same swipe-privacy taxonomy as
 * the rest of this module.
 */
export async function getRecentInterestFaces(userId: string): Promise<AdmirerFace[]> {
  const rows = await prisma.interest.findMany({
    where: { toUserId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      fromUser: {
        select: {
          profile: {
            select: {
              id: true,
              displayName: true,
              photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true } },
            },
          },
        },
      },
    },
  });

  return rows
    .filter((r) => r.fromUser.profile !== null)
    .map((r) => ({
      key: r.id,
      profileId: r.fromUser.profile!.id,
      displayName: r.fromUser.profile!.displayName,
      photoUrl: r.fromUser.profile!.photos[0]?.fileUrl ?? null,
      at: r.createdAt,
    }));
}
