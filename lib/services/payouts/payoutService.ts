import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isSecretBoxConfigured, lastFourOf, open, seal } from "@/lib/security/secretBox";
import { createNotice } from "@/lib/services/notice/noticeService";
import { manualPayoutProvider } from "./providers/manual";
import { isRazorpayXConfigured, razorpayXPayoutProvider } from "./providers/razorpayx";
import type { PayoutDestination, PayoutProvider } from "./types";
import type { PayoutMethod, Prisma, Role } from "@prisma/client";

/**
 * Partner payouts: bank details, a maturity hold, a withdrawal request, and an
 * admin approval before any money moves.
 *
 * ## What this replaced
 *
 * A "payout" used to be an admin flipping one `PartnerCommission` row to PAID.
 * There was no account to pay into, no way for a partner to ask, no minimum,
 * no reference number, and nothing linking a set of commissions to one
 * transfer. `getPartnerPayoutStatus`'s own comment said so.
 *
 * ## The four gates, in order
 *
 *   1. **Maturity** — a commission is not payable until the refund window has
 *      passed (`PartnerCommissionConfig.maturityDays`, default 7). Stored per
 *      row as `maturesAt` so changing the window later can't claw back money a
 *      partner was already promised.
 *   2. **Approval** — matured commissions become APPROVED, either by the cron
 *      (`autoApproveAfterMaturity`) or by hand in the commission queue.
 *   3. **Minimum** — a partner can only request above `minWithdrawalPaise`.
 *   4. **Verified account + admin** — an admin verifies the account details
 *      once, then approves each withdrawal and records the UTR.
 *
 * Account numbers are encrypted at rest and only ever leave the server through
 * the admin's audited reveal, at the moment a transfer is being made.
 */

const DEFAULTS = { maturityDays: 7, minWithdrawalPaise: 50_000, autoApproveAfterMaturity: true };

export async function getPayoutConfig() {
  const config = await prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } });
  return {
    maturityDays: config?.maturityDays ?? DEFAULTS.maturityDays,
    minWithdrawalPaise: config?.minWithdrawalPaise ?? DEFAULTS.minWithdrawalPaise,
    autoApproveAfterMaturity: config?.autoApproveAfterMaturity ?? DEFAULTS.autoApproveAfterMaturity,
  };
}

/** Which provider would move the money. Manual until RazorpayX is actually configured. */
export function payoutProvider(): PayoutProvider {
  return isRazorpayXConfigured() ? razorpayXPayoutProvider : manualPayoutProvider;
}

// ---------------------------------------------------------------- balance

export type PartnerBalance = {
  /** APPROVED, not yet attached to a withdrawal — this is what can be asked for. */
  availablePaise: number;
  /** PENDING and still inside the refund window. */
  heldPaise: number;
  /** Attached to a REQUESTED/APPROVED withdrawal, not yet paid. */
  inFlightPaise: number;
  paidPaise: number;
  /** When the oldest held commission unlocks — null when nothing is held. */
  nextUnlockAt: Date | null;
  minWithdrawalPaise: number;
  canRequest: boolean;
  /** Why not, when `canRequest` is false. */
  blockedReason: string | null;
};

