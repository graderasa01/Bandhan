import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { refreshSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { PartnerStatus } from "@prisma/client";

export const runtime = "nodejs";

const PARTNER_TYPES = [
  "PANDIT",
  "MARRIAGE_BUREAU",
  "RISHTA_CONSULTANT",
  "COMMUNITY_COORDINATOR",
  "FAMILY_REFERENCE_PARTNER",
  "WEDDING_VENDOR",
  "OTHER",
] as const;

/**
 * M10 spec §33.1's exact copy, one line per status. A rejected or suspended
 * partner used to be told "application already submitted hai" — factually
 * wrong, and it sends someone whose account was taken away off to wait for a
 * review that is never coming instead of to support.
 */
const EXISTING_PARTNER_MESSAGE: Record<PartnerStatus, string> = {
  PENDING_APPROVAL: "Aapka partner application already submitted hai.",
  APPROVED: "Aap pehle se approved partner hain.",
  ACTIVE: "Aap pehle se approved partner hain.",
  INACTIVE: "Aapka partner account inactive hai. Support se contact karein.",
  REJECTED: "Aapki application reject ho chuki hai. Support se contact karein.",
  SUSPENDED: "Aapka partner account suspended hai. Support se contact karein.",
};

const ApplySchema = z.object({
  fullName: z.string().trim().min(2, "Naam kam se kam 2 characters ka hona chahiye.").max(100),
  mobileNumber: z.string().trim().regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile number daaliye."),
  email: z.string().trim().email("Valid email daaliye.").optional().or(z.literal("")),
  city: z.string().trim().min(1, "City zaroori hai.").max(100),
  state: z.string().trim().min(1, "State zaroori hai.").max(100),
  partnerType: z.enum(PARTNER_TYPES),
  organizationName: z.string().trim().max(200).optional().or(z.literal("")),
  experienceYears: z.number().int().min(0).max(100).optional(),
  expectedMonthlyReferrals: z.number().int().min(0).max(10000).optional(),
  knownCommunityOrArea: z.string().trim().max(300).optional().or(z.literal("")),
  notesFromPartner: z.string().trim().max(1000).optional().or(z.literal("")),
  termsAccepted: z.literal(true, { message: "Terms accept karna zaroori hai." }),
  privacyPolicyAccepted: z.literal(true, { message: "Terms accept karna zaroori hai." }),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ApplySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Kripya sabhi required fields bharein." },
      { status: 422 },
    );
  }

  const existing = await prisma.partner.findUnique({ where: { userId: user.id } });
  if (existing) {
    return NextResponse.json(
      { error: "ALREADY_EXISTS", message: EXISTING_PARTNER_MESSAGE[existing.status] },
      { status: 409 },
    );
  }

  const d = parsed.data;

  const partner = await prisma.$transaction(async (tx) => {
    const created = await tx.partner.create({
      data: {
        userId: user.id,
        fullName: d.fullName,
        mobileNumber: d.mobileNumber,
        email: d.email || null,
        city: d.city,
        state: d.state,
        partnerType: d.partnerType,
        organizationName: d.organizationName || null,
        experienceYears: d.experienceYears ?? null,
        expectedMonthlyReferrals: d.expectedMonthlyReferrals ?? null,
        knownCommunityOrArea: d.knownCommunityOrArea || null,
        notesFromPartner: d.notesFromPartner || null,
        status: "PENDING_APPROVAL",
      },
    });

    // Without the role change middleware.ts bounces them straight off
    // /partner/* — they could not even reach their own pending page.
    await tx.user.update({ where: { id: user.id }, data: { role: "PARTNER" } });

    await tx.adminAuditLog.create({
      data: {
        actorId: user.id,
        actorRole: "PARTNER",
        actionType: "PARTNER_APPLICATION_SUBMITTED",
        targetType: "partner",
        targetId: created.id,
        newValue: "PENDING_APPROVAL",
      },
    });

    return created;
  });

  // The cookie still carries role=USER from login, and middleware reads the
  // cookie — without reissuing it the applicant gets bounced off their own
  // /partner/pending page until they happen to log out and back in.
  // `refreshSession` rather than a manual destroy+create: it carries the old
  // session's remember-me tier forward the same way profile completion does
  // (see lib/auth/session.ts) — without that this used to silently drop a
  // 180-day session to 1 day the moment someone applied to become a partner.
  await refreshSession({ id: user.id, role: "PARTNER", status: user.status }, req);

  return NextResponse.json({ ok: true, partnerId: partner.id, status: partner.status }, { status: 201 });
}
