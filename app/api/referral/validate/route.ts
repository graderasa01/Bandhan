import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeCode } from "@/lib/services/referral/code";
import { createRateLimiter } from "@/app/api/_shared/rateLimit";

export const runtime = "nodejs";

/**
 * This endpoint is unauthenticated and lets anyone probe whether a code
 * exists, so it needs a ceiling even before it needs a distributed one. See
 * `createRateLimiter` for what that ceiling is and is not.
 */
const rateLimited = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ valid: false, message: "Thodi der baad try karein." }, { status: 429 });
  }

  const codeParam = new URL(req.url).searchParams.get("code");
  if (!codeParam) return NextResponse.json({ valid: false });

  const referralCode = await prisma.referralCode.findUnique({
    where: { code: normalizeCode(codeParam) },
    include: { partner: { select: { fullName: true, city: true, status: true } } },
  });

  const usable =
    referralCode?.active === true &&
    (referralCode.partner.status === "APPROVED" || referralCode.partner.status === "ACTIVE");

  // Deliberately 200 with `valid: false`, never 404 — a distinguishable
  // not-found turns this into a code-enumeration oracle. Only the partner's
  // public-facing name and city are ever returned; never the partner id.
  if (!usable) return NextResponse.json({ valid: false });

  return NextResponse.json({
    valid: true,
    partnerDisplayName: referralCode.partner.fullName,
    partnerCity: referralCode.partner.city,
  });
}
