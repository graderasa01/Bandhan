/** Ask Bridge (P7) — see lib/services/askBridge/profileQuestionService.ts. */

import type { ProfileQuestionStatus } from "@prisma/client";

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
  createdAt: string;
}
