import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeCode } from "@/lib/services/referral/code";

export const runtime = "nodejs";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * In-memory limiter — enough for a single dev/app instance. This endpoint is
 * unauthenticated and lets anyone probe whether a code exists, so it needs a
 * ceiling even before it needs a distributed one.
 */
function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

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
