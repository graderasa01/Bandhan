import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { reviewPhoto, REASON_MAX, REASON_MIN } from "@/lib/services/verification/photoReviewService";

export const runtime = "nodejs";

const REASON_HINT = `Reason ${REASON_MIN} se ${REASON_MAX} characters ke beech hona chahiye.`;

const PatchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  // Zod's default for a failed `min()` is "Invalid input", which tells an
  // admin nothing — the length rule is stated instead.
  reason: z.string().trim().min(REASON_MIN, REASON_HINT).max(REASON_MAX, REASON_HINT).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_FAILED",
        message: parsed.error.issues[0]?.message ?? REASON_HINT,
      },
      { status: 422 },
    );
  }

  const result = await reviewPhoto({
    photoId: id,
    action: parsed.data.action,
    actorId: user.id,
    actorRole: user.role,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, status: result.photo.verificationStatus });
}
