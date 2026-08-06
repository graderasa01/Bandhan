import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { castVote } from "@/lib/services/vibe/pollService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";

export const runtime = "nodejs";

const BodySchema = z.object({ optionIndex: z.number().int().min(0) });

export async function POST(req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { pollId } = await params;

  const gate = await isFeatureAvailable(user.id, "mindsetArena");
  if (!gate.allowed) {
    return NextResponse.json({ error: "FEATURE_OFF", message: "Ye feature abhi available nahi hai." }, { status: 403 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "optionIndex chahiye." }, { status: 422 });
  }

  const result = await castVote(user.id, pollId, parsed.data.optionIndex);
  if (!result.ok) {
    return NextResponse.json({ error: "VOTE_FAILED", message: result.message }, { status: 422 });
  }
  return NextResponse.json(result);
}
