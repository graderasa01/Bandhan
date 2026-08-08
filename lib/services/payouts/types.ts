/**
 * The contract a payout provider implements — same shape as
 * lib/services/outreach/types.ts and lib/ai/providers/types.ts, so a provider
 * module can be imported for its types without dragging in its SDK.
 */

export type PayoutDestination =
  | { method: "UPI"; upiId: string; accountHolderName: string }
  | { method: "BANK"; accountNumber: string; ifsc: string; accountHolderName: string; bankName: string | null };

export type PayoutRequest = {
  /** Our own withdrawal id — sent as the idempotency key so a retry can't double-pay. */
  referenceId: string;
  amountPaise: number;
  destination: PayoutDestination;
  narration: string;
};

export type PayoutResult =
  | { ok: true; provider: string; providerRef: string; utr: string | null }
  | { ok: false; provider: string; kind: PayoutErrorKind; message: string };

export type PayoutErrorKind =
  /** No payout API configured — the deployment pays by hand. */
  | "not_configured"
  | "auth"
  | "insufficient_balance"
  | "invalid_destination"
  | "rejected"
  | "connection";

export type PayoutProvider = {
  name: string;
  /** True when this provider can actually move money right now. */
  isAutomatic: boolean;
  send(req: PayoutRequest): Promise<PayoutResult>;
};
