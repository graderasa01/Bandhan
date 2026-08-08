import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { revealPartnerContact } from "@/lib/services/partner/adminPartnerActions";

export const runtime = "nodejs";

/**
 * POST, not GET: revealing a contact writes an audit row, so it must never be
 * fired by a link prefetch or a browser's speculative fetch.
 *
 * `requireAdmin` also means SUPPORT cannot do this — SUPPORT can read the
 * partner queue (ROUTE_ACCESS_MATRIX) but unmasking someone's phone number is
 * an ADMIN-only act, same bar as approving them.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  const result = await revealPartnerContact({ partnerId: id, actorId: user.id, actorRole: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: "NOT_FOUND", message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, mobileNumber: result.mobileNumber, email: result.email });
}
