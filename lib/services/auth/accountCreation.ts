import "server-only";
import { prisma } from "@/lib/db/prisma";
import { normalizeCode } from "@/lib/services/referral/code";
import { REFERRAL_COOKIE, readReferralCookie } from "@/lib/services/referral/cookie";
import { INVITE_COOKIE, readInviteCookie } from "@/lib/services/referral/inviteCookie";
import { markInviteJoined } from "@/lib/services/outreach/inviteService";

/**
 * Creating a member account — the one transaction both doors share.
 *
 * `/api/auth/register` (typed form, password) and `/api/bolo/complete`
 * (spoken profile, OTP, no password) create the same `User` row and owe the
 * same partner the same referral credit. Attribution used to live inline in
 * the register route; a second door that forgot it would quietly cost a
 * partner their commission, so it lives here now and both routes call it.
 *
 * Attribution rules, unchanged:
 *   - a code the person typed wins over the cookie a link set earlier;
 *   - a bad or expired code never costs anyone their account — the account is
 *     created either way and the referral row is simply not written;
 *   - the invite bookkeeping runs *after* the transaction and is best-effort,
 *     because a failing write there must not undo a valid account.
 */

/** The cookie jar shape both `next/headers` and a route's request offer. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface CreateMemberAccountInput {
  fullName: string;
  mobile?: string | null;
  email?: string | null;
  /** Null for a passwordless (OTP / Google) account. */
  passwordHash?: string | null;
  mobileVerifiedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  /** A referral code the person typed, if any. */
  referralCode?: string | null;
  jar: CookieReader;
}

export async function createMemberAccount(input: CreateMemberAccountInput) {
  const cookieCode = await readReferralCookie(input.jar.get(REFERRAL_COOKIE)?.value);
  const typed = input.referralCode?.trim() ? normalizeCode(input.referralCode) : null;
  const candidateCode = typed ?? cookieCode;

  const attributedTo = candidateCode
    ? await prisma.referralCode.findUnique({
        where: { code: candidateCode },
        include: { partner: { select: { id: true, status: true } } },
      })
    : null;
  const attributable =
    attributedTo?.active === true &&
    (attributedTo.partner.status === "APPROVED" || attributedTo.partner.status === "ACTIVE");

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName,
        mobile: input.mobile ?? undefined,
        email: input.email ?? undefined,
        passwordHash: input.passwordHash ?? null,
        mobileVerifiedAt: input.mobileVerifiedAt ?? undefined,
        emailVerifiedAt: input.emailVerifiedAt ?? undefined,
        role: "USER",
        status: "INCOMPLETE",
      },
    });

    if (attributable && attributedTo) {
      await tx.partnerReferral.create({
        data: {
          userId: created.id,
          partnerId: attributedTo.partner.id,
          codeUsed: attributedTo.code,
          attributionMethod: typed ? "CODE" : "LINK",
        },
      });
    }

    return created;
  });

  const inviteToken = await readInviteCookie(input.jar.get(INVITE_COOKIE)?.value);
  if (inviteToken) await markInviteJoined(inviteToken, user.id);

  return user;
}
