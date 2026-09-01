import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { updateDelegationScope } from "@/lib/services/managedProfile/delegationService";

export const runtime = "nodejs";

const BodySchema = z.object({
  permissions: z.array(z.string()).min(1).max(10),
  days: z.number().int().min(1).max(365).optional(),
});

/**
 * The owner changing what an existing helper may do — how the Client Desk's
 * search/propose/draft permissions are actually granted.
 *
 * Deliberately not a "grant" endpoint: it can only narrow or widen a
 * delegation that already exists, so it cannot be used to create access to
 * somebody the owner never let in. Anything outside `GRANTABLE_PERMISSIONS` is
 * dropped by `sanitizePermissions`, not stored-and-ignored.
 */
export async function POST(req: Request, { params }: { params: Promise<{ delegationId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { delegationId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Galat input." }, { status: 422 });
  }

  const result = await updateDelegationScope({
    ownerUserId: user.id,
    delegationId,
    permissions: parsed.data.permissions,
    days: parsed.data.days,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