export async function getPartnerBalance(partnerId: string): Promise<PartnerBalance> {
  const [config, account, commissions, openWithdrawal] = await Promise.all([
    getPayoutConfig(),
    prisma.partnerPayoutAccount.findUnique({ where: { partnerId } }),
    prisma.partnerCommission.findMany({
      where: { partnerId, status: { in: ["PENDING", "APPROVED", "PAID"] } },
      select: { amountPaise: true, status: true, maturesAt: true, createdAt: true, withdrawalId: true },
    }),
    prisma.partnerWithdrawal.findFirst({
      where: { partnerId, status: { in: ["REQUESTED", "APPROVED"] } },
      select: { id: true },
    }),
  ]);

  const windowMs = config.maturityDays * 24 * 3600_000;
  // Rows written before `maturesAt` existed fall back to the old rule the
  // commission queue always applied: createdAt + the configured window.
  const maturityOf = (c: { maturesAt: Date | null; createdAt: Date }) =>
    c.maturesAt ?? new Date(c.createdAt.getTime() + windowMs);

  let availablePaise = 0;
  let heldPaise = 0;
  let inFlightPaise = 0;
  let paidPaise = 0;
  let nextUnlockAt: Date | null = null;

  for (const c of commissions) {
    if (c.status === "PAID") {
      paidPaise += c.amountPaise;
      continue;
    }
    if (c.withdrawalId) {
      inFlightPaise += c.amountPaise;
      continue;
    }
    if (c.status === "APPROVED") {
      availablePaise += c.amountPaise;
      continue;
    }
    // PENDING — still in the refund window (or waiting on manual approval).
    heldPaise += c.amountPaise;
    const at = maturityOf(c);
    if (!nextUnlockAt || at < nextUnlockAt) nextUnlockAt = at;
  }

  const blockedReason = openWithdrawal
    ? "Ek withdrawal request pehle se chal rahi hai."
    : !account
      ? "Pehle apne bank ya UPI ki detail bhariye."
      : !account.verifiedAt
        ? "Aapke account details abhi verify ho rahi hain."
        : availablePaise < config.minWithdrawalPaise
          ? `Kam se kam ₹${Math.round(config.minWithdrawalPaise / 100)} hone par withdraw kar sakte hain.`
          : null;

  return {
    availablePaise,
    heldPaise,
    inFlightPaise,
    paidPaise,
    nextUnlockAt,
    minWithdrawalPaise: config.minWithdrawalPaise,
    canRequest: blockedReason === null,
    blockedReason,
  };
}

// ---------------------------------------------------------------- account

export type PayoutAccountView = {
  method: PayoutMethod;
  accountHolderName: string;
  /** Only ever the last 4 — the full value never reaches a browser except through the admin reveal. */
  maskedTarget: string;
  ifsc: string | null;
  bankName: string | null;
  verifiedAt: Date | null;
  rejectedNote: string | null;
};

export async function getPayoutAccount(partnerId: string): Promise<PayoutAccountView | null> {
  const row = await prisma.partnerPayoutAccount.findUnique({ where: { partnerId } });
  if (!row) return null;
  return {
    method: row.method,
    accountHolderName: row.accountHolderName,
    maskedTarget: row.method === "UPI" ? `••••${row.upiLast4 ?? ""}` : `••••${row.accountLast4 ?? ""}`,
    ifsc: row.ifsc,
    bankName: row.bankName,
    verifiedAt: row.verifiedAt,
    rejectedNote: row.rejectedNote,
  };
}

export type SavePayoutAccountInput =
  | { method: "UPI"; accountHolderName: string; upiId: string }
  | { method: "BANK"; accountHolderName: string; accountNumber: string; ifsc: string; bankName?: string | null };

export type PayoutWriteResult = { ok: true } | { ok: false; error: string; message: string; status: number };

