import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { hideReview } from "@/lib/services/marketplace/reviewService";

export const runtime = "nodejs";

const BodySchema = z.object({
  hide: z.boolean(),
  note: z.string().max(500).optional(),
});

/** Hide (or restore) a review. Hidden, never deleted — the average has to stay
 *  explainable to whoever asks why it moved. */
export async function POST(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { reviewId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Galat input." }, { status: 422 });
  }

  const result = await hideReview({
    reviewId,
    hide: parsed.data.hide,
    note: parsed.data.note ?? "",
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
