import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Reading the Parent Voice Blessing — the write side lives in
 * `app/api/family-portal/blessing/route.ts`, right next to the verification
 * rule it depends on.
 *
 * `findFirst` + `orderBy createdAt desc` rather than `findUnique` on
 * purpose — see that route's note on why VoiceNote's unique index doesn't
 * actually guarantee at most one row here. Reading "most recent" is the
 * agreed-safe interpretation until that gap has a real migration.
 */

async function findLatest(ownerUserId: string) {
  const note = await prisma.voiceNote.findFirst({
    where: { fromUserId: ownerUserId, toUserId: null, context: "PARENT_BLESSING" },
    orderBy: { createdAt: "desc" },
    select: {
      mediaAsset: { select: { id: true, durationMs: true, moderation: true, deletedAt: true } },
    },
  });
  if (!note || note.mediaAsset.deletedAt) return null;
  return note;
}

export interface OwnParentBlessingStatus {
  mediaId: string;
  seconds: number;
  pendingReview: boolean;
}

/** Family portal + the owner's own dashboard — shows the clip whatever its moderation state. */
export async function getOwnParentBlessingStatus(ownerUserId: string): Promise<OwnParentBlessingStatus | null> {
  const note = await findLatest(ownerUserId);
  if (!note) return null;
  return {
    mediaId: note.mediaAsset.id,
    seconds: Math.max(1, Math.round((note.mediaAsset.durationMs ?? 0) / 1000)),
    pendingReview: note.mediaAsset.moderation !== "APPROVED",
  };
}

export interface PublicParentBlessingView {
  mediaId: string;
  seconds: number;
}

/** A third party's profile view — present only once the clip has actually cleared screening. */
export async function getPublicParentBlessing(ownerUserId: string): Promise<PublicParentBlessingView | null> {
  const note = await findLatest(ownerUserId);
  if (!note || note.mediaAsset.moderation !== "APPROVED") return null;
  return {
    mediaId: note.mediaAsset.id,
    seconds: Math.max(1, Math.round((note.mediaAsset.durationMs ?? 0) / 1000)),
  };
}
