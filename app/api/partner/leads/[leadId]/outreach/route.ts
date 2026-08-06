import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { prisma } from "@/lib/db/prisma";
import { leadStatus } from "@/lib/partner/visibility";
import { sendToLead } from "@/lib/services/outreach/outreachService";

export const runtime = "nodejs";

const BodySchema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL"]),
});

/**
 * "BandhanTak se bhejein" — the partner asks us to send the follow-up instead
 * of sending it from their own phone.
 *
 * `leadId` is the PartnerReferral row's id, never a user id (see
 * `toPartnerLead`), and it is looked up scoped to *this* partner. A partner
 * holding another partner's lead id gets a 404, not somebody else's message.
 *
 * The response deliberately carries nothing about the recipient — not the
 * number it went to, not a masked version of it. The partner learns whether it
 * sent, and that is all they ever learn here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Channel valid nahi hai." }, { status: 422 });
  }

  const { leadId } = await params;
  const referral = await prisma.partnerReferral.findFirst({
    where: { id: leadId, partnerId: partner.id },
    select: {
      userId: true,
      user: {
        select: {
          createdAt: true,
          lastLoginAt: true,
          profile: { select: { profileCompletionScore: true } },
          subscriptions: {
            where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: new Date() } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!referral) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye lead aapki list me nahi hai." }, { status: 404 });
  }

  // Recomputed here rather than trusted from the client: the status decides
  // which template goes out, and a client that could name its own status could
  // send a paid member the "please finish your profile" nudge.
  const status = leadStatus({
    completionScore: referral.user.profile?.profileCompletionScore ?? 0,
    hasProfile: referral.user.profile !== null,
    hasPlan: referral.user.subscriptions.length > 0,
    lastActiveAt: referral.user.lastLoginAt ?? referral.user.createdAt,
  });

  const outcome = await sendToLead({
    partnerId: partner.id,
    partnerName: partner.fullName,
    userId: referral.userId,
    leadStatus: status,
    channel: parsed.data.channel,
    trigger: "MANUAL",
  });

  if (!outcome.ok) {
    // 409 for cooldown (the request was well-formed, the state says no), 502
    // for a provider that failed us rather than a partner who did anything
    // wrong.
    const httpStatus = outcome.reason === "cooldown" ? 409 : outcome.reason === "no_contact" ? 422 : 502;
    return NextResponse.json({ ok: false, reason: outcome.reason, message: outcome.message }, { status: httpStatus });
  }

  return NextResponse.json({ ok: true, channel: outcome.channel });
}
