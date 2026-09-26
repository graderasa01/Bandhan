import type { BoloMode } from "~/shared/bolo/agent";

/**
 * The contract between Grio's live voice and the Bolo screen — the same
 * events and tool-call shape as the web's `lib/bolo/liveClient.ts`, so the
 * screen's state machine (`useBoloFlow`) reads exactly like the web page's.
 */

export type LiveStatus = "idle" | "connecting" | "listening" | "speaking" | "closed";

/** `background`: the app left the screen — the phone stops giving a backgrounded app the mic. */
export type LiveEndReason = "user" | "idle" | "max_session" | "go_away" | "network" | "finished" | "background";

export type LiveFailure =
  | "not_configured"
  | "disabled"
  | "rate_limited"
  | "token"
  | "socket"
  | "mic_denied"
  | "unsupported"
  /** The token came back for a different brief than the screen is showing — signed in or out meanwhile. */
  | "session_changed";

export type LiveEvent =
  | { type: "status"; status: LiveStatus }
  | { type: "level"; level: number }
  | { type: "transcript"; role: "user" | "grio"; text: string; final: boolean }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "ended"; reason: LiveEndReason }
  | { type: "failed"; failure: LiveFailure };

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LiveHandlers {
  onEvent: (event: LiveEvent) => void;
  /** Runs every tool the model asks for and returns the responses, in order. */
  onToolCalls: (calls: ToolCallRequest[]) => Promise<Array<Record<string, unknown>>>;
}

export interface LiveSessionOptions {
  mode: BoloMode;
  /** The first thing said to the model, so Grio speaks first. */
  kickoffText: string;
}

/** What the screen holds on to while a conversation is open. */
export interface LiveSession {
  readonly currentStatus: LiveStatus;
  start(): Promise<void>;
  sendText(text: string): void;
  setMuted(muted: boolean): void;
  stop(reason?: LiveEndReason): void;
}
