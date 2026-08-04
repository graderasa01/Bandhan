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
};

export type ConversationViewModel = {
  matchId: string;
  other: ChatParticipant;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
};

export type ThreadViewModel = {
  matchId: string;
  other: ChatParticipant;
  messages: MessageViewModel[];
};
