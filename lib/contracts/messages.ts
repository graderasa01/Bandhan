/** Real-data messaging contracts — chat is scoped to matched pairs (Match = thread key). */

export type ChatParticipant = {
  userId: string;
  /** Their profile row — a chat exists only on a Match, so this always opens at L3. */
  profileId: string | null;
  displayName: string;
  photoUrl: string | null;
  verified: boolean;
};

export type MessageViewModel = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** When the recipient read it. Always present in the payload — whether it's ever *shown* is the `readReceipts` plan gate, decided client-side per viewer. */
  readAt: string | null;
  /**
   * Present on a voice message. `url` is the gated `/api/media/:id` path —
   * holding it is not permission to hear it; the server asks the chat gate on
   * every play. Null when the audio was removed after sending.
   */
  voice?: { url: string; durationMs: number } | null;
};

/**
 * What a voice message's `body` holds — the conversation list, notices and the
 * Grio transcript all read `body`, and all of them should say *something*.
 */
export const VOICE_MESSAGE_LABEL = "🎤 Voice message";

export type ConversationViewModel = {
  matchId: string;
  other: ChatParticipant;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
  /** Whether this match's chat is open — an unlock, either member's plan, or a Circle window (D-90). */
  chatOpen: boolean;
};

export type ThreadViewModel = {
  matchId: string;
  other: ChatParticipant;
  messages: MessageViewModel[];
};
