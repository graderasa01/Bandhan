import "server-only";
import { prisma } from "@/lib/db/prisma";
import { verificationProviderStatus } from "@/lib/services/verification/contactVerification/contactVerificationService";
import type { ManagedDraftCreatorKind, Partner, User } from "@prisma/client";

/**
 * Who is allowed to start, hold or claim a managed draft — in one place.
 *
 * Every route that touches a managed draft calls into this file rather than
 * re-deriving "is this partner allowed". Partner status rules already live in
 * three places in this codebase (`requirePartner`, the route matrix, each
 * page's own call); a fourth copy specific to this feature is how a suspended
 * partner ends up still able to reach one screen nobody remembered to update.
 */

/* ------------------------------------------------------------------ */
/* Creator — partner                                                   */
/* ------------------------------------------------------------------ */

/** Partner statuses that may create and hold client drafts. */
export const DRAFT_CREATOR_PARTNER_STATUSES = ["APPROVED", "ACTIVE"] as const;

export type EligibilityBlock =
  | "NOT_AUTHENTICATED"
  | "NOT_A_PARTNER"
  | "PARTNER_STATUS"
  | "PARTNER_CONTACT_UNVERIFIED"
  | "ACCOUNT_NOT_USABLE"
  | "OWNER_CONTACT_UNVERIFIED";

export type CreatorEligibility =
  | { ok: true; partner: Partner | null; kind: ManagedDraftCreatorKind }
  | { ok: false; block: EligibilityBlock; message: string; ctaHref: string | null; status: number };

/**
 * Can this signed-in partner create/continue a client draft?
 *
 * Three gates, in the order a partner would hit them:
 *
 *  1. **A Partner row exists** — the User role alone is not enough; the row is
 *     what an admin approved.
 *  2. **Status is APPROVED or ACTIVE** — the same bar `/partner/leads` uses.
 *     INACTIVE/SUSPENDED/REJECTED may not start new client work, though
 *     nothing they already contributed is deleted.
 *  3. **Their own contact is verified** — provider-aware, exactly the shape
 *     `getPartnerContactGate` uses for payouts: a channel whose provider has
 *     no keys is skipped rather than failed. Demanding an OTP the deployment
 *     physically cannot send would not be a safety check, it would be a
 *     permanently closed door. As keys land the gate tightens with no code
 *     change.
 *
 * **KYC is deliberately not a gate here.** The payout flow dropped its KYC
 * requirement on 2026-08-26 (₹500 minimum is the only bar left), so inventing
 * one for drafts would be this feature asserting a policy the rest of the
 * product does not hold — and it would block partners who are perfectly
 * entitled to earn money today. If KYC ever becomes the platform-wide bar,
 * this is the one function that changes.
 */
export async function getPartnerDraftEligibility(userId: string): Promise<CreatorEligibility> {
  const partner = await prisma.partner.findUnique({ where: { userId } });
  if (!partner) {
    return {
      ok: false,
      block: "NOT_A_PARTNER",
      message: "Ye sirf verified BandhanTak partners ke liye hai.",
      ctaHref: "/partner/register",
      status: 403,
    };
  }

  if (!DRAFT_CREATOR_PARTNER_STATUSES.includes(partner.status as (typeof DRAFT_CREATOR_PARTNER_STATUSES)[number])) {
    return {
      ok: false,
      block: "PARTNER_STATUS",
      message: "Aapka partner account abhi client draft banane ke liye active nahi hai.",
      ctaHref: "/partner/pending",
      status: 403,
    };
  }

  const providers = verificationProviderStatus();
  const missing: string[] = [];
  if (providers.phone && partner.mobileNumber && !partner.mobileVerifiedAt) missing.push("mobile number");
  if (providers.email && partner.email && !partner.emailVerifiedAt) missing.push("email");
  if (missing.length > 0) {
    return {
      ok: false,
      block: "PARTNER_CONTACT_UNVERIFIED",
      message: `Client ka draft banane se pehle apna ${missing.join(" aur ")} verify kariye.`,
      ctaHref: "/partner/verify-contact",
      status: 403,
    };
  }

  return { ok: true, partner, kind: "PARTNER" };
}

/* ------------------------------------------------------------------ */
/* Creator — family                                                    */
/* ------------------------------------------------------------------ */

/**
 * Can this signed-in member start a private family draft for their adult son
 * or daughter?
 *
 * Lower bar than the partner path on purpose — a parent is not a commercial
 * third party, they are already the person the voice-fill flow was built for
 * (see `VoiceSelfFillStatus`'s schema note). What they still need is a real,
 * usable account: an account that is blocked/suspended/deleted cannot hold
 * somebody else's data, and the same provider-aware contact rule applies for
 * the same reason as above.
 */
