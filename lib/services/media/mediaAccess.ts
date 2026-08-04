import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import type { Role } from "@prisma/client";

/**
 * The single answer to "may this person hear these bytes".
 *
 * Every read of a MediaAsset goes through here, on every request — there is no
 * signed URL, no token, no "it was allowed when the page rendered". That is
 * the whole reason the file lives outside `public/`: a gate that is only
 * checked once has a window, and a locked voice note's window is exactly the
 * thing someone would go looking for.
 *
 * Kept deliberately small and readable. If this function ever needs a comment
 * to explain why a branch exists, the rule it encodes has probably drifted
 * from what the product promises.
 */

export type MediaAccessResult =
  | { allowed: true; storageKey: string; mimeType: string }
  | { allowed: false; status: 403 | 404 };

const NOT_FOUND = { allowed: false, status: 404 } as const;
const FORBIDDEN = { allowed: false, status: 403 } as const;

export async function resolveMediaAccess(params: {
  mediaId: string;
  viewerId: string;
  viewerRole: Role;
}): Promise<MediaAccessResult> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: params.mediaId, deletedAt: null },
    include: {
      voiceNote: {
        select: { toUserId: true, context: true, unlockedAt: true },
      },
      pollVoteAnswer: { select: { id: true } },
    },
  });

  if (!asset) return NOT_FOUND;

  const grant = { allowed: true, storageKey: asset.storageKey, mimeType: asset.mimeType } as const;

  // Admins need playback to run the moderation queue — that is the only reason,
  // and it is why an admin bypasses the APPROVED check below rather than
  // sitting above it for everything else.
  if (params.viewerRole === "ADMIN") return grant;

  // Your own recording, always — including while it is still PENDING, so the
  // "sun kar dekho" preview after recording works without a special case.
  if (asset.ownerUserId === params.viewerId) return grant;

  // Nothing un-screened ever reaches a third party.
  if (asset.moderation !== "APPROVED") return FORBIDDEN;

  // Blind Vibe Zone (Phase E) — a blur derivative carries strictly less
  // information than the original it's made from, never more, so there is no
  // "wrong viewer" for it the way there is for a voice note or a photo. Only
  // a block still matters: someone who has cut off contact with the owner
  // shouldn't see so much as a blurred shape of them either.
  if (asset.kind === "PHOTO_BLUR_DERIVATIVE") {
    return (await isBlockedEitherWay(asset.ownerUserId, params.viewerId)) ? FORBIDDEN : grant;
  }

  // A parent's blessing is attached to the owner's own profile rather than
  // aimed at anyone, so it follows the profile's visibility instead of an
  // unlock. C7's Soch Board clips follow the identical rule, plus the
  // board's own master toggle.
  if (asset.voiceNote?.context === "PARENT_BLESSING" || asset.pollVoteAnswer) {
    const profile = await prisma.profile.findFirst({
      where: {
        userId: asset.ownerUserId,
        isVisible: true,
        deletedAt: null,
        ...(asset.pollVoteAnswer ? { sochBoardVisible: true } : {}),
      },
      select: { id: true },
    });
    return profile ? grant : FORBIDDEN;
  }

  const note = asset.voiceNote;
  if (!note) return FORBIDDEN;
  if (note.toUserId !== params.viewerId) return FORBIDDEN;
  if (!note.unlockedAt) return FORBIDDEN;

  return grant;
}
