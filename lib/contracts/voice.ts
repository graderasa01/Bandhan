/** Voice notes — see lib/services/voice/voiceNoteService.ts for the masking rule. */

import type { VoiceNoteContext } from "@prisma/client";

export interface ReceivedVoiceNoteView {
  id: string;
  context: VoiceNoteContext;
  /**
   * "Jaipur se 27 saal ki Marketing Manager". Coarse buckets only — this is
   * what a locked note is allowed to say, and it is written that way at the
   * source rather than redacted in the UI.
   *
   * For a QUESTION_ANSWER note this is not a demographic bucket at all — the
   * recipient here is the original asker, who already knows exactly who this
   * is, so masking would only confuse. It reads "Aapke sawaal ka jawab" instead.
   */
  teaser: string;
  seconds: number;
  unlocked: boolean;
  /** Null while locked. A locked note carries no audio address at all. */
  playbackUrl: string | null;
  /**
   * Null while locked — except for QUESTION_ANSWER, where identity was never
   * secret from this recipient in the first place (see voiceNoteService's
   * `notifyRecipient`). Content, not identity, is what stays paywalled there.
   */
  senderName: string | null;
  senderProfileId: string | null;
  senderUserId: string | null;
  createdAt: string;
}

export interface UnlockVoiceNoteResponse {
  ok: boolean;
  playbackUrl?: string;
  usedCredit?: boolean;
  message?: string;
}
