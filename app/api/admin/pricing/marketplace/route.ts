import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import {
  setServiceBand,
  setServiceMoney,
  setServicePriceOverride,
  setVerificationFee,
} from "@/lib/services/marketplace/pricingControl";
import { SERVICE_KINDS } from "@/lib/services/marketplace/servicePolicy";
import { REQUESTABLE_KINDS } from "@/lib/services/verification/verificationCatalog";
import type { PartnerServiceKind, VerificationKind } from "@prisma/client";

export const runtime = "nodejs";

/**
 * Every marketplace price, from one admin endpoint.
 *
 * Four actions rather than four routes: they share an actor, an audit shape and
 * a single screen, and splitting them would mean four places to forget
 * `requireAdmin`. Each one validates its own range inside `pricingControl` —
 * this file only decides who may call it.
 */
const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("money"),
    platformFeeBps: z.number().int().optional(),
    acceptSlaHours: z.number().int().optional(),
    refundWindowDays: z.number().int().optional(),
    minWithdrawalPaise: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("band"),
    kind: z.enum(SERVICE_KINDS.map((s) => s.kind) as [PartnerServiceKind, ...PartnerServiceKind[]]),
    minPricePaise: z.number().int(),
    maxPricePaise: z.number().int(),
  }),
  z.object({
    action: z.literal("verification-fee"),
    kind: z.enum(REQUESTABLE_KINDS as [VerificationKind, ...VerificationKind[]]),
    feePaise: z.number().int(),
  }),
  z.object({
    action: z.literal("service-override"),
    serviceId: z.string().uuid(),
    /** Null clears the override and hands the price back to the partner. */
    pricePaise: z.number().int().nullable(),
    note: z.string().min(3).max(300),
  }),
]);

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Request theek nahi hai." },
      { status: 422 },
    );
  }

  const actor = { actorId: user.id, actorRole: user.role };
  const body = parsed.data;

  const result =
    body.action === "money"
      ? await setServiceMoney(body, actor)
      : body.action === "band"
        ? await setServiceBand(
            body.kind,
            { minPricePaise: body.minPricePaise, maxPricePaise: body.maxPricePaise },
            actor,
          )
        : body.action === "verification-fee"
          ? await setVerificationFee(body.kind, body.feePaise, actor)
          : await setServicePriceOverride(body.serviceId, body.pricePaise, body.note, actor);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
