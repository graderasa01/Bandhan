import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { db, delay, mockConversations } from "~/mocks/mockDb";
import { MOCK_PEOPLE } from "~/mocks/people";
import type { ChatMessage, ChatUnlockOutcome, ChatUnlockQuote, Conversation, Thread } from "~/types/api";

/**
 * Chat is scoped to a match (Match = thread key) and gated on the server
 * (`getChatAccess`, D-90): an unlock, either member's plan or a Circle window.
 *
 *   GET  /api/mobile/conversations   the list, with each thread's `chatOpen`
 *   GET  /api/messages/:matchId      the thread (marks it read)
 *   POST /api/messages/:matchId      send — 402 CHAT_LOCKED when the gate is shut
 *   GET  /api/chat-unlock/:matchId   what opening it would take (the web card's quote)
 *   POST /api/chat-unlock/:matchId   open it: already open, a held credit, or a checkout
 *
 * Polled while a thread is open (see `useThread`); the service boundary is
 * where a socket would slot in later without any screen changing.
 */
export interface ChatService {
  conversations(): Promise<Conversation[]>;
  thread(matchId: string): Promise<Thread>;
  send(matchId: string, body: string): Promise<ChatMessage>;
  unlockQuote(matchId: string): Promise<ChatUnlockQuote>;
  unlock(matchId: string): Promise<ChatUnlockOutcome>;
}

type UnlockResponse = { ok: true; state: "open" } | { ok: true; checkoutUrl: string } | { ok: false; message: string };

const live: ChatService = {
  async conversations() {
    const res = await api<{ ok: boolean; conversations: Conversation[] }>("/api/mobile/conversations");
    return res.conversations;
  },
  async thread(matchId) {
    const res = await api<{ ok: boolean; thread: Thread }>(`/api/messages/${encodeURIComponent(matchId)}`);
    return res.thread;
  },
  async send(matchId, body) {
    const res = await api<{ ok: boolean; message: ChatMessage }>(`/api/messages/${encodeURIComponent(matchId)}`, {
      body: { body },
    });
    return res.message;
  },
  async unlockQuote(matchId) {
    const res = await api<{ ok: boolean; quote: ChatUnlockQuote }>(`/api/chat-unlock/${encodeURIComponent(matchId)}`);
    return res.quote;
  },
  async unlock(matchId) {
    const res = await api<UnlockResponse>(`/api/chat-unlock/${encodeURIComponent(matchId)}`, { method: "POST" });
    if (!res.ok) throw new ApiError(422, "UNLOCK_FAILED", res.message);
    return "checkoutUrl" in res ? { state: "checkout", checkoutUrl: res.checkoutUrl } : { state: "open" };
  },
};

const REPLIES = [
  "Haan bilkul 😊",
  "Ye to bahut achhi baat hai!",
  "Main ghar par bhi is baare me baat karungi.",
  "Aapka weekend kaisa raha?",
];

const mock: ChatService = {
  async conversations() {
    await delay(300);
    return mockConversations().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async thread(matchId) {
    await delay(250);
    const match = db.matches.find((m) => m.id === matchId);
    if (!match) throw new ApiError(404, "NOT_FOUND", "Conversation nahi mila.");
    const p = MOCK_PEOPLE.find((x) => x.id === match.profileId);
    const messages = db.threads[matchId] ?? [];
    messages.forEach((m) => {
      if (m.senderId !== "u_me" && !m.readAt) m.readAt = new Date().toISOString();
    });
    return {
      matchId,
      other: { userId: p?.userId ?? "u_other", profileId: match.profileId, displayName: match.displayName, photoUrl: null, verified: match.verified },
      messages: [...messages],
    };
  },
  async send(matchId, body) {
    await delay(250);
    const thread = (db.threads[matchId] ??= []);
    const message: ChatMessage = { id: `msg_${Date.now()}`, senderId: "u_me", body, createdAt: new Date().toISOString(), readAt: null };
    thread.push(message);
    // A friendly auto-reply so the demo conversation feels alive.
    const match = db.matches.find((m) => m.id === matchId);
    const other = MOCK_PEOPLE.find((p) => p.id === match?.profileId);
    if (other) {
      setTimeout(() => {
        thread.push({
          id: `msg_${Date.now()}_r`,
          senderId: other.userId,
          body: REPLIES[thread.length % REPLIES.length]!,
          createdAt: new Date().toISOString(),
          readAt: null,
        });
      }, 2500);
    }
    return message;
  },
  // Every sample chat is open (see `mockConversations`), so there is nothing to buy.
  async unlockQuote() {
    await delay(150);
    return { state: "open" };
  },
  async unlock() {
    await delay(250);
    return { state: "open" };
  },
};

export const chatService: ChatService = IS_MOCK ? mock : live;
