import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS } from "@/lib/services/plans/constants";
import type { Role } from "@prisma/client";

export type AdminPartnerActionResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

/**
 * The partner's real phone and email, plus an audit row saying who asked.
 *
 * Masking on the review screens is the right default — an admin skimming a
 * queue has no need for anyone's number, and a screenshot of that page
 * shouldn't be a contact list. But "baat karke approve karein" is the actual
 * workflow, and an admin who cannot reach the applicant just exports the
 * database instead, which is strictly worse.
 *
 * So the details are available and *every* look is recorded. That is the whole
 * trade: not privacy versus usefulness, but an unlogged leak versus a logged
 * lookup.
 */
export async function revealPartnerContact(params: {
  partnerId: string;
  actorId: string;
  actorRole: Role;
}): Promise<
  { ok: true; mobileNumber: string; email: string | null } | { ok: false; message: string; status: number }
> {
  const partner = await prisma.partner.findUnique({
    where: { id: params.partnerId },
    select: { id: true, fullName: true, mobileNumber: true, email: true },
  });
  if (!partner) return { ok: false, message: "Partner nahi mila.", status: 404 };

  await prisma.adminAuditLog.create({
    data: {
      actorId: params.actorId,
      actorRole: params.actorRole,
      actionType: "PARTNER_CONTACT_REVEALED",
      targetType: "partner",
      targetId: partner.id,
      // Deliberately not the number itself: the log records that a lookup
      // happened, not a second copy of the thing being protected.
      newValue: partner.fullName,
    },
  });

  return { ok: true, mobileNumber: partner.mobileNumber, email: partner.email };
}

/**
 * Pins a commission rate for one partner, or clears it back to the tier.
 *
 * `bps: null` is the reset. Bounds are the same MIN/MAX the global rate uses —
 * a per-partner deal is still a deal, not an escape hatch from "we never pay
 * out more than we keep".
 */
export async function setPartnerCommissionOverride(params: {
  partnerId: string;
  bps: number | null;
  reason: string;
  actorId: string;
  actorRole: Role;
}): Promise<AdminPartnerActionResult> {
  const { partnerId, bps, reason, actorId, actorRole } = params;

  if (!reason.trim()) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Reason likhna zaroori hai.", status: 422 };
  }
  if (bps !== null) {
    if (!Number.isInteger(bps) || bps < MIN_COMMISSION_BPS || bps > MAX_COMMISSION_BPS) {
      return {
        ok: false,
        error: "VALIDATION_FAILED",
        message: `Rate ${MIN_COMMISSION_BPS / 100}% se ${MAX_COMMISSION_BPS / 100}% ke beech hona chahiye.`,
        status: 422,
      };
    }
  }

  const existing = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { commissionBpsOverride: true },
  });
  if (!existing) return { ok: false, error: "NOT_FOUND", message: "Partner nahi mila.", status: 404 };

  await prisma.$transaction(async (tx) => {
    await tx.partner.update({ where: { id: partnerId }, data: { commissionBpsOverride: bps } });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: bps === null ? "PARTNER_COMMISSION_OVERRIDE_CLEARED" : "PARTNER_COMMISSION_OVERRIDE_SET",
        targetType: "partner",
        targetId: partnerId,
        previousValue:
          existing.commissionBpsOverride === null ? "tier rate" : `${existing.commissionBpsOverride} bps`,
        newValue: bps === null ? "tier rate" : `${bps} bps`,
        reason: reason.trim(),
      },
    });
  });

  // Existing commission rows are untouched on purpose: they record what was
  // actually earned at the time, and rewriting history to match a rate agreed
  // afterwards would make the ledger unauditable.
  return { ok: true };
}
