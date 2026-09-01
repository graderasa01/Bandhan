import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { appOrigin } from "@/lib/utils/appOrigin";
import { getClaimantEligibility } from "./managedEligibility";
import { recordConsentEvent } from "./consentLog";
import {
  CLAIM_RATE_WINDOW_MS,
  CLAIM_TOKEN_TTL_MS,
  MAX_CLAIM_LINKS_PER_HOUR,
} from "./managedProfilePolicy";
import type { ManagedDraftCreatorKind, User } from "@prisma/client";

/**
 * The claim link — the one credential that turns somebody else's draft into
 * your own profile data.
 *
 * ## Only the hash is stored
 *
 * Same construction as `PasswordResetToken`: 32 random bytes, base64url, and
 * only `sha256(token)` reaches the database. The raw string exists exactly
 * once — in the response to the request that created it — and is never logged,
 * never written to an audit row, and never returned by a read endpoint.
 *
 * `FamilyMember.inviteToken` stores its raw token and this deliberately does
 * not copy that. The trade is different: a family invite seats a view-only
 * portal user whom the owner already named and can revoke in one tap, whereas
 * this link *binds an identity* to a pile of third-party claims. A leaked
 * database of family invite tokens is bad; a leaked database of raw claim
 * tokens would let the reader become the owner of every unclaimed draft.
 *
 * ## One-shot, race-proof
 *
 * `claimDraft` marks the token used with an
 * `updateMany({ where: { id, usedAt: null } })` and checks the affected count
 * inside the same transaction as the draft binding. Two simultaneous claims
 * therefore produce exactly one winner and one `ALREADY_CLAIMED`, without a
 * lock or a unique index that would have to guess the right column.
 *
 * ## The pre-auth preview shows almost nothing
 *
 * `getClaimPreview` returns who made the draft, what they labelled it, how
 * many answers are in it, and when the link dies. No values — not the name,
 * not the date of birth, not the city, and certainly not income, community or
 * contact details. A claim link forwarded to the wrong WhatsApp group must
 * leak nothing about the person it describes.
 */

const TOKEN_BYTES = 32;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function claimUrlFor(rawToken: string): string {
  return `${appOrigin()}/claim-profile/${rawToken}`;
}

/* ------------------------------------------------------------------ */
/* Issue / rotate / revoke                                             */
/* ------------------------------------------------------------------ */

export type IssueResult =
  | { ok: true; rawToken: string; url: string; expiresAt: Date; regenerated: boolean }
  | { ok: false; error: string; message: string; status: number };

/**
 * Issue a fresh link, invalidating any previous one for this draft.
 *
 * Regeneration revoking the old token is the point, not a side effect: a
 * partner who regenerates because "the first link didn't reach them" must not
 * leave a second working credential loose in a forwarded message.
 */
export async function issueClaimToken(
  draftId: string,
  actorUserId: string,
  actorLabel: string,
): Promise<IssueResult> {
  const draft = await prisma.managedProfileDraft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: false, error: "NOT_FOUND", message: "Ye draft nahi mila.", status: 404 };
  if (draft.claimedByUserId) {
    return {
      ok: false,
      error: "ALREADY_CLAIMED",
      message: "Ye draft claim ho chuka hai — naya link nahi ban sakta.",
      status: 409,
    };
  }
  if (draft.status === "CANCELLED") {
    return { ok: false, error: "CANCELLED", message: "Ye draft band ho chuka hai.", status: 409 };
  }

  const since = new Date(Date.now() - CLAIM_RATE_WINDOW_MS);
  const recent = await prisma.managedDraftClaimToken.count({
    where: { draftId, createdAt: { gt: since } },
  });
  if (recent >= MAX_CLAIM_LINKS_PER_HOUR) {
    return {
      ok: false,
      error: "RATE_LIMITED",
      message: "Ek ghante me itne links kaafi hain. Thodi der baad koshish kariye.",
      status: 429,
    };
  }

  const hadPrevious = await prisma.managedDraftClaimToken.count({
    where: { draftId, usedAt: null, revokedAt: null },
  });

  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.managedDraftClaimToken.updateMany({
      where: { draftId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.managedDraftClaimToken.create({
      data: { draftId, tokenHash: hashToken(rawToken), issuedByUserId: actorUserId, expiresAt },
    });
    await tx.managedProfileDraft.update({
      where: { id: draftId },
      data: { status: "INVITED", claimIssuedAt: new Date(), expiredAt: null },
    });
  });

  await recordConsentEvent({
    kind: hadPrevious > 0 ? "CLAIM_LINK_REGENERATED" : "CLAIM_LINK_ISSUED",
    actorUserId,
    actorLabel,
    draftId,
    // Deliberately no token, not even a prefix — a "safe" fragment in a log is
    // how a 48-hour credential ends up in a screenshot.
    detail: "48 ghante ke liye valid",
  });

  return { ok: true, rawToken, url: claimUrlFor(rawToken), expiresAt, regenerated: hadPrevious > 0 };
}

