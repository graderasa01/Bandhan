import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { readKycDocumentForAdmin } from "@/lib/services/payouts/kycService";

export const runtime = "nodejs";

/**
 * The bytes of one identity document, for an admin, with an audit row.
 *
 * GET rather than POST — unlike `revealPayoutDestination`, this has to be
 * openable in an `<img src>` and a new tab, and a POST cannot be either. The
 * audit row is therefore written on a request that a prefetch could in
 * principle fire; that is the accepted cost of the document being *viewable*
 * at all, and an extra log line is a far better failure than an admin who
 * approves KYC without opening the card.
 *
 * `Content-Disposition: inline` with `nosniff` and a `no-store` cache: the
 * file must render in place, must be typed exactly as stored, and must not
 * survive in any shared cache after the review is done.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { documentId } = await params;
  const result = await readKycDocumentForAdmin({
    documentId,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "NOT_AVAILABLE", message: result.message }, { status: result.status });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.buffer.byteLength),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
