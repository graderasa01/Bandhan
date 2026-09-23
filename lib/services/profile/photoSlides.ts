import "server-only";
import { prisma } from "@/lib/db/prisma";
import { noopT, type Translate } from "@/lib/i18n/translate";

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

/** Shared ownership lookup for `setPhotoNote` and `setPhotoFocalY` — both gate on the same "exists, not deleted, mine" check. */
async function findOwnedPhoto(userId: string, photoId: string) {
  const photo = await prisma.profilePhoto.findUnique({
    where: { id: photoId },
    select: { profile: { select: { userId: true } }, deletedAt: true },
  });
  if (!photo || photo.deletedAt || photo.profile.userId !== userId) return null;
  return photo;
}

/** Owner-only: writes the note text. Not gated on verification — it's the owner's words, not the photo's status. */
export async function setPhotoNote(
  userId: string,
  photoId: string,
  note: string | null,
  t: Translate = noopT,
): Promise<PhotoSlideResult> {
  const clean = trimmedNote(note);
  if (clean && clean.length > NOTE_MAX) {
    return {
      ok: false,
      error: "NOTE_TOO_LONG",
      message: `Note ${NOTE_MAX} ${t("profileServices.photo.noteTooLong", "characters se zyada nahi ho sakta.")}`,
      status: 422,
    };
  }

  const photo = await findOwnedPhoto(userId, photoId);
  if (!photo) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.notFound", "Photo nahi mili."), status: 404 };
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
  t: Translate = noopT,
): Promise<PhotoSlideResult> {
  if (!Number.isInteger(focalY) || focalY < 0 || focalY > 100) {
    return {
      ok: false,
      error: "INVALID_FOCAL_Y",
      message: t("profileServices.photo.invalidFocalY", "Position 0-100 ke beech honi chahiye."),
      status: 422,
    };
  }

  const photo = await findOwnedPhoto(userId, photoId);
  if (!photo) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.notFound", "Photo nahi mili."), status: 404 };
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
  t: Translate = noopT,
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
  if (!profile) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.profileNotFound", "Profile nahi mila."), status: 404 };
  }

  const target = profile.photos.find((p) => p.id === photoId);
  if (!target) return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.notFound", "Photo nahi mili."), status: 404 };

  if (inReel) {
    if (target.slotOrder != null) return { ok: true }; // already in — idempotent
    if (target.verificationStatus !== "APPROVED") {
      return {
        ok: false,
        error: "NOT_APPROVED",
        message: t("profileServices.photo.notApproved", "Sirf verified photo hi reel me shamil ho sakti hai."),
        status: 409,
      };
    }
    const current = profile.photos.filter((p) => p.slotOrder != null);
    if (current.length >= MAX_SLIDES) {
      return {
        ok: false,
        error: "LIMIT_REACHED",
        message: `${t("profileServices.photo.limitReachedPrefix", "Reel me zyada se zyada")} ${MAX_SLIDES} ${t("profileServices.photo.limitReachedSuffix", "photo ho sakti hain — pehle ek hataayein.")}`,
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

/**
 * Move a photo that is already a slide to another position (1..N).
 *
 * The other slides shift to make room, so `slotOrder` stays dense — the same
 * 1..N invariant `setPhotoInReel` keeps. A photo that is not in the reel yet
 * cannot be "moved"; it has to join first, through the same APPROVED gate.
 */
export async function setPhotoSlot(
  userId: string,
  photoId: string,
  slot: number,
  t: Translate = noopT,
): Promise<PhotoSlideResult> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      photos: {
        where: { deletedAt: null, slotOrder: { not: null } },
        orderBy: { slotOrder: "asc" },
        select: { id: true },
      },
    },
  });
  if (!profile) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.profileNotFound", "Profile nahi mila."), status: 404 };
  }

  const order = profile.photos.map((p) => p.id);
  const from = order.indexOf(photoId);
  if (from < 0) {
    return {
      ok: false,
      error: "NOT_IN_REEL",
      message: t("profileServices.photo.notInReel", "Pehle photo ko reel me shamil karein."),
      status: 409,
    };
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > order.length) {
    return {
      ok: false,
      error: "INVALID_SLOT",
      message: t("profileServices.photo.invalidSlot", "Ye slide number sahi nahi hai."),
      status: 422,
    };
  }

  order.splice(from, 1);
  order.splice(slot - 1, 0, photoId);
  await prisma.$transaction(
    order.map((id, i) => prisma.profilePhoto.update({ where: { id }, data: { slotOrder: i + 1 } })),
  );
  return { ok: true };
}

