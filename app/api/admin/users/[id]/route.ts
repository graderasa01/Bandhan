import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { setUserStatus } from "@/lib/services/admin/userAdminService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  action: z.enum(["SUSPEND", "BLOCK", "REACTIVATE"]),
  reason: z.string().min(4, "Reason likhna zaroori hai.").max(500),
});

/**
 * The most consequential route in the admin panel: it can take someone's
 * account away. `requireAdmin` (not SUPPORT), a mandatory written reason, and
 * an audit row on every call — the service holds the last two, along with the
 * refusals for self-targeting and for other admins.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Galat input." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await setUserStatus({
    actorId: user.id,
    userId: id,
    action: parsed.data.action,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "REJECTED", message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