export async function revokeClaimTokens(
  draftId: string,
  actorUserId: string,
  actorLabel: string,
): Promise<{ ok: true; revoked: number }> {
  const { count } = await prisma.managedDraftClaimToken.updateMany({
    where: { draftId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count > 0) {
    await prisma.managedProfileDraft.updateMany({
      where: { id: draftId, status: "INVITED" },
      data: { status: "DRAFT" },
    });
    await recordConsentEvent({ kind: "CLAIM_LINK_REVOKED", actorUserId, actorLabel, draftId });
  }

  return { ok: true, revoked: count };
}

/* ------------------------------------------------------------------ */
/* Pre-auth preview                                                    */
/* ------------------------------------------------------------------ */

export type ClaimPreviewProblem = "NOT_FOUND" | "EXPIRED" | "REVOKED" | "ALREADY_USED" | "CANCELLED";

export interface ClaimPreview {
  creatorKind: ManagedDraftCreatorKind;
  /** Only for a partner draft, and only when the partner is currently in good
   *  standing — an unverifiable name is worse than no name on a consent screen. */
  partnerName: string | null;
  /** What the creator labelled the draft. Nothing else about the person. */
  displayLabel: string;
  /** A count. Not the keys, and certainly not the values. */
  answeredCount: number;
  expiresAt: string;
}

export type ClaimPreviewResult =
  | { ok: true; preview: ClaimPreview }
  | { ok: false; problem: ClaimPreviewProblem; message: string };

const PROBLEM_MESSAGE: Record<ClaimPreviewProblem, string> = {
  NOT_FOUND: "Ye link kaam nahi kar raha. Jisne bheja hai, unse naya link maangiye.",
  EXPIRED: "Ye link expire ho chuka hai. Jisne bheja hai, unse naya link maangiye.",
  REVOKED: "Ye link band kar diya gaya hai. Jisne bheja hai, unse naya link maangiye.",
  ALREADY_USED: "Ye link pehle hi istemaal ho chuka hai.",
  CANCELLED: "Ye draft band ho chuka hai.",
};

function problem(p: ClaimPreviewProblem): { ok: false; problem: ClaimPreviewProblem; message: string } {
  return { ok: false, problem: p, message: PROBLEM_MESSAGE[p] };
}

export async function getClaimPreview(rawToken: string): Promise<ClaimPreviewResult> {
  const row = await prisma.managedDraftClaimToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      draft: {
        include: {
          partner: { select: { fullName: true, status: true } },
          _count: { select: { fields: true } },
        },
      },
    },
  });

  if (!row) return problem("NOT_FOUND");
  if (row.usedAt) return problem("ALREADY_USED");
  if (row.revokedAt) return problem("REVOKED");
  if (row.expiresAt.getTime() <= Date.now()) return problem("EXPIRED");
  if (row.draft.status === "CANCELLED") return problem("CANCELLED");
  if (row.draft.claimedByUserId) return problem("ALREADY_USED");

  const partnerInGoodStanding =
    row.draft.partner && (row.draft.partner.status === "ACTIVE" || row.draft.partner.status === "APPROVED");

  return {
    ok: true,
    preview: {
      creatorKind: row.draft.creatorKind,
      partnerName: partnerInGoodStanding ? row.draft.partner!.fullName : null,
      displayLabel: row.draft.displayLabel,
      answeredCount: row.draft._count.fields,
      expiresAt: row.expiresAt.toISOString(),
    },
  };
}

