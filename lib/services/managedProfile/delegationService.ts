import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordConsentEvent } from "./consentLog";
import {
  CONSENT_VERSION,
  DEFAULT_DELEGATION_DAYS,
  MAX_DELEGATION_DAYS,
  PERMISSION_LABELS,
  consentTextFor,
  sanitizePermissions,
} from "./managedProfilePolicy";
import type { ProfileDelegation, ProfileDelegatePermission } from "@prisma/client";

/**
 * Delegated access — granted by the owner, scoped, expiring, revocable.
 *
 * ## The one function that matters
 *
 * `hasDelegatedPermission` is the gate every delegate-facing read and write
 * goes through. It is deliberately a *fresh query* rather than something
 * cached on a session: revocation has to bite on the next request, and a
 * permission cached in a JWT would keep working until the delegate logged out.
 * The same reasoning `requirePartner` gives for not living in middleware.
 *
 * ## Expiry without a cron
 *
 * Nothing in this codebase runs on a scheduler (see `DailyReel.reelDate`,
 * `CircleEvent`). An expired grant is therefore *computed* on read and written
 * through the first time anybody notices — so a deployment with zero workers
 * still refuses an expired delegate, and the stored status catches up on its
 * own without a background job that could be missing.
 */

export type DelegationHelperKind = "PARTNER" | "FAMILY";

