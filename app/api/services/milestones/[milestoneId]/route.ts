import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { acceptMilestone, disputeMilestone } from "@/lib/services/marketplace/bookingService";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("dispute"), note: z.string().trim().min(5).max(800) }),
]);

/** The buyer confirming (or querying) one delivered milestone. Ownership is
 *  re-checked in the service against `booking.buyerUserId`. */
export async function POST(req: Request, { params }: { params: Promise<{ milestoneId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { milestoneId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ActionSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Ye action theek nahi hai." }, { status: 422 });
  }

  const result =
    parsed.data.action === "accept"
      ? await acceptMilestone(user.id, milestoneId)
      : await disputeMilestone(user.id, milestoneId, parsed.data.note);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
