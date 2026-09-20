import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { photoStorage } from "@/lib/services/storage/photoStorage";
import { canUsePhotoEnhance } from "@/lib/services/plans/entitlements";
import { generateManualPreview, normaliseAdjust } from "@/lib/services/media/photoEnhance";

export const runtime = "nodejs";

/** Everything optional and unbounded here — `normaliseAdjust` does the clamping, so a junk value becomes a neutral one rather than a 422. */
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
 * Owner-only. One in-memory preview of the dials as they currently sit —
 * nothing persisted, no AI, no network call of its own.
 *
 * The sibling of `/enhance` (the three automatic presets), kept as its own
 * route rather than a flag on that one: the two answer different questions.
 * `/enhance` says "here are three versions, pick one"; this says "here is what
 * *you* just asked for". Same `sharp` pipeline underneath, same guarantee that
 * the output is a transform of the owner's own pixels.
 *
 * Called on every settled slider move, so it renders at preview size
 * (`MANUAL_PREVIEW_PX`) — see `generateManualPreview`.
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

  const dataUrl = await generateManualPreview(source, normaliseAdjust(parsed.data));
  return NextResponse.json({ ok: true, dataUrl });
}
