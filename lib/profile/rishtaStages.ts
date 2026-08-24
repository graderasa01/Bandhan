import type { RishtaStage } from "@prisma/client";

/**
 * How far a rishta has come, computed from events that already happened.
 *
 * Pure TypeScript — no prisma, no `server-only` — same split and same reason as
 * `signalAnswers.ts` and `expectationGaps.ts`: the interesting logic is a
 * decision over a handful of counts, and a decision that needs Postgres to be
 * exercised is one nobody exercises.
 *
 * ## The line this file will not cross
 *
 * Derivation stops at TALKING.
 *
 * Everything up to that point is a fact with a row behind it: an interest was
 * sent, both sides said yes, messages went both ways. Everything past it is a
 * judgement — nothing in a database distinguishes "chatting politely because it
 * would be rude not to" from "seriously considering marrying this person", and
 * the two look *identical* in message volume. A system that guessed would be
 * wrong in the worst direction: telling somebody they are in an understanding
 * with a person they were being polite to.
 *
 * So the stages that require a human to mean something are confirmed by that
 * human, and this function returns the floor beneath them.
 *
 * ## Why the confirmed stage cannot drag the journey backwards
 *
 * `effectiveStage` takes the later of derived and confirmed, with one exception
 * carved out for CLOSED. A user who confirmed FAMILY_INVOLVED and then sent
 * three more messages has not regressed to TALKING; a user who closed a rishta
 * has closed it, however many messages arrive afterwards.
 */

/** Catalog order. Index is the comparison — nothing else encodes progression. */
export const RISHTA_STAGE_ORDER: RishtaStage[] = [
  "DISCOVERED",
  "INTERESTED",
  "MUTUAL_MATCH",
  "TALKING",
  "UNDERSTANDING",
  "FAMILY_INVOLVED",
  "MEETING_PLANNED",
  "MET",
  "DECISION",
  "CLOSED",
];

export function stageRank(stage: RishtaStage): number {
  return RISHTA_STAGE_ORDER.indexOf(stage);
}

/** Hinglish, for the strip and for anything Grio reads aloud. */
export const RISHTA_STAGE_LABEL: Record<RishtaStage, string> = {
  DISCOVERED: "Dekha hai",
  INTERESTED: "Interest bheja",
  MUTUAL_MATCH: "Match ho gaya",
  TALKING: "Baat chal rahi hai",
  UNDERSTANDING: "Seriously samajh rahe hain",
  FAMILY_INVOLVED: "Ghar wale bhi jud gaye",
  MEETING_PLANNED: "Milne ka plan hai",
  MET: "Mil chuke hain",
  DECISION: "Faisla ho raha hai",
  CLOSED: "Baat khatam",
};

/**
 * The furthest stage derivation may reach on its own.
 *
 * Stated as a constant rather than left implicit in the `if` chain below, so a
 * future edit that tries to derive UNDERSTANDING has to delete this line and
 * read the paragraph above it first.
 */
export const MAX_DERIVED_STAGE: RishtaStage = "TALKING";

/**
 * Everything derivation is allowed to look at.
 *
 * Deliberately counts and booleans rather than rows: the caller does the
 * querying, this decides. That is what keeps the decision testable and keeps
 * this module free of prisma.
 */
export interface RishtaSignals {
  /** An interest exists from the user to the other person. */
  interestSent: boolean;
  /** An interest exists from the other person to the user. */
  interestReceived: boolean;
  /** A mutual match row exists. */
  matched: boolean;
  messagesFromUser: number;
  messagesFromOther: number;
  /** Family shortlisted them or wrote a note about them. */
  familyTouched: boolean;
}

/**
 * Two messages one way is somebody being polite. The threshold for TALKING is
 * that **both** sides have said something — a reply is the smallest real
 * evidence that a conversation exists rather than an opening that was ignored.
 */
export function deriveStage(signals: RishtaSignals): RishtaStage {
  if (signals.messagesFromUser > 0 && signals.messagesFromOther > 0) return "TALKING";
  if (signals.matched) return "MUTUAL_MATCH";
  if (signals.interestSent || signals.interestReceived) return "INTERESTED";
  return "DISCOVERED";
}

/**
 * What the journey actually is, given what was derived and what was confirmed.
 *
 * CLOSED is absolute. Everything else takes the further of the two, because a
 * confirmation is a statement about a threshold that was crossed and crossing
 * it again is not news — while a new message on a rishta the user marked
 * FAMILY_INVOLVED must not quietly report them back down to TALKING.
 */
export function effectiveStage(derived: RishtaStage, confirmed: RishtaStage | null): RishtaStage {
  if (confirmed === "CLOSED") return "CLOSED";
  if (!confirmed) return derived;
  return stageRank(confirmed) >= stageRank(derived) ? confirmed : derived;
}

/**
 * Which stages the user may move to from here.
 *
 * Forward one step, or CLOSED from anywhere. Not a free jump to any stage:
 * "MET" offered to somebody who has not started talking is a control that makes
 * no sense, and a picker of ten options turns a one-tap confirmation into a
 * form. FAMILY_INVOLVED is additionally offered out of order, because family
 * frequently gets involved before a meeting is planned and sometimes before the
 * couple would call it an understanding — Indian matrimony does not run in a
 * straight line and pretending otherwise would make the control wrong more
 * often than right.
 */
export function nextStages(current: RishtaStage): RishtaStage[] {
  if (current === "CLOSED") return [];

  const out: RishtaStage[] = [];
  const idx = stageRank(current);
  const next = RISHTA_STAGE_ORDER[idx + 1];
  if (next && next !== "CLOSED") out.push(next);

  if (current !== "FAMILY_INVOLVED" && stageRank("FAMILY_INVOLVED") > idx && !out.includes("FAMILY_INVOLVED")) {
    out.push("FAMILY_INVOLVED");
  }

  out.push("CLOSED");
  return out;
}

/**
 * Whether a stage is one the user has to say out loud.
 *
 * The four derivable stages are never offered as confirmations — a button that
 * asks somebody to confirm that they sent an interest is a button that teaches
 * them the app is not watching.
 */
export function requiresConfirmation(stage: RishtaStage): boolean {
  return stageRank(stage) > stageRank(MAX_DERIVED_STAGE);
}
