import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { canUsePhotoUltraEnhance } from "@/lib/services/plans/entitlements";
import {
  ULTRA_ENHANCE_DAILY_LIMIT,
  generateUltraEnhancePreview,
  getUltraEnhanceUsageToday,
} from "@/lib/services/media/photoUltraEnhance";

export const runtime = "nodejs";

/**
 * Owner-only, Premium-gated, and capped at ULTRA_ENHANCE_DAILY_LIMIT/day —
 * checked *before* calling the AI provider so a request that's going to be
 * rejected never spends real API cost. Returns one in-memory preview
 * (data URL); nothing persists until /ultra-enhance/apply.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  if (!(await canUsePhotoUltraEnhance(user.id))) {
    return NextResponse.json(
      { error: "PLAN_REQUIRED", message: "Ye feature sirf Premium plan me available hai." },
      { status: 403 },
    );
  }

  const usedToday = await getUltraEnhanceUsageToday(user.id);
  if (usedToday >= ULTRA_ENHANCE_DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: "DAILY_LIMIT_REACHED",
        message: `Aaj ke ${ULTRA_ENHANCE_DAILY_LIMIT} Ultra Enhance ho chuke hain — kal phir try karein.`,
      },
      { status: 429 },
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

  const result = await generateUltraEnhancePreview(user.id, source);
  if (!result.ok) {
    return NextResponse.json({ error: "UPSTREAM_ERROR", message: result.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, dataUrl: result.dataUrl });
}
