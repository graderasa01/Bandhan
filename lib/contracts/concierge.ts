/** Grio (formerly "AI Rishta Concierge", Phase E) — see app/api/concierge/route.ts. */

export interface ConciergeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConciergeResponse {
  ok: boolean;
  reply?: string;
  code?: "not_configured" | "upstream_error" | "bad_request";
  message?: string;
}

/** A chat-unlocked match Grio can draft-and-send a message to — see GET /api/concierge/matches. */
export interface ConciergeMatchOption {
  matchId: string;
  name: string;
  photoUrl: string | null;
}

/** Marks a suggested-message span inside an assistant reply — parsed client-side into a Copy/Send card. */
export const SEND_MARKER_START = "<<<SEND>>>";
export const SEND_MARKER_END = "<<<END>>>";