export async function savePayoutAccount(
  partnerId: string,
  input: SavePayoutAccountInput,
): Promise<PayoutWriteResult> {
  if (!isSecretBoxConfigured()) {
    return {
      ok: false,
      error: "NOT_CONFIGURED",
      message: "Server par encryption key set nahi hai, isliye bank details abhi save nahi ho sakti.",
      status: 503,
    };
  }
  if (!input.accountHolderName.trim()) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Account holder ka naam likhiye.", status: 422 };
  }

  // A withdrawal already moving must not have its destination changed underneath it.
  const open = await prisma.partnerWithdrawal.findFirst({
    where: { partnerId, status: { in: ["REQUESTED", "APPROVED"] } },
    select: { id: true },
  });
  if (open) {
    return {
      ok: false,
      error: "WITHDRAWAL_OPEN",
      message: "Ek withdrawal chal rahi hai — wo poori hone ke baad hi details badal sakte hain.",
      status: 409,
    };
  }

  let data: Prisma.PartnerPayoutAccountUncheckedCreateInput;

  if (input.method === "UPI") {
    const upi = input.upiId.trim();
    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upi)) {
      return { ok: false, error: "VALIDATION_FAILED", message: "UPI id sahi nahi lag rahi (jaise name@bank).", status: 422 };
    }
    const sealed = seal(upi);
    data = {
      partnerId,
      method: "UPI",
      accountHolderName: input.accountHolderName.trim(),
      upiCipher: sealed.cipherText,
      upiIv: sealed.iv,
      upiTag: sealed.authTag,
      upiLast4: lastFourOf(upi),
      accountCipher: null,
      accountIv: null,
      accountTag: null,
      accountLast4: null,
      ifsc: null,
      bankName: null,
    };
  } else {
    const acct = input.accountNumber.replace(/\s/g, "");
    const ifsc = input.ifsc.trim().toUpperCase();
    if (!/^\d{6,20}$/.test(acct)) {
      return { ok: false, error: "VALIDATION_FAILED", message: "Account number sirf ank ka hona chahiye (6–20 digits).", status: 422 };
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return { ok: false, error: "VALIDATION_FAILED", message: "IFSC sahi nahi hai (jaise SBIN0001234).", status: 422 };
    }
    const sealed = seal(acct);
    data = {
      partnerId,
      method: "BANK",
      accountHolderName: input.accountHolderName.trim(),
      accountCipher: sealed.cipherText,
      accountIv: sealed.iv,
      accountTag: sealed.authTag,
      accountLast4: lastFourOf(acct),
      ifsc,
      bankName: input.bankName?.trim() || null,
      upiCipher: null,
      upiIv: null,
      upiTag: null,
      upiLast4: null,
    };
  }

  // Any edit resets verification — otherwise a partner could get an account
  // verified and then swap the number for someone else's.
  const updatable = { ...data, partnerId: undefined };
  await prisma.partnerPayoutAccount.upsert({
    where: { partnerId },
    create: data,
    update: { ...updatable, verifiedAt: null, verifiedBy: null, rejectedNote: null },
  });

  return { ok: true };
}

// ---------------------------------------------------------------- withdrawal

export type WithdrawalResult =
  | { ok: true; withdrawalId: string; amountPaise: number }
  | { ok: false; error: string; message: string; status: number };

/**
 * Bundles every un-attached APPROVED commission into one withdrawal.
 *
 * Deliberately all-or-nothing rather than a partner-chosen amount: a partial
 * withdrawal would need the ledger to split a commission row, and "₹1,240 aa
 * gaye, ₹310 kahan hain" is a support conversation worth designing out.
 */
export async function requestWithdrawal(partnerId: string): Promise<WithdrawalResult> {
  const balance = await getPartnerBalance(partnerId);
  if (!balance.canRequest) {
    return { ok: false, error: "NOT_ELIGIBLE", message: balance.blockedReason ?? "Abhi withdraw nahi kar sakte.", status: 422 };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction: a concurrent request would otherwise
    // attach the same commissions to two withdrawals.
    const rows = await tx.partnerCommission.findMany({
      where: { partnerId, status: "APPROVED", withdrawalId: null },
      select: { id: true, amountPaise: true },
    });
    const total = rows.reduce((n, r) => n + r.amountPaise, 0);
    if (rows.length === 0 || total < balance.minWithdrawalPaise) return null;

    const withdrawal = await tx.partnerWithdrawal.create({
      data: { partnerId, amountPaise: total, status: "REQUESTED" },
    });
    await tx.partnerCommission.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { withdrawalId: withdrawal.id },
    });
    return withdrawal;
  });

  if (!result) {
    return { ok: false, error: "NOT_ELIGIBLE", message: "Withdraw karne layak balance nahi mila.", status: 422 };
  }
  return { ok: true, withdrawalId: result.id, amountPaise: result.amountPaise };
}