/** Live means: ACTIVE, not revoked, and not past its expiry. */
export function isDelegationLive(
  d: Pick<ProfileDelegation, "status" | "revokedAt" | "expiresAt">,
  now = new Date(),
): boolean {
  if (d.status !== "ACTIVE") return false;
  if (d.revokedAt) return false;
  if (d.expiresAt && d.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Does `delegateUserId` currently hold `permission` over `ownerUserId`?
 *
 * Returns false for every "not sure" case — no row, wrong owner, expired,
 * revoked, permission not in the granted set. There is no default-allow branch
 * in this function, which is the point.
 */
export async function hasDelegatedPermission(
  delegateUserId: string,
  ownerUserId: string,
  permission: ProfileDelegatePermission,
): Promise<boolean> {
  const rows = await prisma.profileDelegation.findMany({
    where: { delegateUserId, ownerUserId, status: "ACTIVE" },
  });
  const now = new Date();

  const expired = rows.filter((r) => !isDelegationLive(r, now));
  if (expired.length > 0) {
    // Write-through so the owner's Access screen and the delegate's next
    // request agree, without a scheduler.
    await prisma.profileDelegation.updateMany({
      where: { id: { in: expired.map((r) => r.id) }, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
  }

  return rows.some((r) => isDelegationLive(r, now) && r.permissions.includes(permission));
}

export interface GrantDelegationInput {
  ownerUserId: string;
  actorUserId: string;
  draftId?: string | null;
  partnerId?: string | null;
  familyMemberId?: string | null;
  delegateUserId?: string | null;
  permissions: unknown;
  days?: number;
  helperLabel: string;
  reason?: string | null;
}

export type GrantResult =
  | { ok: true; delegation: ProfileDelegation }
  | { ok: false; error: string; message: string; status: number };

/**
 * Grant (or re-grant) access. Only ever called with the owner as the signed-in
 * actor — `ownerUserId` is taken from the session by every caller, never from
 * a request body.
 */
export async function grantDelegation(input: GrantDelegationInput): Promise<GrantResult> {
  const permissions = sanitizePermissions(input.permissions);
  if (permissions.length === 0) {
    return {
      ok: false,
      error: "NO_PERMISSIONS",
      message: "Kam se kam ek permission chunni hogi.",
      status: 422,
    };
  }

  if (!input.partnerId && !input.familyMemberId) {
    return { ok: false, error: "NO_DELEGATE", message: "Kis ko permission deni hai, ye missing hai.", status: 422 };
  }

  const days = clampDays(input.days);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const consentText = consentTextFor(input.helperLabel, permissions, days);

  // A live grant to the same helper is updated in place rather than stacked —
  // two ACTIVE rows for one helper would make the owner's Revoke button
  // ambiguous, which is the last place ambiguity belongs.
  const existing = await prisma.profileDelegation.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      status: "ACTIVE",
      ...(input.partnerId ? { partnerId: input.partnerId } : { familyMemberId: input.familyMemberId }),
    },
  });

  const delegation = existing
    ? await prisma.profileDelegation.update({
        where: { id: existing.id },
        data: {
          permissions,
          expiresAt,
          consentText,
          consentVersion: CONSENT_VERSION,
          reason: input.reason ?? null,
          delegateUserId: input.delegateUserId ?? existing.delegateUserId,
          sourceDraftId: input.draftId ?? existing.sourceDraftId,
        },
      })
    : await prisma.profileDelegation.create({
        data: {
          ownerUserId: input.ownerUserId,
          delegateUserId: input.delegateUserId ?? null,
          partnerId: input.partnerId ?? null,
          familyMemberId: input.familyMemberId ?? null,
          sourceDraftId: input.draftId ?? null,
          status: "ACTIVE",
          permissions,
          consentText,
          consentVersion: CONSENT_VERSION,
          reason: input.reason ?? null,
          activatedAt: now,
          expiresAt,
          grantedBy: input.actorUserId,
        },
      });

  await recordConsentEvent({
    kind: existing ? "DELEGATION_EXPIRY_CHANGED" : "DELEGATION_GRANTED",
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    actorLabel: input.helperLabel,
    draftId: input.draftId ?? null,
    delegationId: delegation.id,
    detail: `${permissions.length} permission, ${days} din`,
  });

  return { ok: true, delegation };
}

function clampDays(days: number | undefined): number {
  if (typeof days !== "number" || !Number.isFinite(days)) return DEFAULT_DELEGATION_DAYS;
  return Math.max(1, Math.min(MAX_DELEGATION_DAYS, Math.round(days)));
}

export type RevokeResult =
  | { ok: true; delegation: ProfileDelegation }
  | { ok: false; error: string; message: string; status: number };

/**
 * Revoke. Takes effect on the delegate's *next* request because
 * `hasDelegatedPermission` re-reads this row every time — there is nothing to
 * invalidate and no cache to wait out.
 *
 * Note what this does **not** do: it does not touch the owner's profile, their
 * confirmed values, or the consent history. Ending a helping relationship must
 * never cost the owner the work that came out of it.
 */
export async function revokeDelegation(
  ownerUserId: string,
  delegationId: string,
  actorUserId: string,
): Promise<RevokeResult> {
  const row = await prisma.profileDelegation.findUnique({
    where: { id: delegationId },
    include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
  });

  // Same 404 for "no such row" and "somebody else's row" — a delegation id is
  // not a lookup service.
  if (!row || row.ownerUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye permission nahi mili.", status: 404 };
  }

  if (row.status === "REVOKED") {
    return { ok: true, delegation: row };
  }

  const updated = await prisma.profileDelegation.update({
    where: { id: delegationId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedBy: actorUserId },
  });

  await recordConsentEvent({
    kind: "DELEGATION_REVOKED",
    ownerUserId,
    actorUserId,
    actorLabel: row.partner?.fullName ?? row.familyMember?.displayName ?? "Helper",
    draftId: row.sourceDraftId,
    delegationId: row.id,
  });

  return { ok: true, delegation: updated };
}

export type UpdateScopeResult =
  | { ok: true; delegation: ProfileDelegation }
  | { ok: false; error: string; message: string; status: number };

/**
 * The owner changing what an existing helper may do.
 *
 * Phase 3 needs this because the Client Desk's permissions are deliberately
 * *not* offered at claim time (see `CLAIM_TIME_PERMISSIONS`) — "search on my
 * behalf" is a decision an owner makes after working with a partner, not in
 * the same breath as claiming their own profile. So it has to be grantable
 * later, from the one screen that already owns this relationship.
 *
 * Narrowing is as important as widening: an owner who wants to stop the
 * searching but keep the profile help should not have to revoke and re-grant.
 * Passing an empty set is refused rather than treated as "revoke" — those are
 * different intentions and Revoke is its own button with its own confirmation.
 */
export async function updateDelegationScope(params: {
  ownerUserId: string;
  delegationId: string;
  permissions: unknown;
  days?: number;
}): Promise<UpdateScopeResult> {
  const row = await prisma.profileDelegation.findUnique({
    where: { id: params.delegationId },
    include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
  });
  if (!row || row.ownerUserId !== params.ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye permission nahi mili.", status: 404 };
  }
  if (row.status !== "ACTIVE" || !isDelegationLive(row)) {
    return { ok: false, error: "BAD_STATE", message: "Ye access ab active nahi hai.", status: 409 };
  }

  const permissions = sanitizePermissions(params.permissions);
  if (permissions.length === 0) {
    return {
      ok: false,
      error: "NO_PERMISSIONS",
      message: "Kam se kam ek permission rakhni hogi — poora access hatana ho to Revoke use kariye.",
      status: 422,
    };
  }

  const helperLabel = row.partner?.fullName ?? row.familyMember?.displayName ?? "Helper";
  const days = clampDays(params.days) ;
  const expiresAt = params.days === undefined ? row.expiresAt : new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const updated = await prisma.profileDelegation.update({
    where: { id: params.delegationId },
    data: {
      permissions,
      expiresAt,
      // Re-stamped, because the sentence the owner agreed to has changed. The
      // old text is not edited in place anywhere — this row *is* the record of
      // the current agreement, and the consent event below dates the change.
      consentText: consentTextFor(helperLabel, permissions, days),
      consentVersion: CONSENT_VERSION,
    },
  });

  await recordConsentEvent({
    kind: "DELEGATION_EXPIRY_CHANGED",
    ownerUserId: params.ownerUserId,
    actorUserId: params.ownerUserId,
    actorLabel: helperLabel,
    delegationId: row.id,
    detail: `${permissions.length} permission`,
  });

  return { ok: true, delegation: updated };
}

export interface DelegationView {
  id: string;
  helperKind: DelegationHelperKind;
  helperName: string;
  permissions: ProfileDelegatePermission[];
  permissionLabels: string[];
  status: ProfileDelegation["status"];
  live: boolean;
  grantedAt: string;
  expiresAt: string | null;
  daysLeft: number | null;
  revokedAt: string | null;
  consentText: string;
}

/** The owner's Profile Access screen. */
export async function listDelegationsForOwner(ownerUserId: string): Promise<DelegationView[]> {
  const rows = await prisma.profileDelegation.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "desc" },
    include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
  });

  const now = new Date();
  const staleIds = rows.filter((r) => r.status === "ACTIVE" && !isDelegationLive(r, now)).map((r) => r.id);
  if (staleIds.length > 0) {
    await prisma.profileDelegation.updateMany({
      where: { id: { in: staleIds }, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
  }

  return rows.map((r) => {
    const live = isDelegationLive(r, now);
    return {
      id: r.id,
      helperKind: r.partnerId ? "PARTNER" : "FAMILY",
      helperName: r.partner?.fullName ?? r.familyMember?.displayName ?? "Helper",
      permissions: r.permissions,
      permissionLabels: r.permissions.map((p) => PERMISSION_LABELS[p]),
      status: staleIds.includes(r.id) ? "EXPIRED" : r.status,
      live,
      grantedAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      daysLeft: r.expiresAt
        ? Math.max(0, Math.ceil((r.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        : null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      consentText: r.consentText,
    };
  });
}
