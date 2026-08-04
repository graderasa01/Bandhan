import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { revokeShareLink } from "@/lib/services/share/shareLinkService";

export const runtime = "nodejs";

/** Owner-only. Idempotent — revoking an already-revoked link is not an error. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  const result = await revokeShareLink(user.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
