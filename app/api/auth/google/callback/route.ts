import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { postLoginPathWithNext } from "@/lib/auth/postLoginPath";
import {
  GOOGLE_STATE_COOKIE,
  exchangeCodeForIdentity,
  googleConfig,
  googleRedirectUri,
  verifyState,
  type GoogleIdentity,
} from "@/lib/auth/google";
import { REFERRAL_COOKIE, readReferralCookie } from "@/lib/services/referral/cookie";
import type { User } from "@prisma/client";

export const runtime = "nodejs";

/**
 * Where Google sends the user back.
 *
 * Every failure lands on `/login?error=…` rather than a JSON body: this is a
 * top-level browser navigation, so a 400 with `{"error":…}` would leave the
 * user staring at raw JSON with no way back.
 */

function fail(req: Request, reason: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}

export async function GET(req: Request) {
  const config = googleConfig();
  if (!config) return fail(req, "google_unavailable");

  const url = new URL(req.url);
  // Google reports user cancellation as ?error=access_denied — a normal thing
  // to do, so it goes back to the login page quietly rather than as a failure.
  if (url.searchParams.get("error")) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(req, "google_failed");

  const jar = await cookies();
  const { ok, next } = verifyState(state, jar.get(GOOGLE_STATE_COOKIE)?.value ?? "");
  if (!ok) return fail(req, "google_state");

  const identity = await exchangeCodeForIdentity({
    code,
    redirectUri: googleRedirectUri(req),
    config,
  });
  if (!identity) return fail(req, "google_failed");

  // Google can issue an ID token for an address the account has not proven it
  // owns. Since `resolveUser` links by email, accepting one would let a
  // stranger claim an existing BandhanTak account.
  if (!identity.emailVerified) return fail(req, "google_unverified");

  const referralCode = await readReferralCookie(jar.get(REFERRAL_COOKIE)?.value);
  const user = await resolveUser(identity, referralCode);

  if (user.status === "BLOCKED" || user.status === "DELETED" || user.deletedAt) {
    return fail(req, "account_blocked");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({
    userId: user.id,
    role: user.role,
    status: user.status,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
    // Google Sign-In is the "don't make me type a password" path; a 24-hour
    // session would defeat the point of choosing it.
    rememberMe: true,
  });

  console.info(`[auth:google] user=${user.id}`);

  // Role-aware: a brand-new account has no profile yet so the interview is the
  // only useful destination, but this used to hardcode the USER answer and a
  // PARTNER signing in with Google was sent to /user/dashboard and bounced by
  // middleware onto the public homepage. Same resolver as the password login.
  const destination = await postLoginPathWithNext(user, next);

  const res = NextResponse.redirect(new URL(destination, req.url));
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}

/**
 * Three cases, in this order:
 *
 *  1. **Known Google account** — matched on `googleId`, the only field Google
 *     guarantees is stable. Straight in.
 *  2. **Existing password account with the same verified email** — linked, not
 *     duplicated. Someone who registered with an email and later taps "Continue
 *     with Google" means *this account*, and silently creating a second one
 *     would strand their profile, matches and subscription behind a password
 *     they may no longer remember. The link is safe precisely because
 *     `emailVerified` was checked first. Their password keeps working.
 *  3. **Nobody** — a new INCOMPLETE user with no password at all, carrying any
 *     partner referral the cookie was holding, exactly as `/api/auth/register`
 *     would have done.
 */
async function resolveUser(identity: GoogleIdentity, referralCode: string | null): Promise<User> {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: identity.googleId } });
  if (byGoogleId) {
    // Keep the avatar fresh; nothing else about the account is Google's to own.
    if (identity.picture && identity.picture !== byGoogleId.avatarUrl) {
      return prisma.user.update({
        where: { id: byGoogleId.id },
        data: { avatarUrl: identity.picture },
      });
    }
    return byGoogleId;
  }

  const byEmail = await prisma.user.findFirst({
    where: { email: identity.email, deletedAt: null },
  });
  if (byEmail) {
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: identity.googleId,
        avatarUrl: identity.picture ?? byEmail.avatarUrl,
        // Google has verified this address, which is more than the app itself
        // ever did for a self-registered email.
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
      },
    });
  }

  const attributedTo = referralCode
    ? await prisma.referralCode.findUnique({
        where: { code: referralCode },
        include: { partner: { select: { id: true, status: true } } },
      })
    : null;
  const attributable =
    attributedTo?.active === true &&
    (attributedTo.partner.status === "APPROVED" || attributedTo.partner.status === "ACTIVE");

  return prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: identity.name?.trim() || identity.email.split("@")[0],
        email: identity.email,
        googleId: identity.googleId,
        avatarUrl: identity.picture,
        emailVerifiedAt: new Date(),
        passwordHash: null,
        role: "USER",
        status: "INCOMPLETE",
      },
    });

    // Same rule as `/api/auth/register`: a dead code must never cost someone
    // their account.
    if (attributable && attributedTo) {
      await tx.partnerReferral.create({
        data: {
          userId: created.id,
          partnerId: attributedTo.partner.id,
          codeUsed: attributedTo.code,
          attributionMethod: "LINK",
        },
      });
    }

    return created;
  });
}
