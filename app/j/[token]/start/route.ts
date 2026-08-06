import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  signReferralCookie,
} from "@/lib/services/referral/cookie";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE_SECONDS,
  signInviteCookie,
} from "@/lib/services/referral/inviteCookie";

export const runtime = "nodejs";

/**
 * The "Create my profile" button on `/j/<token>`.
 *
 * A route handler rather than a plain link because cookies can only be set
 * from a handler or a server action — the landing page itself is a server
 * component and cannot. Same division of labour as `/r/<code>`, which is a
 * handler for exactly this reason.
 *
 * Two cookies, deliberately: `bt_ref` is the ordinary partner attribution
 * (identical to a code click, so commission flows the usual way), and `bt_inv`
 * remembers *which invite* this was, so the partner's invite list can show
 * "Join kar liya" rather than leaving them guessing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.partnerInvite.findUnique({
    where: { token },
    select: {
      fullName: true,
      convertedUserId: true,
      partner: {
        select: {
          status: true,
          referralCodes: { where: { active: true }, select: { code: true }, take: 1 },
        },
      },
    },
  });

  const target = new URL("/register", req.url);
  if (!invite) return NextResponse.redirect(target);

  // Already redeemed — send them to login rather than into a registration
  // they'll only fail with "account already exists".
  if (invite.convertedUserId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const partnerActive = invite.partner.status === "APPROVED" || invite.partner.status === "ACTIVE";
  const code = partnerActive ? (invite.partner.referralCodes[0]?.code ?? null) : null;

  if (code) target.searchParams.set("ref", code);
  // Pre-fills the name field with what the partner typed. The invited person
  // can change it — it is a convenience, not an assertion about who they are.
  target.searchParams.set("name", invite.fullName);

  const res = NextResponse.redirect(target);

  if (code) {
    res.cookies.set(REFERRAL_COOKIE, await signReferralCookie(code), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  res.cookies.set(INVITE_COOKIE, await signInviteCookie(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: INVITE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return res;
}
