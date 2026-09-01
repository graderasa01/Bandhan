import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isSecretBoxConfigured, lastFourOf, open, seal } from "@/lib/security/secretBox";
import { createNotice } from "@/lib/services/notice/noticeService";

import { verificationProviderStatus } from "@/lib/services/verification/contactVerification/contactVerificationService";
import { manualPayoutProvider } from "./providers/manual";
import { isRazorpayXConfigured, razorpayXPayoutProvider } from "./providers/razorpayx";
import type { PayoutDestination, PayoutProvider } from "./types";
import type { PayoutMethod, Prisma, Role } from "@prisma/client";

/**
 * Partner payouts: bank details, a withdrawal request, and an admin approval
 * before any money moves.
 *
 * ## What this replaced
 *
 * A "payout" used to be an admin flipping one `PartnerCommission` row to PAID.
 * There was no account to pay into, no way for a partner to ask, no minimum,
 * no reference number, and nothing linking a set of commissions to one
 * transfer. `getPartnerPayoutStatus`'s own comment said so.
 *
 * ## The gates, in order (revised 2026-08-26)
 *
 *   1. **Reachable** — the partner's phone/email is verified, so there is
 *      someone to answer the "kahan hai mera paisa" call. Provider-aware: a
 *      channel whose OTP provider has no keys is skipped, not failed.
 *   2. **Account on file** — bank or UPI details saved, and verified once by
 *      an admin who has actually looked at them.
 *   3. **Minimum** — the balance is at least `minWithdrawalPaise` (₹500).
 *
 * ### What was removed, and why
 *
 * There used to be two more gates ahead of these: a 7-day **maturity hold**
 * (money sat in a refund window before it could be asked for) and a mandatory
 * **KYC** step (PAN number + PAN card photo before any withdrawal). Both are
 * gone by product decision — a partner should be able to ask for what they
 * earned without waiting a week or filing a tax document first.
 *
 * The hold's removal is a deliberate, accepted risk: if the payment behind a
 * commission is refunded *after* the partner has withdrawn it, that money does
 * not come back. `reverseCommission` still marks the row REVERSED, but a row
 * already PAID cannot be un-paid. The window was the thing that made refunds
 * safe, and it was traded away for speed with that understood.
 *
 * KYC is now **optional**: `kycService` still stores PAN and documents for
 * partners who want to file them, and the admin can still review them, but
 * `getPartnerBalance` no longer consults `getKycGate`. Nothing blocks on it.
 *
 * There is no cron. Nothing in this file is time-driven any more — a
 * commission is withdrawable from the moment it is created.
 *
 * Account numbers are encrypted at rest and only ever leave the server through
 * the admin's audited reveal, at the moment a transfer is being made.
 */

const DEFAULTS = { minWithdrawalPaise: 50_000 };

/**
 * `maturityDays` / `autoApproveAfterMaturity` still exist as columns but are
 * no longer read here — the hold they configured is gone. Left in the schema
 * rather than migrated away so the historical `maturesAt` values on old rows
 * stay interpretable.
 */
export async function getPayoutConfig() {
  const config = await prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } });
  return {
    minWithdrawalPaise: config?.minWithdrawalPaise ?? DEFAULTS.minWithdrawalPaise,
  };
}

/** Which provider would move the money. Manual until RazorpayX is actually configured. */
export function payoutProvider(): PayoutProvider {
  return isRazorpayXConfigured() ? razorpayXPayoutProvider : manualPayoutProvider;
}

// ------------------------------------------------------- contact gate

export type PartnerContactGate = {
  /** Channels still to prove. Empty means this gate is satisfied. */
  missing: ("PHONE" | "EMAIL")[];
  ok: boolean;
};

