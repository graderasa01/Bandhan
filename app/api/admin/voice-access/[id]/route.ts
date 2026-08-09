import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { decideVoiceSelfFill } from "@/lib/services/profile/voiceAccessService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(400).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Action galat hai." }, { status: 422 });
  }

  const t = await getT();
  const result = await decideVoiceSelfFill(
    {
      userId: id,
      action: parsed.data.action,
      adminId: user.id,
      note: parsed.data.note,
    },
    t,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
