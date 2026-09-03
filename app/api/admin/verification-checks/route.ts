import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getT } from "@/lib/i18n/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { getVerificationQueue, openCheck } from "@/lib/services/verification/humanVerificationQueue";
import { VERIFICATION_CATALOG } from "@/lib/services/verification/verificationCatalog";
import type { VerificationKind } from "@prisma/client";

export const runtime = "nodejs";

/** The staff queue. Admin-only, and the only route that can see evidence notes. */
const OpenSchema = z.object({
  subjectUserId: z.string().uuid(),
  kind: z.enum(VERIFICATION_CATALOG.map((e) => e.kind) as [VerificationKind, ...VerificationKind[]]),
});

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json({ ok: true, ...(await getVerificationQueue()) });
}

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = OpenSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    const t = await getT();
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: t("verification.api.invalidRequest", "Request theek nahi hai.") },
      { status: 422 },
    );
  }

  const { checkId } = await openCheck(parsed.data.subjectUserId, parsed.data.kind);
  return NextResponse.json({ ok: true, checkId });
}
