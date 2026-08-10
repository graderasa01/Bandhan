/** Ask Bridge (P7) — see lib/services/askBridge/profileQuestionService.ts. */

import type { ProfileQuestionStatus } from "@prisma/client";

/**
 * The ceiling the service enforces, stated here so a client can enforce it too.
 *
 * It lives in the contract rather than the service because the service imports
 * Prisma — a textarea that wanted to know the limit would have had to either
 * pull the database client into the browser bundle or hardcode a second copy of
 * the number, and the second copy is the one that drifts.
 */
export const QUESTION_MAX_LENGTH = 300;

export interface AskQuestionResponse {
  ok: boolean;
  questionId?: string;
  alreadyAsked?: boolean;
  status?: ProfileQuestionStatus;
  heldForReview?: boolean;
  code?: "FEATURE_OFF" | "NOT_FOUND" | "REJECTED" | "BAD_INPUT";
  message?: string;
}

export interface AnswerQuestionResponse {
  ok: boolean;
  heldForReview?: boolean;
  asker?: { userId: string; profileId: string | null; displayName: string | null };
  /** Server-decided — see components/ui/CelebrationHost. */
  celebration?: { tier: "first" | "reward" | "micro"; eventKey: string; title: string; subtitle?: string } | null;
  code?: "NOT_FOUND" | "EXPIRED" | "REJECTED";
  message?: string;
}

export interface InboundQuestionView {
  id: string;
  teaser: string;
  questionText: string;
  /**
   * `ProfileQuestion.expiresAt` — a real deadline, not a display device. Only
   * ever surfaced when it is genuinely close (see `urgentMsLeft` in
   * lib/contracts/grioDeck.ts); a question with six days left says nothing
   * about time.
   */
  expiresAt: string;
  createdAt: string;
}
