import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { canUsePhotoEnhance } from "@/lib/services/plans/entitlements";
import { generateEnhancePreviews } from "@/lib/services/media/photoEnhance";

export const runtime = "nodejs";

/** Owner-only, plan-gated. Returns 3 in-memory preview variants — nothing persisted yet. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  if (!(await canUsePhotoEnhance(user.id))) {
    return NextResponse.json(
      { error: "PLAN_REQUIRED", message: "Ye feature Standard ya Premium plan me available hai." },
      { status: 403 },
    );
  }

  const photo = await prisma.profilePhoto.findUnique({
    where: { id },
    select: { storageKey: true, deletedAt: true, profile: { select: { userId: true } } },
  });
  if (!photo || photo.deletedAt || photo.profile.userId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Photo nahi mili." }, { status: 404 });
  }

  const source = await photoStorage.read(photo.storageKey);
  if (!source) {
    return NextResponse.json({ error: "SOURCE_MISSING", message: "Original photo file nahi mili." }, { status: 500 });
  }

  const variants = await generateEnhancePreviews(source);
  return NextResponse.json({ ok: true, variants });
}
