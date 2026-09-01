import type { CandidateProposalStatus, ProfileDelegatePermission, ProposalSource } from "@prisma/client";

/**
 * The Client Desk rulebook — client-safe, read by the partner's desk, the
 * owner's approval queue and every route between.
 *
 * The Phase 1 policy file already owns delegation permissions in general; this
 * one owns what the *desk* does with the three new ones and what a proposal is
 * allowed to be.
 */

/* ------------------------------------------------------------------ */
/* Permissions added in Phase 3                                        */
/* ------------------------------------------------------------------ */

/**
 * The desk's own permissions, in the order an owner would grant them: look,
 * suggest, draft. Each buys strictly more than the one before, and none of
 * them sends anything.
 */
export const DESK_PERMISSIONS: readonly ProfileDelegatePermission[] = [
  "SEARCH_FOR_CLIENT",
  "PROPOSE_SHORTLIST",
  "DRAFT_MESSAGE",
];

/**
 * Labels for the three, in the owner's words.
 *
 * Written to say what the partner **cannot** do in the same breath, because
 * every one of these is the kind of permission people over-read: "search for
 * me" sounds like "act for me" unless the sentence says otherwise.
 */
export const DESK_PERMISSION_LABELS: Record<string, string> = {
  SEARCH_FOR_CLIENT: "Aapki hi pasand ke hisaab se profiles dhoondh sakte hain — jo aapko dikhti hain, wahi unhe dikhengi",
  PROPOSE_SHORTLIST: "Kisi ko aapke saamne rakh sakte hain, wajah ke saath — lagega tabhi jab aap haan karein",
  DRAFT_MESSAGE: "Pehla message likh kar de sakte hain — bhejenge aap khud, badal kar",
};

/* ------------------------------------------------------------------ */
/* Search limits                                                       */
/* ------------------------------------------------------------------ */

/**
 * The page a partner gets is the same size the member's own screen gets — the
 * cap is imported rather than redeclared so the two can never diverge.
 */
export const DESK_SEARCH_PAGE_SIZE = 20;

/**
 * How many searches one partner may run for one client in a rolling day.
 *
 * This is the "no bulk export" rule with a number on it. 40 pages of 20 is
 * 800 profiles — far more than any honest curation needs in a day, and far
 * less than a scrape. It is deliberately per (partner, client) rather than per
 * partner: a bureau with thirty clients should not be squeezed by the budget
 * of the busiest one, and a partner cannot pool thirty clients' budgets
 * against a single one either.
 */
export const DESK_SEARCH_DAILY_LIMIT = 40;
export const DESK_SEARCH_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Proposals                                                           */
/* ------------------------------------------------------------------ */

export const MIN_PROPOSAL_REASON_CHARS = 15;
export const MAX_PROPOSAL_REASON_CHARS = 700;
export const MAX_DRAFT_MESSAGE_CHARS = 600;
export const MAX_CLIENT_NOTE_CHARS = 2000;

/**
 * How many proposals may sit undecided in front of one owner at once.
 *
 * Not a storage limit — a queue limit. Twenty unanswered suggestions is not a
 * shortlist, it is a pile, and the partner who produced it has stopped
 * curating. Capping it forces the partner to spend their next proposal by
 * withdrawing a stale one, which is the behaviour the product actually wants.
 */
export const MAX_PENDING_PROPOSALS = 10;

export const PROPOSAL_STATUS_LABEL: Record<CandidateProposalStatus, string> = {
  PROPOSED: "Aapke jawaab ka intezaar",
  ACCEPTED: "Aapne haan ki",
  REJECTED: "Aapne mana kiya",
  WITHDRAWN: "Partner ne wapas le liya",
  EXPIRED: "Permission khatam hone par band",
};

export const PROPOSAL_SOURCE_LABEL: Record<ProposalSource, string> = {
  PARTNER_SEARCH: "Aapki apni pasand ke filters se dhoondha",
  PARTNER_OFFLINE: "Partner inhe pehle se jaante hain",
};

/**
 * The disclosure line under every proposal card.
 *
 * A proposal is a paid person's suggestion, and the owner is entitled to hold
 * it to a different standard than the Reel's own ranking. Saying so plainly is
 * the same anti-dark-pattern reflex D-61 applies to pricing.
 */
export const PROPOSAL_DISCLOSURE =
  "Ye suggestion aapke partner ne bheja hai — app ki apni ranking nahi. Fit score code ne nikala hai, partner ne nahi.";

export function isDeskPermission(p: ProfileDelegatePermission): boolean {
  return (DESK_PERMISSIONS as readonly string[]).includes(p);
}
