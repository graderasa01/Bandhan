import type { PayoutProvider, PayoutRequest, PayoutResult } from "../types";

/**
 * RazorpayX Payouts — real bank transfers, when the account exists.
 *
 * Wired but **never yet run against the live API**: RazorpayX is a separate
 * product from the Razorpay checkout this app already uses, needs its own
 * business KYC and its own key pair, and none of that exists for BandhanTak
 * today. So this stays dormant behind `payoutProvider()`'s env check and
 * `manual.ts` does the work.
 *
 * Before the first real payout, verify against
 * razorpay.com/docs/api/x/payouts: the `fund_account` two-step (create a
 * contact, then a fund account, then a payout) is the part most likely to have
 * moved, and this implementation takes the shortcut of assuming a fund account
 * already exists for the destination. Do not treat a green typecheck here as
 * evidence it works.
 */
const API_BASE = "https://api.razorpay.com/v1";

function credentials(): { keyId: string; keySecret: string; accountNumber: string } | null {
  const keyId = process.env.RAZORPAYX_KEY_ID;
  const keySecret = process.env.RAZORPAYX_KEY_SECRET;
  // RazorpayX debits a specific virtual account, not "the balance".
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!keyId || !keySecret || !accountNumber) return null;
  return { keyId, keySecret, accountNumber };
}

export function isRazorpayXConfigured(): boolean {
  return credentials() !== null;
}

export const razorpayXPayoutProvider: PayoutProvider = {
  name: "razorpayx",
  isAutomatic: true,

  async send(req: PayoutRequest): Promise<PayoutResult> {
    const creds = credentials();
    if (!creds) {
      return {
        ok: false,
        provider: "razorpayx",
        kind: "not_configured",
        message: "RazorpayX keys set nahi hain.",
      };
    }

    const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");

    try {
      const res = await fetch(`${API_BASE}/payouts`, {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/json",
          // Our withdrawal id — a retry after a network timeout resolves to
          // the same payout instead of sending the money twice.
          "X-Payout-Idempotency": req.referenceId,
        },
        body: JSON.stringify({
          account_number: creds.accountNumber,
          amount: req.amountPaise,
          currency: "INR",
          mode: req.destination.method === "UPI" ? "UPI" : "IMPS",
          purpose: "payout",
          queue_if_low_balance: true,
          reference_id: req.referenceId,
          narration: req.narration.slice(0, 30),
          fund_account: {
            account_type: req.destination.method === "UPI" ? "vpa" : "bank_account",
            ...(req.destination.method === "UPI"
              ? { vpa: { address: req.destination.upiId } }
              : {
                  bank_account: {
                    name: req.destination.accountHolderName,
                    ifsc: req.destination.ifsc,
                    account_number: req.destination.accountNumber,
                  },
                }),
          },
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { id?: string; utr?: string | null; error?: { description?: string } }
        | null;

      if (!res.ok || !json?.id) {
        const message = json?.error?.description ?? `RazorpayX se ${res.status} aaya.`;
        return {
          ok: false,
          provider: "razorpayx",
          kind: res.status === 401 ? "auth" : res.status === 400 ? "invalid_destination" : "rejected",
          message,
        };
      }

      // A queued payout has no UTR yet — that arrives on a webhook. The
      // withdrawal stays un-PAID until one does, rather than claiming a
      // transfer that hasn't settled.
      return { ok: true, provider: "razorpayx", providerRef: json.id, utr: json.utr ?? null };
    } catch (err) {
      return {
        ok: false,
        provider: "razorpayx",
        kind: "connection",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