export async function getFamilyDraftEligibility(user: User): Promise<CreatorEligibility> {
  if (user.status === "BLOCKED" || user.status === "SUSPENDED" || user.status === "DELETED" || user.deletedAt) {
    return {
      ok: false,
      block: "ACCOUNT_NOT_USABLE",
      message: "Is account se draft nahi banaya ja sakta.",
      ctaHref: null,
      status: 403,
    };
  }

  const providers = verificationProviderStatus();
  const canProve = (providers.phone && user.mobile) || (providers.email && user.email);
  const proven = Boolean(user.mobileVerifiedAt || user.emailVerifiedAt);
  if (canProve && !proven) {
    return {
      ok: false,
      block: "PARTNER_CONTACT_UNVERIFIED",
      message: "Pehle apna mobile ya email verify kariye — uske baad family draft bana sakte hain.",
      ctaHref: "/user/verify-contact",
      status: 403,
    };
  }

  return { ok: true, partner: null, kind: "FAMILY" };
}

/* ------------------------------------------------------------------ */
/* Claimant                                                            */
/* ------------------------------------------------------------------ */

export type ClaimantEligibility =
  | { ok: true }
  | { ok: false; block: EligibilityBlock; message: string; ctaHref: string | null; status: number };

/**
 * Can this signed-in account claim a draft about them?
 *
 * **This gate is hard, not provider-aware** — the deliberate difference from
 * both creator gates above, and worth stating plainly because the two rules
 * look inconsistent side by side.
 *
 * For a creator, contact verification is a *reachability* check: nice to have,
 * and skipping it when no provider is configured costs little. For a claimant
 * it is the entire security property. The claim link is a bearer credential;
 * if a proven contact were also optional, then anyone who was forwarded the
 * link could bind a pile of facts about a real person to a throwaway account,
 * and the person those facts describe would have no way to get them back. So a
 * deployment with no OTP provider cannot claim drafts — which is the correct
 * failure, and is surfaced as a blocking CTA rather than a silent refusal.
 *
 * Google Sign-In already stamps `emailVerifiedAt`, so this is satisfiable
 * today even before Twilio/Resend keys land.
 */
export function getClaimantEligibility(user: User): ClaimantEligibility {
  if (user.role !== "USER") {
    return {
      ok: false,
      block: "ACCOUNT_NOT_USABLE",
      message: "Profile claim karne ke liye apne member account se login kariye.",
      ctaHref: "/login",
      status: 403,
    };
  }

  if (user.status === "BLOCKED" || user.status === "SUSPENDED" || user.status === "DELETED" || user.deletedAt) {
    return {
      ok: false,
      block: "ACCOUNT_NOT_USABLE",
      message: "Is account se profile claim nahi ki ja sakti.",
      ctaHref: null,
      status: 403,
    };
  }

  if (!user.mobileVerifiedAt && !user.emailVerifiedAt) {
    return {
      ok: false,
      block: "OWNER_CONTACT_UNVERIFIED",
      message: "Pehle apna mobile ya email verify kariye — tabhi ye profile aapke naam ho sakti hai.",
      ctaHref: "/user/verify-contact",
      status: 403,
    };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Creator context                                                     */
/* ------------------------------------------------------------------ */

export interface CreatorContext {
  kind: ManagedDraftCreatorKind;
  partnerId: string | null;
  /** How this creator is named in the consent log and to the claimant. */
  label: string;
}

export type CreatorContextResult =
  | { ok: true; context: CreatorContext }
  | { ok: false; block: EligibilityBlock; message: string; ctaHref: string | null; status: number };

/**
 * One signed-in account, one creator identity — decided by role, not by a
 * request body.
 *
 * A PARTNER account creates PARTNER drafts and a USER account creates FAMILY
 * drafts, full stop. Letting the caller pick would mean a partner could file
 * their commercial client work as a "family" draft and dodge the partner
 * status/verification gates entirely, which is the whole point of having two
 * paths.
 */
export async function resolveCreatorContext(user: User): Promise<CreatorContextResult> {
  if (user.role === "PARTNER") {
    const eligibility = await getPartnerDraftEligibility(user.id);
    if (!eligibility.ok) return eligibility;
    return {
      ok: true,
      context: {
        kind: "PARTNER",
        partnerId: eligibility.partner!.id,
        label: `${eligibility.partner!.fullName} (partner)`,
      },
    };
  }

  if (user.role === "USER") {
    const eligibility = await getFamilyDraftEligibility(user);
    if (!eligibility.ok) return eligibility;
    return { ok: true, context: { kind: "FAMILY", partnerId: null, label: `${user.fullName} (family)` } };
  }

  return {
    ok: false,
    block: "ACCOUNT_NOT_USABLE",
    message: "Admin/support account se profile draft nahi banaya ja sakta.",
    ctaHref: null,
    status: 403,
  };
}
