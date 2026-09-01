import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/auth/requirePartner";
import { MAX_KYC_BYTES, uploadKycDocument } from "@/lib/services/payouts/kycService";
import type { PartnerKycDocKind } from "@prisma/client";

export const runtime = "nodejs";

const KINDS: PartnerKycDocKind[] = ["PAN_CARD", "ID_PROOF", "BANK_PROOF"];

/**
 * One identity document.
 *
 * Re-uploading the same `kind` replaces it rather than adding to a pile — a
 * reviewer must never have to guess which of four PAN photos is the current
 * one. The service deletes the old object once the row points at the new one.
 *
 * The declared content type is not trusted: `uploadKycDocument` sniffs magic
 * bytes and rejects anything that is not really a JPG, PNG, WEBP or PDF. The
 * size check is duplicated here only so an oversized file is refused before it
 * is read into memory.
 */
export async function POST(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) return response;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "File nahi mili." }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "") as PartnerKycDocKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Document type sahi nahi hai." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "File nahi mili." }, { status: 400 });
  }
  if (file.size > MAX_KYC_BYTES) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: "File 8MB se badi nahi honi chahiye." },
      { status: 422 },
    );
  }

  const result = await uploadKycDocument({
    partnerId: partner.id,
    kind,
    buffer: Buffer.from(await file.arrayBuffer()),
    originalName: file.name || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  // The filename is not logged — a partner's own device may have named it
  // after them.
  console.info(`[partner:kyc] partner=${partner.id} kind=${result.kind} doc=${result.documentId}`);
  return NextResponse.json({ ok: true, documentId: result.documentId }, { status: 201 });
}
