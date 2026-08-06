/**
 * The Grio Deck (Phase G7) — the cards that sit above the conversation.
 *
 * Grio already reaches every `/user/*` page, but opening it lands on an empty
 * chatbox: today's mission is inside the reel, a locked voice note is inside
 * the inbox, a quest is inside Vibe. Doc 11 §2's whole argument is that Grio
 * should be *one door* to what already exists. The deck is that door — and it
 * is the boring half of it, because every card is a plain server-side read of
 * something that already happened.
 *
 * Four properties are load-bearing, and they are the same four that make
 * `GRIO_ACTIONS` safe:
 *
 *  1. **The model never sees the deck.** Cards are built server-side and go
 *     straight to the UI. Nothing here enters the concierge prompt, so the
 *     boundary `lib/services/grio/context.ts` defends — *the user's own state
 *     yes, another person's attributes never* — is not widened by one field.
 *     A card may name a masked bucket ("Delhi se, 26 saal ki Software
 *     Engineer") because that is what the recipient is already allowed to see;
 *     it is not a thing Grio *knows*, it is a thing the screen shows.
 *  2. **Copy comes from here, never from a model.** Same reason as
 *     `GrioActionSpec.label` (D-61): a call-to-action written by a language
 *     model is a fake-urgency generator with extra steps.
 *  3. **Every countdown is a real column.** `ProfileQuestion.expiresAt` really
 *     does expire; a *received voice note* does not — so `lockedVoiceNote`
 *     never shows time left. A `RewardGrant.expiresAt` (the credit that opens
 *     one) genuinely does expire too, which is what `expiringCredit` reads.
 *     Same rule either way, see `URGENT_WINDOW_MS`: there is no invented
 *     24-hour timer anywhere in this file, and there must never be.
 *  4. **An empty deck is the common case, not a failure.** If nothing real
 *     happened, the user gets the ordinary starters. A card every day is how
 *     doc 10 §7.1 says trust dies.
 */

/** Most cards on screen at once. Two reads as "Grio noticed"; five reads as a nag. */
export const DECK_MAX_CARDS = 2;

/**
 * How many of those may be a card whose button leads to spending something
 * (a credit, or an upgrade). One. A deck that is two sell cards is an ad
 * break, and the user opened a chat.
 */
export const DECK_MAX_SELL_CARDS = 1;

/**
 * Time left below which a real deadline is worth showing. Above it the card
 * says nothing about time at all — "6 din baaki" is not urgency, it is noise
 * that trains the user to ignore the line that will matter on day six.
 */
export const URGENT_WINDOW_MS = 48 * 3600_000;

export type GrioDeckCard =
  | {
      kind: "lockedVoiceNote";
      /** VoiceNote id — the same id `/api/voice-notes/[id]/unlock` takes. */
      id: string;
      /**
       * Masked bucket, straight from `buildMaskedTeaser`. Never a name: the
       * name arrives with the unlock, and that gap is the entire mechanic.
       * For an answer to the user's own question this is the answer line
       * instead — see `isAnswer`.
       */
      teaser: string;
      /**
       * True when this is a reply to a question *this user* asked. Identity
       * was never secret from them (voiceNoteService's `notifyRecipient`), so
       * the copy must not pretend it is; only the audio stays gated.
       */
      isAnswer: boolean;
      seconds: number;
      createdAt: string;
    }
  | {
      kind: "pendingQuestion";
      /** ProfileQuestion id. */
      id: string;
      teaser: string;
      questionText: string;
      /** Real `ProfileQuestion.expiresAt`. The one countdown this file allows. */
      expiresAt: string;
      createdAt: string;
    }
  | {
      kind: "expiringCredit";
      /**
       * How many VOICE_UNLOCK credits this covers. Only the ones actually
       * expiring within `URGENT_WINDOW_MS` are counted — a credit that isn't
       * close to lapsing isn't part of "don't let this go to waste".
       */
      count: number;
      /** Soonest `RewardGrant.expiresAt` among those credits — the one countdown this card shows. */
      expiresAt: string;
    }
  | {
      kind: "dailyMission";
      /**
       * Already-built, from `missionService.buildMissionHeadline` — the same
       * function `lib/data/reelData.ts` calls for the reel's own banner (Phase
       * G9). No compatibility number or candidate id travels separately here;
       * carrying a pre-formed sentence instead of raw data is what makes it
       * structurally impossible for this card to say something the reel
       * itself wouldn't say the same way.
       */
      headline: string;
    };

export type GrioDeckCardKind = GrioDeckCard["kind"];

/** Buttons are English per the app's CTA convention; the card's body is Hinglish. */
export const DECK_CTA: Record<GrioDeckCardKind, string> = {
  lockedVoiceNote: "Unlock & Listen",
  pendingQuestion: "Answer via Voice",
  // Nothing to spend the credit on from here (see deck.ts: this card only
  // appears when there is no locked note to spend it on) — the button just
  // gets the user to the one place a note might already be waiting.
  expiringCredit: "Open inbox",
  // Same destination and same wording GRIO_ACTIONS.openReel already uses
  // (lib/contracts/grio.ts) — one place on screen, one name for it.
  dailyMission: "Today's matches",
};

/**
 * Which kinds count against `DECK_MAX_SELL_CARDS`. `expiringCredit`
 * deliberately isn't one — it asks the user to spend nothing, it reminds them
 * of something they already earned. A deck that rationed *that* the same way
 * it rations "unlock this for ₹" would be treating a benefit like a pitch.
 */
export const SELL_CARD_KINDS: GrioDeckCardKind[] = ["lockedVoiceNote"];

/**
 * What the unlock button actually says, given what the user actually holds.
 *
 * A branch rather than a constant because "Unlock" is a lie to someone whose
 * plan already opens the note — nothing is being spent, and naming a cost that
 * isn't there is the mirror image of hiding one. It lives in this file rather
 * than the component for the same reason every other string here does: all the
 * wording in one place someone has to open to change.
 */
export function deckUnlockLabel(canUnlockFree: boolean, credits: number): string {
  if (canUnlockFree) return "Listen";
  if (credits > 0) return `Unlock — ${credits} available`;
  return DECK_CTA.lockedVoiceNote;
}

export interface GrioDeck {
  cards: GrioDeckCard[];
  /** Plan already opens received notes — no credit is spent. */
  canUnlockFree: boolean;
  /** Earned VOICE_UNLOCK credits in hand, for honest button copy. */
  unlockCredits: number;
}

export interface GrioDeckResponse {
  ok: boolean;
  deck?: GrioDeck;
  message?: string;
}

/**
 * Milliseconds left, or null when the deadline is far enough away that saying
 * anything about it would be manufactured pressure (property 3 above).
 */
export function urgentMsLeft(expiresAt: string, now = Date.now()): number | null {
  const left = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(left) || left <= 0 || left > URGENT_WINDOW_MS) return null;
  return left;
}

/** "7 ghante baaki" / "40 minute baaki". Coarse on purpose — a ticking second-hand is pressure, not information. */
export function formatTimeLeft(ms: number): string {
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours} ghante baaki`;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `${minutes} minute baaki`;
}
