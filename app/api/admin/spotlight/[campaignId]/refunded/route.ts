import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { markSpotlightRefunded } from "@/lib/services/spotlight/deliveryService";

export const runtime = "nodejs";

const BodySchema = z.object({
  note: z.string().trim().min(3, "Refund id ya note likhiye.").max(300),
});

/**
 * Marks a short-delivered Spotlight campaign as refunded — after an admin has
 * refunded it in Razorpay. ADMIN only: SUPPORT may read queues, never close a
 * money row.
 */
export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN", message: "Sirf admin refund mark kar sakta hai." }, { status: 403 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Note likhiye." },
      { status: 422 },
    );
  }

  const { campaignId } = await params;
  const marked = await markSpotlightRefunded(campaignId, `${parsed.data.note} — ${user.fullName}`);
  if (!marked) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye campaign refund queue me nahi hai." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
