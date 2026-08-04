import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Reel Slides — the owner chooses up to 4 of their own photos, in order, each
 * with an 80-character note in their own words. `slotOrder` is kept dense
 * (1..N, no gaps) so every reader — the reel, the profile page, this service —
 * can just `orderBy: { slotOrder: "asc" }` without re-deriving position.
 */

export const MAX_SLIDES = 4;
export const NOTE_MAX = 80;

export type PhotoSlideResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

export interface PhotoSlideSource {
  id: string;
  fileUrl: string;
  note: string | null;
  slotOrder: number | null;
  verificationStatus: string;
  deletedAt: Date | null;
  focalY: number | null;
}

/**
 * The read-side twin of `setPhotoInReel`'s gates, kept here so the reel and
 * the profile page can't drift into disagreeing about which photos count as
 * slides. `slotOrder` is written dense (1..N) on the way in, so ordering by
 * it is all a reader ever needs to do.
 */
export function buildPhotoSlides(
  photos: PhotoSlideSource[],
): { id: string; url: string; note: string | null; focalY: number | null }[] {
  return photos
    .filter((p) => !p.deletedAt && p.verificationStatus === "APPROVED" && p.slotOrder != null)
    .sort((a, b) => (a.slotOrder ?? 0) - (b.slotOrder ?? 0))
    .map((p) => ({ id: p.id, url: p.fileUrl, note: p.note, focalY: p.focalY }));
}

function trimmedNote(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Owner-only: writes the note text. Not gated on verification — it's the owner's words, not the photo's status. */
export async function setPhotoNote(
  userId: string,
  photoId: string,
  note: string | null,
): Promise<PhotoSlideResult> {
  const clean = trimmedNote(note);
  if (clean && clean.length > NOTE_MAX) {
    return { ok: false, error: "NOTE_TOO_LONG", message: `Note ${NOTE_MAX} characters se zyada nahi ho sakta.`, status: 422 };
  }

  const photo = await prisma.profilePhoto.findUnique({
    where: { id: photoId },
    select: { profile: { select: { userId: true } }, deletedAt: true },
  });
  if (!photo || photo.deletedAt || photo.profile.userId !== userId) {
    return { ok: false, error: "NOT_FOUND", message: "Photo nahi mili.", status: 404 };
  }

  await prisma.profilePhoto.update({ where: { id: photoId }, data: { note: clean } });
  return { ok: true };
}

/**
 * Owner-only: writes the vertical focal point (0-100, top-to-bottom) used as
 * `object-position` wherever this photo renders under `object-cover`. Not
 * gated on verification — same reasoning as `setPhotoNote`: it's the owner's
 * framing choice, not a claim about the photo's review status.
 */
export async function setPhotoFocalY(
  userId: string,
  photoId: string,
  focalY: number,
): Promise<PhotoSlideResult> {
  if (!Number.isInteger(focalY) || focalY < 0 || focalY > 100) {
    return { ok: false, error: "INVALID_FOCAL_Y", message: "Position 0-100 ke beech honi chahiye.", status: 422 };
  }

  const photo = await prisma.profilePhoto.findUnique({
    where: { id: photoId },
    select: { profile: { select: { userId: true } }, deletedAt: true },
  });
  if (!photo || photo.deletedAt || photo.profile.userId !== userId) {
    return { ok: false, error: "NOT_FOUND", message: "Photo nahi mili.", status: 404 };
  }

  await prisma.profilePhoto.update({ where: { id: photoId }, data: { focalY } });
  return { ok: true };
}

/**
 * Toggle a photo's slide membership.
 *
 * Adding requires APPROVED — an unreviewed or rejected photo cannot appear in
 * a reel that exists to build trust. Removing always re-compacts the
 * remaining slots to 1..N so there's never a "slide 3 of 2" gap for a reader
 * to render around.
 */
export async function setPhotoInReel(
  userId: string,
  photoId: string,
  inReel: boolean,
): Promise<PhotoSlideResult> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      id: true,
      photos: {
        where: { deletedAt: null },
        orderBy: { slotOrder: "asc" },
        select: { id: true, slotOrder: true, verificationStatus: true },
      },
    },
  });
  if (!profile) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  const target = profile.photos.find((p) => p.id === photoId);
  if (!target) return { ok: false, error: "NOT_FOUND", message: "Photo nahi mili.", status: 404 };

  if (inReel) {
    if (target.slotOrder != null) return { ok: true }; // already in — idempotent
    if (target.verificationStatus !== "APPROVED") {
      return {
        ok: false,
        error: "NOT_APPROVED",
        message: "Sirf verified photo hi reel me shamil ho sakti hai.",
        status: 409,
      };
    }
    const current = profile.photos.filter((p) => p.slotOrder != null);
    if (current.length >= MAX_SLIDES) {
      return {
        ok: false,
        error: "LIMIT_REACHED",
        message: `Reel me zyada se zyada ${MAX_SLIDES} photo ho sakti hain — pehle ek hataayein.`,
        status: 422,
      };
    }
    await prisma.profilePhoto.update({ where: { id: photoId }, data: { slotOrder: current.length + 1 } });
    return { ok: true };
  }

  if (target.slotOrder == null) return { ok: true }; // already out — idempotent

  const remaining = profile.photos
    .filter((p) => p.slotOrder != null && p.id !== photoId)
    .sort((a, b) => (a.slotOrder ?? 0) - (b.slotOrder ?? 0));

  await prisma.$transaction([
    prisma.profilePhoto.update({ where: { id: photoId }, data: { slotOrder: null } }),
    ...remaining.map((p, i) =>
      prisma.profilePhoto.update({ where: { id: p.id }, data: { slotOrder: i + 1 } }),
    ),
  ]);
  return { ok: true };
}
