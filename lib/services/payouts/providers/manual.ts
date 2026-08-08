import type { PayoutProvider, PayoutResult } from "../types";

/**
 * The provider that admits a human is doing the transfer.
 *
 * This is not a stub or a mock — it is the honest description of how payouts
 * work today: an admin opens their bank, sends the money, and types the UTR
 * back in. Modelling that as a provider (rather than as "no provider") means
 * the withdrawal flow, the ledger, the reveal audit and the partner's screen
 * are all already built against the same interface a real payout API will
 * satisfy, so switching is an env change rather than a rewrite — exactly how
 * payments already work behind the dummy gateway.
 *
 * `isAutomatic: false` is what the admin UI reads to decide whether to ask for
 * a UTR by hand or to show a "sending…" state.
 */
export const manualPayoutProvider: PayoutProvider = {
  name: "manual",
  isAutomatic: false,

  async send(): Promise<PayoutResult> {
    return {
      ok: false,
      provider: "manual",
      kind: "not_configured",
      message: "Automatic payout abhi wired nahi hai — admin bank se bhej kar UTR daalega.",
    };
  },
};
