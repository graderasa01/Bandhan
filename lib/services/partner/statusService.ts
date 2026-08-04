import { prisma } from "@/lib/db/prisma";
import { generateUniqueCode } from "@/lib/services/referral/code";
import { REASON_MAX, REASON_MIN } from "./constants";
import type { Partner, PartnerStatus, Role } from "@prisma/client";

export { REASON_MAX, REASON_MIN };

export type PartnerAction = "approve" | "reject" | "activate" | "inactivate" | "suspend" | "reactivate";

/**
 * The spec's allowed-transition table, encoded once. Notably absent:
 * PENDING_APPROVAL → ACTIVE (must pass through APPROVED) and
 * REJECTED → ACTIVE — both are blocked, not oversights.
 */
const TRANSITIONS: Record<PartnerAction, { from: PartnerStatus[]; to: PartnerStatus }> = {
  approve: { from: ["PENDING_APPROVAL"], to: "APPROVED" },
  reject: { from: ["PENDING_APPROVAL"], to: "REJECTED" },
  activate: { from: ["APPROVED", "INACTIVE", "SUSPENDED"], to: "ACTIVE" },
  inactivate: { from: ["APPROVED", "ACTIVE", "SUSPENDED"], to: "INACTIVE" },
  suspend: { from: ["ACTIVE"], to: "SUSPENDED" },
  reactivate: { from: ["SUSPENDED"], to: "ACTIVE" },
};

/** Reject and suspend take something away — the partner is owed an explanation. */
const REASON_REQUIRED: PartnerAction[] = ["reject", "suspend"];

const AUDIT_ACTION: Record<PartnerAction, string> = {
  approve: "PARTNER_APPROVED",
  reject: "PARTNER_REJECTED",
  activate: "PARTNER_ACTIVATED",
  inactivate: "PARTNER_INACTIVATED",
  suspend: "PARTNER_SUSPENDED",
  reactivate: "PARTNER_REACTIVATED",
};

export type StatusChangeResult =
  | { ok: true; partner: Partner; issuedCode: string | null }
  | { ok: false; error: string; message: string; status: number };

/**
 * The only place a Partner's status ever changes. Every path writes an
 * AdminAuditLog row, and approval issues the referral code inside the same
 * transaction so a partner can never end up APPROVED without a code.
 */
export async function changePartnerStatus(params: {
  partnerId: string;
  action: PartnerAction;
  actorId: string;
  actorRole: Role;
  reason?: string;
}): Promise<StatusChangeResult> {
  const { partnerId, action, actorId, actorRole, reason } = params;
  const rule = TRANSITIONS[action];

  if (REASON_REQUIRED.includes(action)) {
    const trimmed = reason?.trim() ?? "";
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      return {
        ok: false,
        error: "REASON_REQUIRED",
        message: `Reason ${REASON_MIN} se ${REASON_MAX} characters ke beech hona chahiye.`,
        status: 422,
      };
    }
  }

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) {
    return { ok: false, error: "NOT_FOUND", message: "Partner nahi mila.", status: 404 };
  }

  if (!rule.from.includes(partner.status)) {
    return {
      ok: false,
      error: "INVALID_TRANSITION",
      message: `${partner.status} se ${rule.to} par nahi ja sakte.`,
      status: 409,
    };
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: rule.to };
  if (action === "approve") Object.assign(data, { approvedAt: now, approvedBy: actorId });
  if (action === "reject") Object.assign(data, { rejectedAt: now, rejectedBy: actorId, rejectionReason: reason });
  if (action === "suspend") Object.assign(data, { suspendedAt: now, suspendedBy: actorId, suspensionReason: reason });
  if (action === "reactivate" || action === "activate") {
    Object.assign(data, { reactivatedAt: now, reactivatedBy: actorId, suspensionReason: null });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.partner.update({ where: { id: partnerId }, data });

    let issuedCode: string | null = null;
    // Approval is the moment a partner becomes able to refer anyone, so it's
    // also the moment they get a code — but only their first one.
    if (action === "approve") {
      const existing = await tx.referralCode.findFirst({ where: { partnerId, active: true } });
      if (existing) {
        issuedCode = existing.code;
      } else {
        issuedCode = await generateUniqueCode(tx);
        await tx.referralCode.create({ data: { partnerId, code: issuedCode, type: "AUTO", active: true } });
      }
    }

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: AUDIT_ACTION[action],
        targetType: "partner",
        targetId: partnerId,
        previousValue: partner.status,
        newValue: rule.to,
        reason: reason?.trim() || null,
      },
    });

    return { updated, issuedCode };
  });

  return { ok: true, partner: result.updated, issuedCode: result.issuedCode };
}
