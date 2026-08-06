import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { createInvite } from "@/lib/services/outreach/inviteService";

export const runtime = "nodejs";

/**
 * `consent` is required to be literally `true`, not merely present. This is
 * the partner attesting they actually spoke to the person before we message a
 * stranger on their say-so — see `PartnerInvite.consentAttestedAt`. A schema
 * that accepted `false` would make the checkbox decorative.
 */
const BodySchema = z
  .object({
    full_name: z.string().trim().min(2, "Naam kam se kam 2 characters ka hona chahiye."),
    mobile: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile number daaliye.")
      .optional()
      .or(z.literal("")),
    email: z.string().trim().email("Valid email daaliye.").optional().or(z.literal("")),
    channel: z.enum(["WHATSAPP", "EMAIL", "SELF"]),
    consent: z.literal(true, { message: "Pehle confirm karein ki aapne inse baat kar li hai." }),
  })
  .refine((d) => (d.mobile && d.mobile !== "") || (d.email && d.email !== ""), {
    message: "Mobile ya email me se ek zaroori hai.",
    path: ["mobile"],
  });

export async function POST(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  const { full_name, mobile, email, channel } = parsed.data;

  const result = await createInvite({
    partnerId: partner.id,
    partnerName: partner.fullName,
    fullName: full_name,
    mobile: mobile ? mobile : null,
    email: email ? email : null,
    channel: channel === "SELF" ? null : channel,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    status: result.invite.status,
    inviteUrl: result.inviteUrl,
    shareText: result.shareText,
    // Non-null when we tried to send and the provider refused. The invite
    // still exists and its link still works, so this is a warning on a
    // successful request rather than an error response.
    sendError: result.sendError,
  });
}
