import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";

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

  // photoStorage.ts's own layout — see its UPLOAD_ROOT. Read directly rather
  // than importing that module, which only exposes `upload()`.
  const filePath = path.join(process.cwd(), "public", "uploads", "photos", photo.storageKey);
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
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
