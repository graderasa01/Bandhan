import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { canUsePhotoEnhance } from "@/lib/services/plans/entitlements";
import { ENHANCE_PRESETS, renderEnhancedPhoto } from "@/lib/services/media/photoEnhance";
import { isPhotoVerificationRequired } from "@/lib/services/verification/verificationSettingsService";

export const runtime = "nodejs";

const BodySchema = z.object({ preset: z.enum(ENHANCE_PRESETS) });

/**
 * Persists the one chosen preset as this photo's new file — same row/id,
 * `isPrimary`/`slotOrder`/`note` untouched. If the photo had already cleared
 * Photo Verification, this resets it to PENDING: the pixels genuinely
 * changed, so what an admin approved is no longer exactly what would now be
 * shown — the same principle as swapping in a different photo file, not a
 * special case for this feature.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  if (!(await canUsePhotoEnhance(user.id))) {
    return NextResponse.json(
      { error: "PLAN_REQUIRED", message: "Ye feature Standard ya Premium plan me available hai." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Invalid preset." }, { status: 422 });
  }

  const photo = await prisma.profilePhoto.findUnique({
    where: { id },
    select: { storageKey: true, deletedAt: true, verificationStatus: true, profile: { select: { userId: true } } },
  });
  if (!photo || photo.deletedAt || photo.profile.userId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Photo nahi mili." }, { status: 404 });
  }

  const source = await photoStorage.read(photo.storageKey);
  if (!source) {
    return NextResponse.json({ error: "SOURCE_MISSING", message: "Original photo file nahi mili." }, { status: 500 });
  }

  const buffer = await renderEnhancedPhoto(source, parsed.data.preset);
  const stored = await photoStorage.upload({ userId: user.id, buffer, contentType: "image/jpeg", extension: "jpg" });

  const wasApproved = photo.verificationStatus === "APPROVED";
  // Admin's /admin/verification toggle — when verification isn't required
  // right now, a changed photo doesn't need to go back through review either.
  const resetForReview = wasApproved && (await isPhotoVerificationRequired());
  const updated = await prisma.profilePhoto.update({
    where: { id },
    data: {
      fileUrl: stored.fileUrl,
      storageKey: stored.storageKey,
      ...(resetForReview ? { verificationStatus: "PENDING", verifiedAt: null, rejectedReason: null } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    resetForReview,
    photo: {
      id: updated.id,
      fileUrl: updated.fileUrl,
      isPrimary: updated.isPrimary,
      verificationStatus: updated.verificationStatus,
      note: updated.note,
      slotOrder: updated.slotOrder,
    },
  });
}
