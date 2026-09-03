import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { normalizeCode } from "@/lib/services/referral/code";
import { resolveMemberReferralCode } from "@/lib/services/referral/memberCode";
import { appOrigin } from "@/lib/utils/appOrigin";
import {
  MEMBER_REFERRAL_COOKIE,
  MEMBER_REFERRAL_COOKIE_MAX_AGE_SECONDS,
  signMemberReferralCookie,
} from "@/lib/services/referral/memberCookie";

export const runtime = "nodejs";

/** Hashed so a click log can be de-duplicated without storing anyone's IP. */
function hash(value: string | null): string | null {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 32) : null;
}

/**
 * The link a member shares. `/i/` for invite, beside `/r/` for a partner's
 * referral — one character apart so support can tell a screenshot of one from
 * the other, and short enough to survive being read aloud.
 *
 * Records the click, drops a signed attribution cookie, and hands off to
 * registration. An unusable code still redirects to `/register` rather than
 * 404ing: whoever clicked did nothing wrong, and the worst outcome of a
 * retired link should be an ordinary signup, not a dead end.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);

  const owner = await resolveMemberReferralCode(code);

  // Logged even when the code is unusable — a spike of hits on a suspended
  // member's old link is exactly the kind of thing worth being able to see.
  // Shares `referral_clicks` with the partner engine: the table is keyed on a
  // bare code string and has no partner column to be wrong about.
  await prisma.referralClick.create({
    data: {
      code,
      ipHash: hash(req.headers.get("x-forwarded-for")),
      uaHash: hash(req.headers.get("user-agent")),
    },
  });

  const target = new URL("/register", appOrigin());
  if (owner) target.searchParams.set("invite", owner.code);

  const res = NextResponse.redirect(target);
  if (owner) {
    res.cookies.set(MEMBER_REFERRAL_COOKIE, await signMemberReferralCookie(owner.code), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: MEMBER_REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }
  return res;
}
