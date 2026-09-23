import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { estimateSharpness } from "@/lib/services/media/photoEnhance";
import { isPhotoVerificationRequired } from "@/lib/services/verification/verificationSettingsService";
import { MAX_SLIDES } from "@/lib/services/profile/photoSlides";

export const runtime = "nodejs";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 8 * 1024 * 1024;
// Reel Slides (Phase 2) needs an owner-curated set, not a gallery — 6 keeps
// the upload step short and still leaves room to pick the best 4 for the reel.
const MAX_PHOTOS = 6;

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Photo file nahi mili." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Sirf JPG, PNG ya WEBP allowed hai." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Photo 8MB se badi nahi honi chahiye." }, { status: 422 });
  }

  const profile = await getOrCreateProfile(user.id);
  const activePhotos = profile.photos.filter((p) => !p.deletedAt);
  if (activePhotos.length >= MAX_PHOTOS) {
    return NextResponse.json(
      { error: "LIMIT_REACHED", message: `Ek profile par zyada se zyada ${MAX_PHOTOS} photo allowed hain.` },
      { status: 422 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await photoStorage.upload({ userId: user.id, buffer, contentType: file.type, extension });

  const hasPrimary = activePhotos.some((p) => p.isPrimary);
  // Admin's /admin/verification toggle (VerificationSettings.photoVerificationRequired):
  // when off, a photo skips the manual queue entirely — every downstream
  // `verificationStatus === "APPROVED"` check (Reel eligibility, verified
  // badge, trust score, photo slides) already reads this one field.
  const verificationRequired = await isPhotoVerificationRequired();
  const now = new Date();
  // Same default `photoReviewService` applies on approval: an approved photo
  // joins the reel while there is room. Without it, with verification off,
  // every upload landed APPROVED but slot-less — and the reel showed one photo
  // no matter how many the member had added.
  const currentSlides = activePhotos.filter((p) => p.slotOrder != null).length;
  const autoSlotOrder = !verificationRequired && currentSlides < MAX_SLIDES ? currentSlides + 1 : null;
  const photo = await prisma.profilePhoto.create({
    data: {
      profileId: profile.id,
      fileUrl: stored.fileUrl,
      storageKey: stored.storageKey,
      isPrimary: !hasPrimary,
      verificationStatus: verificationRequired ? "PENDING" : "APPROVED",
      verifiedAt: verificationRequired ? null : now,
      slotOrder: autoSlotOrder,
    },
  });

  // How crisp the upload actually is, so the caller can decide whether to put
  // the AI clean-up in front of the member or leave it as a quiet extra. It is
  // measured *after* the file is safely stored and it never blocks: a soft
  // photo is still a perfectly valid photo, and a member who likes theirs as it
  // is should not be argued with. See `estimateSharpness` for what the number
  // can and cannot see.
  const sharpness = await estimateSharpness(buffer);

  console.info(`[profile:photo] user=${user.id} photo=${photo.id} sharpness=${sharpness.score}`);
  return NextResponse.json(
    {
      photoId: photo.id,
      fileUrl: photo.fileUrl,
      isPrimary: photo.isPrimary,
      verificationStatus: photo.verificationStatus,
      slotOrder: photo.slotOrder,
      sharpness,
    },
    { status: 201 },
  );
}