/**
 * Is the signed-in account the one that created this draft?
 *
 * Answered as a boolean and never as an id, so the claim page can show the
 * creator "you cannot claim your own client's draft" without that page ever
 * learning who the creator is when the answer is no.
 */
export async function isClaimTokenCreator(rawToken: string, userId: string): Promise<boolean> {
  const row = await prisma.managedDraftClaimToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { draft: { select: { creatorUserId: true } } },
  });
  return row?.draft.creatorUserId === userId;
}

/* ------------------------------------------------------------------ */
/* Claim                                                               */
/* ------------------------------------------------------------------ */

export type ClaimResult =
  | { ok: true; draftId: string }
  | { ok: false; error: string; message: string; status: number; ctaHref?: string | null };

/**
 * Bind this draft to the signed-in account. Transactional, one-shot, and it
 * refuses the creator claiming their own client's draft — which would let a
 * partner quietly hold both sides of the consent conversation.
 */
export async function claimDraft(rawToken: string, user: User): Promise<ClaimResult> {
  const eligibility = getClaimantEligibility(user);
  if (!eligibility.ok) {
    return {
      ok: false,
      error: eligibility.block,
      message: eligibility.message,
      status: eligibility.status,
      ctaHref: eligibility.ctaHref,
    };
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  try {
    const draftId = await prisma.$transaction(async (tx) => {
      const row = await tx.managedDraftClaimToken.findUnique({
        where: { tokenHash },
        include: { draft: true },
      });
      if (!row) throw new ClaimError("INVALID_TOKEN", PROBLEM_MESSAGE.NOT_FOUND, 404);
      if (row.usedAt) throw new ClaimError("ALREADY_CLAIMED", PROBLEM_MESSAGE.ALREADY_USED, 409);
      if (row.revokedAt) throw new ClaimError("REVOKED", PROBLEM_MESSAGE.REVOKED, 410);
      if (row.expiresAt.getTime() <= now.getTime()) throw new ClaimError("EXPIRED", PROBLEM_MESSAGE.EXPIRED, 410);

      const draft = row.draft;
      if (draft.status === "CANCELLED") throw new ClaimError("CANCELLED", PROBLEM_MESSAGE.CANCELLED, 409);
      if (draft.claimedByUserId) throw new ClaimError("ALREADY_CLAIMED", PROBLEM_MESSAGE.ALREADY_USED, 409);
      if (draft.creatorUserId === user.id) {
        throw new ClaimError(
          "CREATOR_CANNOT_CLAIM",
          "Jo draft aapne banaya hai, use aap khud claim nahi kar sakte.",
          403,
        );
      }

      // The race guard: whoever's UPDATE affects a row wins, and the other
      // transaction sees zero and aborts.
      const used = await tx.managedDraftClaimToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now, usedByUserId: user.id },
      });
      if (used.count !== 1) throw new ClaimError("ALREADY_CLAIMED", PROBLEM_MESSAGE.ALREADY_USED, 409);

      const bound = await tx.managedProfileDraft.updateMany({
        where: { id: draft.id, claimedByUserId: null },
        data: {
          claimedByUserId: user.id,
          claimedAt: now,
          status: "UNDER_REVIEW",
          reviewStartedAt: now,
        },
      });
      if (bound.count !== 1) throw new ClaimError("ALREADY_CLAIMED", PROBLEM_MESSAGE.ALREADY_USED, 409);

      // Every other outstanding link for this draft dies with the claim.
      await tx.managedDraftClaimToken.updateMany({
        where: { draftId: draft.id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });

      return draft.id;
    });

    await recordConsentEvent({
      kind: "DRAFT_CLAIMED",
      ownerUserId: user.id,
      actorUserId: user.id,
      actorLabel: user.fullName,
      draftId,
    });

    return { ok: true, draftId };
  } catch (err) {
    if (err instanceof ClaimError) {
      return { ok: false, error: err.code, message: err.message, status: err.status };
    }
    throw err;
  }
}

class ClaimError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
