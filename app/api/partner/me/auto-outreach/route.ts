import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const BodySchema = z.object({ enabled: z.boolean() });

/** The partner's own switch for the automated nudge job. Manual sending is unaffected. */
export async function PATCH(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Value valid nahi hai." }, { status: 422 });
  }

  await prisma.partner.update({
    where: { id: partner.id },
    data: { autoOutreachEnabled: parsed.data.enabled },
  });

  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
