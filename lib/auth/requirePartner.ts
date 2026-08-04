import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { Partner, PartnerStatus, User } from "@prisma/client";

export type PartnerGate =
  | { user: User; partner: Partner; response: null; redirectTo: null }
  | { user: null; partner: null; response: NextResponse; redirectTo: string };

/**
 * The DB-authoritative half of the partner gate — this is where the route
 * matrix's `allowedPartnerStatuses` is actually enforced.
 *
 * It deliberately does NOT live in `middleware.ts`: middleware runs on the
 * Edge (no Prisma) and can only read JWT claims, which are frozen at login.
 * A partner approved five minutes ago would keep being bounced until they
 * logged out and back in. Middleware keeps doing the cheap role-only check;
 * live partner status is read here, fresh, on every request.
 */
export async function requirePartner(allowed: PartnerStatus[]): Promise<PartnerGate> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      partner: null,
      response: NextResponse.json({ error: "UNAUTHENTICATED", message: "Pehle login karein." }, { status: 401 }),
      redirectTo: "/login",
    };
  }

  const partner = await prisma.partner.findUnique({ where: { userId: user.id } });
  if (!partner) {
    return {
      user: null,
      partner: null,
      response: NextResponse.json({ error: "NOT_FOUND", message: "Partner nahi mila." }, { status: 404 }),
      redirectTo: "/partner/register",
    };
  }

  if (!allowed.includes(partner.status)) {
    return {
      user: null,
      partner: null,
      response: NextResponse.json(
        { error: "FORBIDDEN", message: "Is page ke liye aapka partner status allow nahi hai." },
        { status: 403 },
      ),
      // Every blocked status has a real explanation waiting on /partner/pending.
      redirectTo: "/partner/pending",
    };
  }

  return { user, partner, response: null, redirectTo: null };
}
