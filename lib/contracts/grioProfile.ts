import type { PhotoLock } from "@/lib/contracts/photoLock";
import type { GrioActionKey } from "@/lib/contracts/grio";

/**
 * Grio, talking about one profile — the shapes the server and the chat share.
 *
 * The chat used to receive one thing back: a string of prose with markers in
 * it. Everything that should have been *structure* — which person this was
 * about, what the model based its sentences on, what the member could do next
 * — was either inside that prose or absent. These types are that structure,
 * computed by code, so the screen can show it without trusting the model to
 * have mentioned it.
 *
 * Client-safe: no server imports.
 */

/**
 * What a question is asking for. Detected by code (lib/services/grio/profile/
 * intents.ts), so the answer path — which data to load, whether a model is
 * needed at all — is decided before any model sees the question.
 */
export const GRIO_INTENTS = [
  "PROFILE_SUMMARY",
  "PROFILE_FOR_ME",
  "PROFILE_FAMILY",
  "PROFILE_LIFESTYLE",
  "PROFILE_PREFERENCES",
  "PROFILE_COMPARE",
  "PROFILE_DIFFERENCE",
  "PROFILE_MISSING_INFO",
  "PROFILE_COMPATIBILITY",
  "KUNDALI_REQUEST",
  "MESSAGE_HELP",
  "INTEREST_HELP",
  "SERVICE_DISCOVERY",
  "NAVIGATION",
  "GENERAL_QUESTION",
] as const;

export type GrioIntent = (typeof GRIO_INTENTS)[number];

export function isGrioIntent(value: unknown): value is GrioIntent {
  return typeof value === "string" && (GRIO_INTENTS as readonly string[]).includes(value);
}

/** How the member asked to be answered — "sirf 3 points", "simple language", "detail me". */
export interface GrioAnswerStyle {
  maxPoints: number | null;
  simple: boolean;
  detailed: boolean;
}

/* ------------------------------------------------------------------ */
/* Evidence                                                             */
/* ------------------------------------------------------------------ */

/**
 * One comparison, the way code made it.
 *
 *   match      the two sides agree ("Aapki pasand: Delhi" / "Profile: Delhi")
 *   partial    close but not the same (an age two years outside the range)
 *   different  they do not agree
 *   unknown    one side never said — never scored, never a mark against anyone
 *   locked     the profile's side opens only after an interest / a match
 */
export type GrioEvidenceStatus = "match" | "partial" | "different" | "unknown" | "locked";

export type GrioEvidenceArea =
  | "location"
  | "age"
  | "education"
  | "career"
  | "lifestyle"
  | "family"
  | "values"
  | "tradition"
  | "expectations";

export interface GrioEvidenceRow {
  /** Stable id ("pref:city", "common:diet", "values:postMarriageLivingPlan"). */
  key: string;
  area: GrioEvidenceArea;
  label: string;
  /**
   * preference — what the viewer explicitly asked for, against the profile.
   * common     — the viewer's own detail against the profile's.
   * values     — a Marriage Intelligence dimension (Compatibility Lab).
   */
  kind: "preference" | "common" | "values";
  status: GrioEvidenceStatus;
  /** The viewer's side, in their own words. Always safe to show them — it is theirs. */
  yours: string | null;
  /** The profile's side. Null whenever it is locked, private, or simply not given. */
  theirs: string | null;
  /** Code's one-line sentence. Never a model's. */
  note: string | null;
}

export interface GrioEvidenceGroup {
  status: "match" | "different" | "unknown";
  label: string;
  rows: GrioEvidenceRow[];
}

/** The card under a reply: what was compared, grouped Similar / Different / Unknown. */
export interface GrioEvidenceCard {
  title: string;
  groups: GrioEvidenceGroup[];
  /** e.g. "Aapne partner preference abhi nahi batayi — isliye sirf common baatein." */
  footnote: string | null;
}

/* ------------------------------------------------------------------ */
/* The person Grio is talking about                                     */
/* ------------------------------------------------------------------ */

/**
 * The header pinned above a profile conversation — exactly what the profile
 * page's first screen shows this viewer, and no more. The photo only when the
 * photo gate opens it (`photoLockFor`); a locked photo's address never leaves
 * the server.
 */
