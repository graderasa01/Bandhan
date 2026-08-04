import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { answerConnection } from "@/lib/services/circle/connectionService";
import { getCircleView } from "@/lib/services/circle/circleService";

export const runtime = "nodejs";

const AnswerSchema = z.object({ accept: z.boolean() });

/** Phase F — one side's yes/no on a pairing. The Match is created only on the second yes. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "seriousCircle");
  if (!gate.allowed) {
    return NextResponse.json({ error: "FEATURE_OFF", message: "Serious Circle abhi band hai." }, { status: 404 });
  }

  const { id } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = AnswerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const result = await answerConnection(user.id, id, parsed.data.accept);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    connected: result.connected,
    matchId: result.matchId,
    view: await getCircleView(user.id),
  });
}
