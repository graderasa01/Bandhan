import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { decideVoiceSelfFill } from "@/lib/services/profile/voiceAccessService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(400).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Action galat hai." }, { status: 422 });
  }

  const result = await decideVoiceSelfFill({
    userId: id,
    action: parsed.data.action,
    adminId: user.id,
    note: parsed.data.note,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
