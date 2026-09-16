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

/**
 * The same answer for a whole screenful of people, in one query.
 *
 * The reel needs this for up to thirty cards at once, and calling
 * `getPublicParentBlessing` per card would put thirty round trips on the
 * screen's hot path. Same rule as the single reader — APPROVED only, deleted
 * assets dropped — and the same "most recent wins" tie-break, done here in JS
 * because one indexed read of the whole set beats one `findFirst` per owner.
 */
export async function getPublicParentBlessings(
  ownerUserIds: string[],
): Promise<Map<string, PublicParentBlessingView>> {
  const out = new Map<string, PublicParentBlessingView>();
  if (ownerUserIds.length === 0) return out;

  const notes = await prisma.voiceNote.findMany({
    where: { fromUserId: { in: ownerUserIds }, toUserId: null, context: "PARENT_BLESSING" },
    orderBy: { createdAt: "desc" },
    select: {
      fromUserId: true,
      mediaAsset: { select: { id: true, durationMs: true, moderation: true, deletedAt: true } },
    },
  });

  // Newest-per-owner FIRST, approval second — the same order `findLatest` +
  // the single reader apply. Filtering by approval while collecting would let
  // an older approved clip surface behind a newer one still in review, which
  // is a different (and wrong) answer: the family's latest recording is the
  // one that speaks for them.
  const seen = new Set<string>();
  for (const note of notes) {
    if (seen.has(note.fromUserId)) continue;
    seen.add(note.fromUserId);
    if (note.mediaAsset.deletedAt || note.mediaAsset.moderation !== "APPROVED") continue;
    out.set(note.fromUserId, {
      mediaId: note.mediaAsset.id,
      seconds: Math.max(1, Math.round((note.mediaAsset.durationMs ?? 0) / 1000)),
    });
  }
  return out;
}
