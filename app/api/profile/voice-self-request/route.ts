import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { requestVoiceSelfFill, VOICE_REASON_MAX, VOICE_REASON_MIN } from "@/lib/services/profile/voiceAccessService";

export const runtime = "nodejs";

const BodySchema = z.object({
  reason: z.string().trim().min(VOICE_REASON_MIN).max(VOICE_REASON_MAX),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_FAILED",
        message: `Reason ${VOICE_REASON_MIN}-${VOICE_REASON_MAX} characters ka hona chahiye.`,
      },
      { status: 422 },
    );
  }

  const result = await requestVoiceSelfFill(user.id, parsed.data.reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