/**
 * Which photo represents this person everywhere a single photo is shown.
 *
 * Until now the answer was "whichever one you uploaded first" and there was no
 * way to change it — the flag is set once, in the upload route, and nothing
 * ever wrote it again. A member whose better photo was their second upload had
 * to delete and re-upload to fix it, except there was no delete either. Both
 * gaps are closed here.
 *
 * Not gated on verification: which of your own photos is "the" one is your
 * call, and a PENDING primary is already handled everywhere by the same
 * `verificationStatus` checks that gate the reel.
 */
export async function setPrimaryPhoto(
  userId: string,
  photoId: string,
  t: Translate = noopT,
): Promise<PhotoSlideResult> {
  const photo = await findOwnedPhoto(userId, photoId);
  if (!photo) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.notFound", "Photo nahi mili."), status: 404 };
  }

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.profileNotFound", "Profile nahi mila."), status: 404 };
  }

  // Clear-then-set in one transaction: "exactly one primary" is the invariant
  // every reader assumes, and two writes that can half-land would break it.
  await prisma.$transaction([
    prisma.profilePhoto.updateMany({
      where: { profileId: profile.id, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.profilePhoto.update({ where: { id: photoId }, data: { isPrimary: true } }),
  ]);
  return { ok: true };
}

/**
 * Owner removes one of their own photos.
 *
 * Soft delete (`deletedAt`), matching every other read in the codebase — the
 * file stays in storage and the row stays joinable, so an admin looking at a
 * past verification decision still sees what they decided about.
 *
 * Two invariants have to survive the removal, and this is the only place that
 * can keep both: the remaining reel slides re-compact to 1..N (same rule as
 * `setPhotoInReel`, so no reader ever meets a "slide 3 of 2"), and if the
 * deleted photo was the primary, the oldest surviving photo takes over rather
 * than leaving the profile with a photo count above zero and no photo to show.
 */
export async function deleteOwnPhoto(
  userId: string,
  photoId: string,
  t: Translate = noopT,
): Promise<PhotoSlideResult> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      id: true,
      photos: {
        where: { deletedAt: null },
        // Oldest first, so "the next one takes over as primary" is the photo
        // that has been on the profile longest rather than an arbitrary row.
        orderBy: { uploadedAt: "asc" },
        select: { id: true, slotOrder: true, isPrimary: true },
      },
    },
  });
  if (!profile) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.profileNotFound", "Profile nahi mila."), status: 404 };
  }

  const target = profile.photos.find((p) => p.id === photoId);
  if (!target) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.photo.notFound", "Photo nahi mili."), status: 404 };
  }

  const survivors = profile.photos.filter((p) => p.id !== photoId);
  const remainingSlides = survivors
    .filter((p) => p.slotOrder != null)
    .sort((a, b) => (a.slotOrder ?? 0) - (b.slotOrder ?? 0));
  const nextPrimary = target.isPrimary ? survivors[0] : null;

  await prisma.$transaction([
    prisma.profilePhoto.update({
      where: { id: photoId },
      data: { deletedAt: new Date(), slotOrder: null, isPrimary: false },
    }),
    ...remainingSlides.map((p, i) =>
      prisma.profilePhoto.update({ where: { id: p.id }, data: { slotOrder: i + 1 } }),
    ),
    ...(nextPrimary ? [prisma.profilePhoto.update({ where: { id: nextPrimary.id }, data: { isPrimary: true } })] : []),
  ]);
  return { ok: true };
}
