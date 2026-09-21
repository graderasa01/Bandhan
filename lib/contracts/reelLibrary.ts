import type { ReelCardViewModel } from "@/lib/contracts/reel";

/**
 * Meri List — the half of the reel that looks backwards (D-91b).
 *
 * The reel's lenses (For You / Nearby / New) re-cut people the viewer has not
 * decided on yet. These four lanes are the opposite: people they already
 * acted on, kept so that a member whose pool has run dry still has their own
 * history to work through instead of an empty screen.
 *
 * Each lane is a *fact about a row that exists*, not a mood:
 *
 *   VIEWED   — swiped past, and nothing else ever happened: no interest either
 *              way, not liked, not shortlisted. The honest "maine dekha tha,
 *              chhod diya" pile, and the one worth a second look.
 *   LIKED    — the private like. Only the owner of the like sees this lane.
 *   INTEREST — interest this member *sent*. Received interest has its own
 *              screen (`/user/interests`) where it can be accepted or declined;
 *              duplicating that here would put two accept buttons in the app.
 *   MESSAGE  — a match where at least one message exists, either direction.
 */
export type ReelLane = "VIEWED" | "LIKED" | "INTEREST" | "MESSAGE";

export const REEL_LANES: ReelLane[] = ["VIEWED", "LIKED", "INTEREST", "MESSAGE"];

/**
 * A history card is a **real reel card** (D-91b, Devesh's correction).
 *
 * The first pass rendered these lanes as a compact list, on the reasoning that
 * you cannot swipe somebody you have already decided on. That was true of
 * Interest and Messages and wrong about the two lanes that matter most: the
 * whole point of Viewed is that the member gets to *re-decide*, and a
 * one-line row is not enough to change your mind with. So every lane is the
 * same full-bleed card as the reel — same photo, same ring, same reasons —
 * and only the actions underneath differ by lane.
 */
export type ReelLibraryCard = ReelCardViewModel & {
  /** The one line this lane can prove: "Viewed - aaj", "Interest sent", "Last message kal". */
  laneNote: string;
  /** Set when a chat already exists, so the Messages lane can open it from the card. */
  matchId: string | null;
};

export interface ReelLibraryPage {
  ok: boolean;
  lane: ReelLane;
  cards: ReelLibraryCard[];
  /** Opaque to the client — pass it back verbatim for the next page. Null = end. */
  nextCursor: string | null;
  /** How many this lane holds for this viewer — the number on the pill. */
  total: number;
  message?: string;
}

export type ReelLaneCounts = Record<ReelLane, number>;
