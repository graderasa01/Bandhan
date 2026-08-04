import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updatePoll, setRetired } from "@/lib/services/admin/pollAdminService";
import { PollTheme } from "@prisma/client";

export const runtime = "nodejs";

const PatchSchema = z.object({
  theme: z.nativeEnum(PollTheme).optional(),
  question: z.string().min(10).max(300).optional(),
  options: z.array(z.string().min(1).max(120)).min(2).max(4).optional(),
  retired: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }
  const { retired, ...contentFields } = parsed.data;

  if (retired !== undefined) {
    const result = await setRetired({ id, retired, actorId: user.id, actorRole: user.role });
    if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
    return NextResponse.json({ ok: true, poll: result.poll });
  }

  const result = await updatePoll({ id, ...contentFields, actorId: user.id, actorRole: user.role });
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  return NextResponse.json({ ok: true, poll: result.poll });
}
