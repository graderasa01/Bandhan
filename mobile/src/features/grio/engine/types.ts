import type { GrioActionCall, GrioActionKey } from "~/shared/grio/grio";
import type {
  ConciergeBriefingResponse,
  ConciergeMatchOption,
  ConciergeMessage,
  ConciergePersonOption,
  ConciergeRosterEntry,
  ConciergeWalkthroughStep,
} from "~/shared/grio/concierge";
import type {
  GrioAnsweredBy,
  GrioEvidenceCard,
  GrioIntent,
  GrioProfileAction,
  GrioProfileBriefResponse,
  GrioProfileHeader,
  GrioPromptSuggestion,
} from "~/shared/grio/grioProfile";
import type { GrioProfileCard } from "~/shared/grio/grioCards";
import type { DiscoverFilters } from "~/types/api";

/**
 * The shapes the app's one Grio turn engine works in. Pure TypeScript — no
 * React Native — so the engine and its rules run (and are checked) anywhere.
 *
 * The server contract itself is the web's, vendored into `~/shared/grio/`;
 * these are only the app's own words for holding a conversation.
 */

/**
 * What one conversation is *about*, when it is about anything — the web's
 * `GrioScope`, and for the same reason a union: a match (help write to someone
 * who already said yes) and a candidate (understand one opened profile) are two
 * jobs with two permissions, and the server refuses a request carrying both.
 */
export type GrioScope =
  | { kind: "match"; matchId: string; name: string }
  | { kind: "candidate"; profileId: string; name: string; source?: GrioCandidateSource };

export type GrioCandidateSource = "reel" | "page" | "chat";

/**
 * Where Grio was opened from. Every entry point hands over the context it
 * already holds — ids from the app's own state, never from anything a model
 * wrote — and the engine turns it into a scope and an opening.
 */
export type GrioEntry =
  /** A screen with nothing specific on it (Chats list, Interests). */
  | { kind: "general" }
  /** Home: the day's briefing, as on the web panel. */
  | { kind: "dashboard" }
  /** A person on screen — the reel card, the profile page, a card inside Grio. */
  | { kind: "candidate"; profileId: string; name: string; source: GrioCandidateSource }
  /** An open chat. */
  | { kind: "match"; matchId: string; name: string }
  /** The Search screen, with the member's own filters. */
  | { kind: "discovery"; summary: string | null; filters: DiscoverFilters };

/** How a turn was asked. The engine treats all of them the same; only speech changes confirmations. */
export type TurnSource = "typed" | "chip" | "voice" | "entry";

/** A person a targeted action lands on — always produced by code (scope, roster, picker, a tapped card). */
export interface GrioTarget {
  profileId: string;
  name: string;
}

/** A thread a drafted message goes into. */
export interface GrioSendTarget {
  matchId: string;
  name: string;
}

/** What code sent beside a profile answer — shown with the reply, never sent back to the model. */
export interface ReplyMeta {
  intent: GrioIntent | null;
  profileId: string | null;
  evidence: GrioEvidenceCard | null;
  profileActions: GrioProfileAction[];
  followUps: GrioPromptSuggestion[];
  answeredBy: GrioAnsweredBy | null;
}

export interface RememberedFact {
  fact: string;
  /** The saved row, for Undo. Null when the server did not say which row it was. */
  itemId: string | null;
  undone: boolean;
}

/** An action that can be taken back from the transcript line that reported it. */
export type GrioUndo = { kind: "shortlist"; target: GrioTarget; done: boolean };

/**
 * One line of the conversation.
 *
 * `content` is exactly what the model reads on the next turn (the web resends
 * the transcript every call — there is no server-side history). Everything
 * else is for the screen only.
 */
export interface GrioMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /**
   * turn      a question or Grio's reply
   * briefing  the code-composed opening (`/api/concierge/briefing`)
   * outcome   code's line after something happened — an action, a search, a save
   */
  kind: "turn" | "briefing" | "outcome";
  source?: TurnSource;
  /** Outcome lines only. */
  tone?: "success" | "error" | "info";
  meta?: ReplyMeta;
  /** Profiles shown as cards under this line — ids from code (roster, search, a hop). */
  cards?: string[];
  /** Where this reply's `<<<SEND>>>` goes — the thread it was drafted for (roster match, profile path, open chat). */
  sendTarget?: GrioSendTarget;
  /** Whom this reply's `<<<ASK>>>` was drafted for — the profile open when it was written. */
  askTarget?: GrioTarget;
  /** This reply's `<<<DO:>>>` was carried out, so its chip is not offered again. */
  ranRun?: boolean;
  remembered?: RememberedFact[];
  undo?: GrioUndo;
  /** LEARN cards already saved from this reply: catalog key → the option saved. */
  learned?: Record<string, string>;
}

/**
 * The one thing the engine is waiting on the member for. Sheets are modal, so
 * there is only ever one.
 */