export async function listPartnerWithdrawals(partnerId: string) {
  return prisma.partnerWithdrawal.findMany({
    where: { partnerId },
    orderBy: { requestedAt: "desc" },
    take: 25,
    select: {
      id: true,
      amountPaise: true,
      status: true,
      requestedAt: true,
      approvedAt: true,
      paidAt: true,
      utr: true,
      rejectionReason: true,
    },
  });
}

// ---------------------------------------------------------------- admin side

export async function verifyPayoutAccount(params: {
  partnerId: string;
  approve: boolean;
  note?: string | null;
  actorId: string;
  actorRole: Role;
}): Promise<PayoutWriteResult> {
  const { partnerId, approve, note, actorId, actorRole } = params;
  const account = await prisma.partnerPayoutAccount.findUnique({ where: { partnerId } });
  if (!account) return { ok: false, error: "NOT_FOUND", message: "Account details nahi mili.", status: 404 };
  if (!approve && !note?.trim()) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Reject karne ka reason likhiye.", status: 422 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerPayoutAccount.update({
      where: { partnerId },
      data: approve
        ? { verifiedAt: new Date(), verifiedBy: actorId, rejectedNote: null }
        : { verifiedAt: null, verifiedBy: null, rejectedNote: note!.trim() },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: approve ? "PAYOUT_ACCOUNT_VERIFIED" : "PAYOUT_ACCOUNT_REJECTED",
        targetType: "partner_payout_account",
        targetId: partnerId,
        newValue: approve ? "verified" : "rejected",
        reason: note?.trim() || null,
      },
    });
  });

  await createNotice({
    userId: (await prisma.partner.findUnique({ where: { id: partnerId }, select: { userId: true } }))!.userId,
    kind: "MATCHMAKER_UPDATE",
    title: approve ? "Aapke payout details verify ho gaye" : "Payout details me kuch theek karna hai",
    body: approve
      ? "Ab aap apni kamai withdraw kar sakte hain."
      : `Details dobara bhariye — ${note?.trim() ?? "kuch match nahi ho raha tha"}.`,
    href: "/partner/payouts",
  });

  return { ok: true };
}

/**
 * The full account number, plus an audit row saying who looked.
 *
 * Same trade as the partner contact reveal: an admin about to make a bank
 * transfer genuinely needs the number, and the alternative to a logged lookup
 * is an unlogged database query.
 */
export async function revealPayoutDestination(params: {
  partnerId: string;
  actorId: string;
  actorRole: Role;
}): Promise<{ ok: true; destination: PayoutDestination } | { ok: false; message: string; status: number }> {
  const { partnerId, actorId, actorRole } = params;
  const account = await prisma.partnerPayoutAccount.findUnique({ where: { partnerId } });
  if (!account) return { ok: false, message: "Account details nahi mili.", status: 404 };

  const secret =
    account.method === "UPI"
      ? open({ cipherText: account.upiCipher!, iv: account.upiIv!, authTag: account.upiTag! })
      : open({ cipherText: account.accountCipher!, iv: account.accountIv!, authTag: account.accountTag! });

  if (!secret) {
    return {
      ok: false,
      message: "Details decrypt nahi ho payin — SECRETS_ENCRYPTION_KEY badal gayi lagti hai. Partner se dobara bharwana padega.",
      status: 409,
    };
  }

  await prisma.adminAuditLog.create({
    data: {
      actorId,
      actorRole,
      actionType: "PAYOUT_DESTINATION_REVEALED",
      targetType: "partner_payout_account",
      targetId: partnerId,
      // The last four only — the log records that a lookup happened, not a
      // second copy of the thing being protected.
      newValue: `••••${account.method === "UPI" ? account.upiLast4 : account.accountLast4}`,
    },
  });

  return {
    ok: true,
    destination:
      account.method === "UPI"
        ? { method: "UPI", upiId: secret, accountHolderName: account.accountHolderName }
        : {
            method: "BANK",
            accountNumber: secret,
            ifsc: account.ifsc ?? "",
            accountHolderName: account.accountHolderName,
            bankName: account.bankName,
          },
  };
}

