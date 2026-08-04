import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { isPhotoVerificationRequired } from "@/lib/services/verification/verificationSettingsService";

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
  const photo = await prisma.profilePhoto.create({
    data: {
      profileId: profile.id,
      fileUrl: stored.fileUrl,
      storageKey: stored.storageKey,
      isPrimary: !hasPrimary,
      verificationStatus: verificationRequired ? "PENDING" : "APPROVED",
      verifiedAt: verificationRequired ? null : now,
    },
  });

  console.info(`[profile:photo] user=${user.id} photo=${photo.id}`);
  return NextResponse.json({ photoId: photo.id, fileUrl: photo.fileUrl, isPrimary: photo.isPrimary }, { status: 201 });
}
