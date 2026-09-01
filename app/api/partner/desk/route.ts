import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/auth/requirePartner";
import { listClientsForPartner } from "@/lib/services/clientDesk/clientDeskService";

export const runtime = "nodejs";

/** Every client this partner currently holds a live delegation for. Keyed by
 *  the session's partner row — there is no id to substitute. */
export async function GET() {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;
  return NextResponse.json({ clients: await listClientsForPartner(partner.id) });
}
