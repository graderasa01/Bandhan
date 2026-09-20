import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { canUsePhotoEnhance } from "@/lib/services/plans/entitlements";
import { isNeutralAdjust, normaliseAdjust, renderManualPhoto } from "@/lib/services/media/photoEnhance";
import { isPhotoVerificationRequired } from "@/lib/services/verification/verificationSettingsService";

export const runtime = "nodejs";

const BodySchema = z.object({
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  warmth: z.number().optional(),
  sharpen: z.number().optional(),
  denoise: z.boolean().optional(),
  rotate: z.number().optional(),
});

/**
 * Persists the owner's own dial positions as this photo's new file — same
 * row/id, `isPrimary`/`slotOrder`/`note` untouched, and the same
 * reset-to-PENDING-if-it-was-APPROVED rule the preset tier uses: the pixels
 * genuinely changed, so what an admin approved is no longer exactly what would
 * now be shown.
 *
 * Re-renders from the stored original at full size rather than accepting the
 * preview bytes back from the client — unlike the generative tier (where
 * re-running would mean paying the API twice, see `ultra-enhance/apply`), this
 * pipeline is local and cheap, so the server never has to trust an uploaded
 * image it did not produce.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  if (!(await canUsePhotoEnhance(user.id))) {
    return NextResponse.json(
      { error: "PLAN_REQUIRED", message: "Ye feature abhi aapke liye available nahi hai." },
      { status: 403 },
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Invalid adjustment." }, { status: 422 });
  }

  const adjust = normaliseAdjust(parsed.data);
  // Saving "no change" would still re-encode the file and, on an approved
  // photo, send it back through review — a real cost for literally nothing.
  if (isNeutralAdjust(adjust)) {
    return NextResponse.json(
      { error: "NO_CHANGE", message: "Kuch badla nahi — pehle koi setting adjust karein." },
      { status: 422 },
    );
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

  const buffer = await renderManualPhoto(source, adjust);
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