export type GrioPending =
  /** "Ye {name} par hoga" + the catalog's own confirm copy. */
  | { kind: "confirm"; key: GrioActionKey; target: GrioTarget | null; messageId: string | null; origin: GrioOrigin }
  /** "Kis par?" — the targeted action (or question) waits for a finger on a person. */
  | { kind: "pickPerson"; then: PickThen }
  /** "Kise bhejein?" — a drafted message waits for a chat-open match. */
  | { kind: "pickMatch"; text: string; messageId: string | null }
  /** The editable last stop before a message or a question leaves. */
  | { kind: "draft"; draft: GrioDraft; text: string; messageId: string | null }
  /** A catalog row the app has no screen for yet — said plainly, with where it can be done. */
  | { kind: "unavailable"; key: GrioActionKey; target: GrioTarget | null };

export type GrioOrigin = "chip" | "do" | "card" | "profile";

export type PickThen =
  | { kind: "action"; key: GrioActionKey; messageId: string | null; origin: GrioOrigin }
  | { kind: "ask"; text: string; messageId: string | null };

export type GrioDraft = { kind: "send"; target: GrioSendTarget } | { kind: "ask"; target: GrioTarget };

export interface GrioWalk {
  steps: ConciergeWalkthroughStep[];
  index: number;
}

/* ------------------------------------------------------------------ */
/* The doors                                                           */
/* ------------------------------------------------------------------ */

/** The `/api/concierge` body — built only by `buildConciergeBody`. */
export interface ConciergeRequestBody {
  messages: ConciergeMessage[];
  matchId?: string;
  candidateProfileId?: string;
  shownProfileIds?: string[];
  lastIntent?: string;
}

/** A parsed `/api/concierge` answer. `ok: false` is the server's own refusal, with its words. */
export interface ConciergeTurnResult {
  ok: boolean;
  reply: string | null;
  code: string | null;
  message: string | null;
  roster: ConciergeRosterEntry[] | null;
  intent: GrioIntent | null;
  profileId: string | null;
  header: GrioProfileHeader | null;
  evidence: GrioEvidenceCard | null;
  profileActions: GrioProfileAction[];
  followUps: GrioPromptSuggestion[];
  answeredBy: GrioAnsweredBy | null;
  sendTarget: GrioSendTarget | null;
}

export interface GrioCallResult {
  ok: boolean;
  message: string | null;
  /** `/api/interests` — the interest made a match. */
  matched: boolean;
  matchId: string | null;
}

export interface AskQuestionResult {
  ok: boolean;
  alreadyAsked: boolean;
  heldForReview: boolean;
  message: string | null;
}

export interface DiscoverIntentResult {
  ok: boolean;
  message: string | null;
  summary: string;
  filters: DiscoverFilters;
  unresolved: string[];
  behaviorMode: string | null;
}

export interface DiscoverSearchResult {
  ok: boolean;
  message: string | null;
  profileIds: string[];
  countLabel: string;
}

/** No network at all — distinct from a server that answered "no". */
export class GrioOfflineError extends Error {
  constructor(message = "Network error — dobara try karein.") {
    super(message);
    this.name = "GrioOfflineError";
  }
}

/**
 * Every HTTP door the engine uses — each one an existing server route with its
 * own gate. Live and mock implementations live beside the engine; the engine
 * never builds a URL of its own except through a catalog row's `request()`.
 */
export interface GrioTransport {
  concierge(body: ConciergeRequestBody): Promise<ConciergeTurnResult>;
  briefing(): Promise<ConciergeBriefingResponse | null>;
  walkthrough(): Promise<ConciergeWalkthroughStep[]>;
  people(): Promise<ConciergePersonOption[]>;
  matches(): Promise<ConciergeMatchOption[]>;
  cards(profileIds: string[]): Promise<GrioProfileCard[]>;
  profileBrief(profileId: string): Promise<GrioProfileBriefResponse>;
  /** A catalog row's own call (`request(target)` or its `endpoint`). */
  run(call: GrioActionCall): Promise<GrioCallResult>;
  sendMessage(matchId: string, text: string): Promise<GrioCallResult>;
  askQuestion(profileId: string, text: string): Promise<AskQuestionResult>;
  remember(fact: string): Promise<{ ok: boolean; itemId: string | null; message: string | null }>;
  forget(itemId: string): Promise<boolean>;
  learn(key: string, value: string): Promise<{ ok: boolean; message: string | null }>;
  discoverIntent(query: string): Promise<DiscoverIntentResult>;
  discoverSearch(filters: DiscoverFilters, behaviorMode: string | null): Promise<DiscoverSearchResult>;
}

/** What changed on the server, so the app's cached screens can catch up. */
export type GrioDataEvent =
  | { kind: "interest"; profileId: string; matched: boolean; matchId: string | null }
  | { kind: "shortlist"; profileId: string; on: boolean }
  | { kind: "message"; matchId: string }
  | { kind: "question"; profileId: string }
  /** The member's own profile changed (a LEARN answer, a boost, a Deep Profile run). */
  | { kind: "self" };

/** Everything the engine does outside itself, handed in by the app (and faked by the checks). */
export interface GrioEffects {
  /** An in-app route. Returns false when the member cannot go there yet. */
  navigate(route: string): boolean;
  openWebsite(path: string): void;
  toast(tone: "success" | "error" | "info", message: string): void;
  haptic(kind: "tap" | "success" | "warn"): void;
  refresh(event: GrioDataEvent): void;
  /** Take the Grio room off screen (before a navigation, or "Grio band karo"). */
  dismiss(): void;
}