/**
 * Gate zero: is the partner reachable on the contact we hold for them?
 *
 * Runs ahead of the bank-details gates because it is the cheaper mistake to
 * catch — a wrong account number is caught by the admin's eyeball, but an
 * unreachable partner is nobody's error until the money is already gone and
 * the "kahan hai mera paisa" call has no one to answer it.
 *
 * **Only demands what the deployment can actually deliver.** A channel whose
 * provider has no keys (`verificationProviderStatus`) is skipped rather than
 * failed — requiring an OTP the server cannot send would freeze every payout
 * behind a button that returns `not_configured`. As keys land, the gate
 * tightens on its own with no code change. A channel the partner simply does
 * not have (`email` is nullable) is likewise not demanded.
 */
export async function getPartnerContactGate(partnerId: string): Promise<PartnerContactGate> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { mobileNumber: true, email: true, mobileVerifiedAt: true, emailVerifiedAt: true },
  });
  // No partner row is not this gate's failure to report — the callers that
  // matter have already resolved one.
  if (!partner) return { missing: [], ok: true };

  const providers = verificationProviderStatus();
  const missing: ("PHONE" | "EMAIL")[] = [];
  if (providers.phone && partner.mobileNumber && !partner.mobileVerifiedAt) missing.push("PHONE");
  if (providers.email && partner.email && !partner.emailVerifiedAt) missing.push("EMAIL");

  return { missing, ok: missing.length === 0 };
}

function contactGateMessage(missing: ("PHONE" | "EMAIL")[]): string {
  const what =
    missing.length === 2 ? "mobile aur email" : missing[0] === "PHONE" ? "mobile number" : "email";
  return `Pehle apna ${what} verify kariye.`;
}

// ---------------------------------------------------------------- balance

export type PartnerBalance = {
  /** Earned, not yet attached to a withdrawal — this is what can be asked for. */
  availablePaise: number;
  /** Attached to a REQUESTED/APPROVED withdrawal, not yet paid. */
  inFlightPaise: number;
  paidPaise: number;
  minWithdrawalPaise: number;
  canRequest: boolean;
  /** Why not, when `canRequest` is false. */
  blockedReason: string | null;
  /** Set when the block is contact verification, so the UI can link to the fix. */
  contactVerificationNeeded: boolean;
  /** Set when the block is a missing/unverified payout account. */
  accountNeeded: boolean;
};

