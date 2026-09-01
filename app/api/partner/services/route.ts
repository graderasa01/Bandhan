import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { deactivateService, upsertService } from "@/lib/services/marketplace/partnerListingService";
import { SERVICE_KINDS } from "@/lib/services/marketplace/servicePolicy";
import type { PartnerServiceKind } from "@prisma/client";

export const runtime = "nodejs";

const KINDS = SERVICE_KINDS.map((s) => s.kind) as [PartnerServiceKind, ...PartnerServiceKind[]];

const UpsertSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string().trim().min(3).max(80),
  scope: z.string().max(600).nullable().optional(),
  deliverables: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  priceInPaise: z.number().int().positive(),
  deliveryDays: z.number().int().min(1).max(90),
  acceptSlaHours: z.number().int().min(2).max(168).nullable().optional(),
  cancellationPolicy: z.string().max(400).nullable().optional(),
  isActive: z.boolean(),
});

const DeleteSchema = z.object({ kind: z.enum(KINDS) });

/**
 * Create or re-price one service.
 *
 * The price band and the "at least one deliverable" rule are enforced in
 * `upsertService`, not here — the check script calls that function directly,
 * and a rule that only exists in a route is a rule a script cannot prove.
 */
export async function POST(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = UpsertSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Service ki detail theek nahi hai." }, { status: 422 });
  }

  const result = await upsertService(partner.id, {
    kind: parsed.data.kind,
    name: parsed.data.name,
    scope: parsed.data.scope ?? null,
    deliverables: parsed.data.deliverables,
    priceInPaise: parsed.data.priceInPaise,
    deliveryDays: parsed.data.deliveryDays,
    acceptSlaHours: parsed.data.acceptSlaHours ?? null,
    cancellationPolicy: parsed.data.cancellationPolicy ?? null,
    isActive: parsed.data.isActive,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ serviceId: result.serviceId });
}

/** Deactivate, never delete — a booking points at its service and must keep
 *  being able to describe what was bought. */
export async function DELETE(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = DeleteSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Galat service." }, { status: 422 });
  }

  const result = await deactivateService(partner.id, parsed.data.kind);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