export interface GrioProfileHeader {
  profileId: string;
  name: string;
  age: number | null;
  city: string | null;
  /** "MBA · Software Engineer" — education and job, when shown. */
  headline: string | null;
  photoUrl: string | null;
  photoLock: PhotoLock;
  verified: boolean;
  level: "L1" | "L2" | "L3";
  /** Plain words for the level — "Shuruaati jaankari", "Interest ke baad", "Match". */
  levelLabel: string;
  matchId: string | null;
  chatOpen: boolean;
}

/* ------------------------------------------------------------------ */
/* What the member can do next                                          */
/* ------------------------------------------------------------------ */

export type GrioProfileSection = "about" | "family" | "lifestyle" | "expectations" | "kundli";

/**
 * A button under a profile answer. Every kind maps to something that already
 * exists — a sheet the reel already has, the profile page, a catalog action
 * with its own confirm, or a follow-up question to Grio. Nothing here is a new
 * capability; it is the existing ones, one tap closer.
 */
export type GrioProfileAction =
  | { id: string; kind: "open_section"; label: string; section: GrioProfileSection }
  | { id: string; kind: "open_kundli"; label: string }
  | { id: string; kind: "view_profile"; label: string }
  | { id: string; kind: "ask"; label: string; prompt: string }
  | { id: string; kind: "catalog"; label: string; actionKey: GrioActionKey };

/** A question chip — the words the member would have typed, and what they mean. */
export interface GrioPromptSuggestion {
  id: string;
  label: string;
  ask: string;
  intent: GrioIntent;
}

/** Who wrote the words the member is reading. */
export type GrioAnsweredBy =
  /** A model wrote the prose, from code's facts. */
  | "ai"
  /** Code answered on its own — no model was needed (kundli, missing info, services). */
  | "code"
  /** A model was asked and could not answer; code's facts stand in so the member still gets an answer. */
  | "code-fallback";

/* ------------------------------------------------------------------ */
/* GET /api/grio/profile/[profileId]                                    */
/* ------------------------------------------------------------------ */

export interface GrioProfileSignals {
  familyKnown: boolean;
  lifestyleKnown: boolean;
  kundliAvailable: boolean;
  /** How many comparisons came out "match". */
  overlapCount: number;
  /** Profile sections with nothing visible at this viewer's level. */
  missingCount: number;
  preferenceState: "NOT_PROVIDED" | "PARTIAL" | "COMPARABLE";
}

export interface GrioProfileBriefResponse {
  ok: boolean;
  message?: string;
  header?: GrioProfileHeader;
  suggestions?: GrioPromptSuggestion[];
  signals?: GrioProfileSignals;
}

/* ------------------------------------------------------------------ */
/* Dev-only diagnostics                                                 */
/* ------------------------------------------------------------------ */

/**
 * Everything a developer needs to say which layer failed — never sent in
 * production (the route strips it), never rendered to a member.
 */
export interface GrioDebugTrace {
  requestId: string;
  path: "profile-intent" | "concierge" | "quick-answer";
  intent: GrioIntent | null;
  intentConfidence: number | null;
  intentMatched: string[];
  profileId: string | null;
  profileContextLoaded: boolean;
  userContextLoaded: boolean;
  /** The prompt's parts and their sizes — what the context budget actually sent. */
  contextBlocks: { name: string; chars: number }[];
  approxInputTokens: number;
  /** The code tools this turn ran ("getCurrentProfile", "compareProfileWithUser", …). */
  tools: string[];
  /** Stage timings: intent → context → tools → model → parse. */
  stages: { name: string; ms: number }[];
  answeredBy: GrioAnsweredBy | "ai-concierge";
  /** The router's trace, when a model was called. */
  model: {
    primary: string;
    answeredBy: string | null;
    fallbackUsed: boolean;
    finalOutcome: string;
    totalLatencyMs: number;
    attempts: { model: string; role: string; outcome: string; httpStatus: number | null; latencyMs: number; reason: string | null }[];
    skipped: { model: string; reason: string }[];
  } | null;
  errorCategory: string | null;
  totalLatencyMs: number;
}