export async function getPartnerBalance(partnerId: string): Promise<PartnerBalance> {
  const [config, account, commissions, allocations, openWithdrawal, contactGate] = await Promise.all([
    getPayoutConfig(),
    prisma.partnerPayoutAccount.findUnique({ where: { partnerId } }),
    prisma.partnerCommission.findMany({
      where: { partnerId, status: { in: ["PENDING", "APPROVED", "PAID"] } },
      select: { amountPaise: true, status: true, withdrawalId: true },
    }),
    /*
     * Phase 2 — the partner's second earning stream.
     *
     * `HELD` is deliberately absent from this query: money for work that has
     * not settled yet is not a balance, it is a promise, and showing it as
     * "available minus a hold" is how a partner ends up counting on it. Only
     * RELEASED (work done, refund window closed or acknowledged) and PAID
     * reach this function at all. REVERSED never does — a refunded booking
     * needs no special case anywhere because its row simply stops matching.
     */
    prisma.servicePaymentAllocation.findMany({
      where: { partnerId, status: { in: ["RELEASED", "PAID"] } },
      select: { partnerAmountPaise: true, status: true, withdrawalId: true },
    }),
    prisma.partnerWithdrawal.findFirst({
      where: { partnerId, status: { in: ["REQUESTED", "APPROVED"] } },
      select: { id: true },
    }),
    getPartnerContactGate(partnerId),
  ]);

  let availablePaise = 0;
  let inFlightPaise = 0;
  let paidPaise = 0;

  for (const a of allocations) {
    if (a.status === "PAID") paidPaise += a.partnerAmountPaise;
    else if (a.withdrawalId) inFlightPaise += a.partnerAmountPaise;
    else availablePaise += a.partnerAmountPaise;
  }

  for (const c of commissions) {
    if (c.status === "PAID") {
      paidPaise += c.amountPaise;
    } else if (c.withdrawalId) {
      inFlightPaise += c.amountPaise;
    } else {
      // PENDING and APPROVED both count as available now. PENDING used to mean
      // "inside the refund window"; with the hold gone it only survives as the
      // status new rows are still written with, and as the status of every row
      // written before this change. Treating the two alike is what lets money
      // earned under the old rules be withdrawn under the new ones.
      availablePaise += c.amountPaise;
    }
  }

  // Order is the order a partner should fix things in: can we reach you, where
  // does the money go, is it enough to send. Each rung is useless without the
  // one above it, so showing the lowest unmet one is showing the only next
  // step that exists.
  const blockedReason = openWithdrawal
    ? "Ek withdrawal request pehle se chal rahi hai."
    : !contactGate.ok
      ? contactGateMessage(contactGate.missing)
      : !account
        ? "Pehle apne bank ya UPI ki detail bhariye."
        : !account.verifiedAt
          ? "Aapke account details abhi verify ho rahi hain."
          : availablePaise < config.minWithdrawalPaise
            ? `Kam se kam ₹${Math.round(config.minWithdrawalPaise / 100)} hone par withdraw kar sakte hain.`
            : null;

  return {
    availablePaise,
    inFlightPaise,
    paidPaise,
    minWithdrawalPaise: config.minWithdrawalPaise,
    canRequest: blockedReason === null,
    blockedReason,
    contactVerificationNeeded: !openWithdrawal && !contactGate.ok,
    accountNeeded: !openWithdrawal && contactGate.ok && (!account || !account.verifiedAt),
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

  // Ahead of the encrypted write, not just ahead of the withdrawal: storing a
  // bank account for someone we cannot yet reach buys nothing, and refusing at
  // the point of entry gives them the one next step instead of a saved form
  // that silently blocks later.
  const contactGate = await getPartnerContactGate(partnerId);
  if (!contactGate.ok) {
    return {
      ok: false,
      error: "CONTACT_UNVERIFIED",
      message: contactGateMessage(contactGate.missing),
      status: 422,
    };
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
      where: { partnerId, status: { in: ["PENDING", "APPROVED"] }, withdrawalId: null },
      select: { id: true, amountPaise: true },
    });
    // Phase 2 — service earnings settle through the same request, for the same
    // reason they share a `withdrawalId` column: two payout flows would mean
    // two bank transfers, two UTRs and two places to answer "is this money
    // still available".
    const allocationRows = await tx.servicePaymentAllocation.findMany({
      where: { partnerId, status: "RELEASED", withdrawalId: null },
      select: { id: true, partnerAmountPaise: true },
    });

    const total =
      rows.reduce((n, r) => n + r.amountPaise, 0) +
      allocationRows.reduce((n, r) => n + r.partnerAmountPaise, 0);
    if (rows.length + allocationRows.length === 0 || total < balance.minWithdrawalPaise) return null;

    const withdrawal = await tx.partnerWithdrawal.create({
      data: { partnerId, amountPaise: total, status: "REQUESTED" },
    });
    if (rows.length > 0) {
      await tx.partnerCommission.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { withdrawalId: withdrawal.id },
      });
    }
    if (allocationRows.length > 0) {
      await tx.servicePaymentAllocation.updateMany({
        where: { id: { in: allocationRows.map((r) => r.id) } },
        data: { withdrawalId: withdrawal.id },
      });
    }
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

  // This used to refuse unless KYC was VERIFIED, on the reasoning that
  // approving an account *is* comparing `accountHolderName` against a legal
  // name on a document, and without a document there is nothing to compare
  // against. That reasoning still holds — but KYC is optional now, so keeping
  // the refusal would mean no account could ever be verified and no partner
  // could ever be paid. The check moves to the admin's own eyes: the payout
  // queue shows them the full details and makes them confirm what they saw.
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
      await tx.servicePaymentAllocation.updateMany({
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
      await tx.servicePaymentAllocation.updateMany({ where: { withdrawalId }, data: { withdrawalId: null } });
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
