import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { canUsePhotoUltraEnhance } from "@/lib/services/plans/entitlements";
import { isPhotoVerificationRequired } from "@/lib/services/verification/verificationSettingsService";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

const BodySchema = z.object({ dataUrl: z.string().regex(DATA_URL_RE, "Invalid image data.") });

/**
 * Persists the ultra-enhance result the owner already saw and picked in
 * /ultra-enhance's preview response — it does **not** call the AI provider
 * again. The client already holds the full generated image bytes from the
 * preview step; re-generating on apply would double the real API cost (and
 * daily-cap consumption) for a result the owner already confirmed. Same
 * row/id, `isPrimary`/`slotOrder`/`note` untouched, and the same
 * reset-to-PENDING-if-was-APPROVED rule as the deterministic tier's apply
 * route — the pixels genuinely changed either way.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  if (!(await canUsePhotoUltraEnhance(user.id))) {
    return NextResponse.json(
      { error: "PLAN_REQUIRED", message: "Ye feature sirf Premium plan me available hai." },
      { status: 403 },
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Invalid image data." }, { status: 422 });
  }

  const match = DATA_URL_RE.exec(parsed.data.dataUrl)!;
  const [, extension, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Image bahut badi hai." }, { status: 422 });
  }

  const photo = await prisma.profilePhoto.findUnique({
    where: { id },
    select: { deletedAt: true, verificationStatus: true, profile: { select: { userId: true } } },
  });
  if (!photo || photo.deletedAt || photo.profile.userId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Photo nahi mili." }, { status: 404 });
  }

  const stored = await photoStorage.upload({
    userId: user.id,
    buffer,
    contentType: `image/${extension === "jpeg" ? "jpeg" : extension}`,
    extension: extension === "jpeg" ? "jpg" : extension,
  });

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