export async function transitionWithdrawal(params: {
  withdrawalId: string;
  action: "approve" | "markPaid" | "reject";
  utr?: string | null;
  reason?: string | null;
  actorId: string;
  actorRole: Role;
}): Promise<PayoutWriteResult> {
  const { withdrawalId, action, utr, reason, actorId, actorRole } = params;

  const withdrawal = await prisma.partnerWithdrawal.findUnique({
    where: { id: withdrawalId },
    include: { partner: { select: { userId: true } } },
  });
  if (!withdrawal) return { ok: false, error: "NOT_FOUND", message: "Withdrawal nahi mili.", status: 404 };

  if (action === "approve" && withdrawal.status !== "REQUESTED") {
    return { ok: false, error: "BAD_STATE", message: "Sirf REQUESTED withdrawal approve ho sakti hai.", status: 409 };
  }
  if (action === "markPaid" && withdrawal.status !== "APPROVED") {
    return { ok: false, error: "BAD_STATE", message: "Pehle approve karein, phir paid mark karein.", status: 409 };
  }
  if (action === "reject" && withdrawal.status === "PAID") {
    return { ok: false, error: "BAD_STATE", message: "Paid withdrawal reject nahi ho sakti.", status: 409 };
  }
  if (action === "markPaid" && !utr?.trim()) {
    // Without this a "paid" row is just a claim. The UTR is what makes
    // "maine bheja tha" checkable against a bank statement.
    return { ok: false, error: "VALIDATION_FAILED", message: "UTR / reference number daalna zaroori hai.", status: 422 };
  }
  if (action === "reject" && !reason?.trim()) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Reject karne ka reason likhiye.", status: 422 };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (action === "approve") {
      await tx.partnerWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: "APPROVED", approvedAt: now, approvedBy: actorId },
      });
    } else if (action === "markPaid") {
      await tx.partnerWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: "PAID", paidAt: now, paidBy: actorId, utr: utr!.trim() },
      });
      // The commissions settle with the withdrawal, in the same transaction —
      // a withdrawal marked paid whose commissions still read APPROVED would
      // let the same money be requested again.
      await tx.partnerCommission.updateMany({
        where: { withdrawalId },
        data: { status: "PAID", paidAt: now },
      });
    } else {
      await tx.partnerWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: "REJECTED", rejectionReason: reason!.trim() },
      });
      // Released back to available balance so the partner can ask again once
      // whatever blocked it is fixed.
      await tx.partnerCommission.updateMany({ where: { withdrawalId }, data: { withdrawalId: null } });
    }

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: `WITHDRAWAL_${action === "markPaid" ? "PAID" : action.toUpperCase()}`,
        targetType: "partner_withdrawal",
        targetId: withdrawalId,
        previousValue: withdrawal.status,
        newValue: action === "markPaid" ? `PAID utr=${utr!.trim()}` : action.toUpperCase(),
        reason: reason?.trim() || null,
      },
    });
  });

  const rupees = `₹${(withdrawal.amountPaise / 100).toLocaleString("en-IN")}`;
  await createNotice({
    userId: withdrawal.partner.userId,
    kind: "MATCHMAKER_UPDATE",
    title:
      action === "markPaid"
        ? `${rupees} bhej diye gaye`
        : action === "approve"
          ? `${rupees} ki withdrawal approve ho gayi`
          : "Withdrawal request reject ho gayi",
    body:
      action === "markPaid"
        ? `Reference: ${utr!.trim()}. Bank me pahunchne me 1-2 din lag sakte hain.`
        : action === "approve"
          ? "Transfer jald ho jaayega."
          : (reason?.trim() ?? "Details check karke dobara try kijiye."),
    href: "/partner/payouts",
  });

  return { ok: true };
}
