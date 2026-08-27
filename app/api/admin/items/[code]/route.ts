import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { deleteItem } from "@/lib/services/items/itemAdminService";

export const runtime = "nodejs";

/**
 * Deletes an admin-created item nobody has bought. Built-ins and anything with
 * a payment against it are refused by the service — see `deleteItem` for why
 * those are switched off rather than removed.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { code } = await params;
  const result = await deleteItem(code, user.id, user.role);
  if (!result.ok) {
    return NextResponse.json({ error: "REJECTED", message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
