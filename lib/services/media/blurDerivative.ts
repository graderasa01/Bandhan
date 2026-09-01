import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";
import { photoStorage } from "@/lib/services/storage/photoStorage";

/**
 * Blind Vibe Zone (Phase E) — "5 same-vote matches, and a photo unblurs".
 *
 * §7.4 is the rule this whole file exists to satisfy: blur is not a security
 * boundary if it's a CSS filter over a public `/uploads/**` URL — view-source
 * gets the original either way. So the blurred image has to be a genuinely
 * separate file, generated server-side, served only through the same
 * authenticated `/api/media/[id]` route every other gated asset uses.
 *
 * One blur level, not several: the original idea was a single threshold ("5
 * matches → unblur"), and a fixed blur is also what makes this file cheap to
 * cache — one derivative per owner, reused for every viewer who hasn't
 * crossed the threshold yet, regenerated only the first time it's asked for.
 */

const BLUR_SIGMA = 25;
const DERIVATIVE_SIZE = 480;

/** votes needed on the same option, same poll, before the real photo shows. */
export const BLIND_VIBE_UNLOCK_THRESHOLD = 5;

async function readPrimaryPhotoBytes(ownerUserId: string): Promise<Buffer | null> {
  const photo = await prisma.profilePhoto.findFirst({
    where: { profile: { userId: ownerUserId }, isPrimary: true, verificationStatus: "APPROVED", deletedAt: null },
    select: { storageKey: true },
  });
  if (!photo) return null;

  // Through the seam, not around it. This used to rebuild photoStorage's disk
  // layout by hand (`public/uploads/photos/<key>`), which was merely duplicated
  // knowledge while there was one backend and became a real bug the moment
  // photos moved to a bucket: the path would still resolve, find nothing, and
  // every blurred Vibe card would silently fall back to no image at all.
  // `photoStorage.read()` already returns null on a miss, which is the same
  // contract this function needs.
  return photoStorage.read(photo.storageKey);
}

/**
 * Finds this owner's cached derivative, or builds one. Not invalidated on a
 * later photo re-upload — a known gap, not a silent one: acceptable because a
 * stale blur is still just a blur (never the wrong *person's* photo), and
 * re-verification of a swapped primary photo already re-triggers photo review.
 */
export async function getOrCreateBlurDerivative(ownerUserId: string): Promise<string | null> {
  const existing = await prisma.mediaAsset.findFirst({
    where: { ownerUserId, kind: "PHOTO_BLUR_DERIVATIVE", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const source = await readPrimaryPhotoBytes(ownerUserId);
  if (!source) return null;

  const buffer = await sharp(source)
    .resize(DERIVATIVE_SIZE, DERIVATIVE_SIZE, { fit: "cover" })
    .blur(BLUR_SIGMA)
    .jpeg({ quality: 65 })
    .toBuffer();

  const stored = await mediaStorage.upload({
    userId: ownerUserId,
    kind: "PHOTO_BLUR_DERIVATIVE",
    buffer,
    extension: "jpg",
  });

  const asset = await prisma.mediaAsset.create({
    data: {
      ownerUserId,
      kind: "PHOTO_BLUR_DERIVATIVE",
      storageKey: stored.storageKey,
      mimeType: "image/jpeg",
      sizeBytes: stored.sizeBytes,
      // Derived from a photo that already cleared photo review — nothing new
      // to screen, and blurring only removes information, never adds any.
      moderation: "APPROVED",
    },
  });
  return asset.id;
}
