/**
 * Chat Unlock (D-90) — the shapes the thread screen and its API share.
 * Client-safe: no Prisma, no server imports.
 */

/** Hours after an unlock within which the other member has to have written back. */
export const NO_REPLY_GUARANTEE_HOURS = 72;

/** The one plan still sold, as the unlock card mentions it. Null when it is not on sale. */
export interface PassOffer {
  name: string;
  pricePaise: number;
}

export type ChatUnlockQuoteView =
  /** The chat is already open — by an unlock, either member's plan, or a Circle window. */
  | { state: "open" }
  /** The member holds unspent unlocks. `welcome` names the partner-referral gift. */
  | { state: "credit"; credits: number; welcome: boolean; pass: PassOffer | null }
  /** Nothing to spend — the unlock costs `pricePaise`. */
  | { state: "pay"; pricePaise: number; pass: PassOffer | null }
  /** This match cannot be unlocked by this member (not theirs, blocked, not on sale). */
  | { state: "unavailable"; message: string };

export type ChatUnlockActionResponse =
  | { ok: true; state: "open" }
  | { ok: true; checkoutUrl: string }
  | { ok: false; message: string };
