import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updateMatchmakerRequestStatus } from "@/lib/services/matchmaker/matchmakerService";

export const runtime = "nodejs";

const BodySchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["CONTACTED", "RESOLVED"]),
});

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  const result = await updateMatchmakerRequestStatus({
    requestId: parsed.data.requestId,
    status: parsed.data.status,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
