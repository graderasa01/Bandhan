import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { normalizeCode } from "@/lib/services/referral/code";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  signReferralCookie,
} from "@/lib/services/referral/cookie";

export const runtime = "nodejs";

/** Hashed so a click log can be de-duplicated without storing anyone's IP. */
function hash(value: string | null): string | null {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 32) : null;
}

/**
 * The share target printed on every partner's card and QR. Records the click,
 * drops a signed attribution cookie, and hands off to registration.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);

  const referralCode = await prisma.referralCode.findUnique({
    where: { code },
    include: { partner: { select: { status: true } } },
  });

  const usable =
    referralCode?.active === true &&
    (referralCode.partner.status === "APPROVED" || referralCode.partner.status === "ACTIVE");

  // Log even unusable codes — a spike of hits on a suspended partner's old
  // poster is exactly the kind of thing worth being able to see later.
  await prisma.referralClick.create({
    data: {
      code,
      ipHash: hash(req.headers.get("x-forwarded-for")),
      uaHash: hash(req.headers.get("user-agent")),
    },
  });

  const target = new URL("/register", req.url);
  if (usable) target.searchParams.set("ref", code);

  const res = NextResponse.redirect(target);
  if (usable) {
    res.cookies.set(REFERRAL_COOKIE, await signReferralCookie(code), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }
  return res;
}
