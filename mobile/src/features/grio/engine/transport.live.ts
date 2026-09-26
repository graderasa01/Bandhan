import { ApiError, api } from "~/services/api/client";
import type { GrioActionCall } from "~/shared/grio/grio";
import type { DiscoverFilters } from "~/types/api";
import {
  AskQuestionSchema,
  BriefingSchema,
  CallResultSchema,
  CardsSchema,
  MatchesSchema,
  MemorySchema,
  PeopleSchema,
  ProfileBriefSchema,
  WalkthroughSchema,
  parseConciergeResponse,
} from "./schemas";
import { GrioOfflineError, type ConciergeTurnResult, type GrioCallResult, type GrioTransport } from "./types";

/**
 * Grio's doors on the BandhanTak server — every one an existing route with its
 * own session, plan and ownership checks (the bearer session reaches all of
 * them through `requireUser()`):
 *
 *   POST /api/concierge               a turn (the brain)
 *   GET  /api/concierge/briefing      the opening line + roster (no model)
 *   GET  /api/concierge/walkthrough   today's reel, in order
 *   GET  /api/concierge/people        "Kis par?" — shortlist, interests received, same vote
 *   GET  /api/concierge/matches       "Kise bhejein?" — chat-open matches only
 *   POST /api/grio/cards              faces for ids code already holds
 *   GET  /api/grio/profile/:id        the pinned header + that profile's chips
 *   POST/DELETE /api/grio/memory      remember / forget
 *   POST /api/profile/intelligence    a confirmed LEARN answer
 *   POST /api/discover/intent|search  a FIND, through Search's own engine
 *   and each catalog row's own endpoint (`GRIO_ACTIONS[key].request/endpoint`)
 *
 * No network → `GrioOfflineError`; a server that answered "no" → its own words.
 */

/**
 * How long a turn may take. The server's model router walks a fallback chain
 * when a provider is overloaded, and a busy afternoon measured turns past a
 * minute — so the ceiling is generous, and running into it is said as what it
 * is (slow), not as "check your internet".
 */
const TURN_TIMEOUT_MS = 100_000;
const SLOW_LINE = "Grio ko jawab dene me der lag rahi hai — thodi der baad dobara try karein.";

function offline(err: unknown): never {
  throw new GrioOfflineError(err instanceof ApiError ? err.message : undefined);
}

function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.isNetwork;
}

const EMPTY_TURN: Omit<ConciergeTurnResult, "ok" | "code" | "message"> = {
  reply: null,
  roster: null,
  intent: null,
  profileId: null,
  header: null,
  evidence: null,
  profileActions: [],
  followUps: [],
  answeredBy: null,
  sendTarget: null,
};

/** A refusal in the server's own words, or the client's plain fallback. */
function refusal(err: unknown): { ok: false; message: string | null; code: string | null } {
  if (err instanceof ApiError) return { ok: false, message: err.message, code: err.code };
  return { ok: false, message: null, code: null };
}

export const liveGrioTransport: GrioTransport = {
  async concierge(body) {
    // Our own clock, so a slow turn can be told apart from no network at all.
    const clock = new AbortController();
    const timer = setTimeout(() => clock.abort(), TURN_TIMEOUT_MS);
    try {
      const raw = await api<unknown>("/api/concierge", { body, timeoutMs: TURN_TIMEOUT_MS + 5_000, signal: clock.signal });
      return parseConciergeResponse(raw) ?? { ...EMPTY_TURN, ok: false, code: "invalid_response", message: "Grio ka jawab samajh nahi aaya." };
    } catch (err) {
      if (clock.signal.aborted) return { ...EMPTY_TURN, ok: false, code: "timeout", message: SLOW_LINE };
      if (isOffline(err)) offline(err);
      if (err instanceof ApiError) {
        const parsed = parseConciergeResponse(err.body);
        if (parsed) return { ...parsed, ok: false, message: parsed.message ?? err.message };
        return { ...EMPTY_TURN, ok: false, code: err.code, message: err.message };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  async briefing() {
    try {
      const parsed = BriefingSchema.safeParse(await api<unknown>("/api/concierge/briefing"));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // a greeting that could not be built is nothing to report
    }
  },

  async walkthrough() {
    try {
      const parsed = WalkthroughSchema.safeParse(await api<unknown>("/api/concierge/walkthrough", { timeoutMs: 45_000 }));
      return parsed.success ? parsed.data.steps : [];
    } catch (err) {
      if (isOffline(err)) offline(err);
      return [];
    }
  },

  async people() {
    try {
      const parsed = PeopleSchema.safeParse(await api<unknown>("/api/concierge/people"));
      return parsed.success ? (parsed.data.people ?? []) : [];
    } catch (err) {
      if (isOffline(err)) offline(err);
      return [];
    }
  },

  async matches() {
    try {
      const parsed = MatchesSchema.safeParse(await api<unknown>("/api/concierge/matches"));
      return parsed.success ? (parsed.data.matches ?? []) : [];
    } catch (err) {
      if (isOffline(err)) offline(err);
      return [];
    }
  },

  async cards(profileIds) {
    if (profileIds.length === 0) return [];
    try {
      const parsed = CardsSchema.safeParse(await api<unknown>("/api/grio/cards", { body: { profileIds: profileIds.slice(0, 12) } }));
      return parsed.success ? (parsed.data.cards ?? []) : [];
    } catch (err) {
      if (isOffline(err)) offline(err);
      throw err;
    }
  },

  async profileBrief(profileId) {
    try {
      const parsed = ProfileBriefSchema.safeParse(await api<unknown>(`/api/grio/profile/${encodeURIComponent(profileId)}`));
      return parsed.success ? parsed.data : { ok: false };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ok: false, message: err instanceof ApiError ? err.message : undefined };
    }
  },

  async run(call: GrioActionCall): Promise<GrioCallResult> {
    try {
      const raw = await api<unknown>(call.url, { method: call.method, body: call.body ?? {} });
      const res = CallResultSchema.parse(raw);
      return {
        ok: res.ok !== false,
        message: res.ok === false ? (res.message ?? null) : null,
        matched: res.matched === true,
        matchId: res.matchId ?? null,
      };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ...refusal(err), matched: false, matchId: null };
    }
  },

  async sendMessage(matchId, text) {
    try {
      await api(`/api/messages/${encodeURIComponent(matchId)}`, { body: { body: text } });
      return { ok: true, message: null, matched: false, matchId };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ...refusal(err), matched: false, matchId };
    }
  },

  async askQuestion(profileId, text) {
    try {
      const parsed = AskQuestionSchema.safeParse(await api<unknown>("/api/profile-questions", { body: { profileId, questionText: text } }));
      if (!parsed.success) return { ok: false, alreadyAsked: false, heldForReview: false, message: null };
      return {
        ok: parsed.data.ok,
        alreadyAsked: parsed.data.alreadyAsked === true,
        heldForReview: parsed.data.heldForReview === true,
        message: parsed.data.message ?? null,
      };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ok: false, alreadyAsked: false, heldForReview: false, message: err instanceof ApiError ? err.message : null };
    }
  },

  async remember(fact) {
    try {
      const parsed = MemorySchema.safeParse(await api<unknown>("/api/grio/memory", { body: { fact } }));
      if (!parsed.success || !parsed.data.ok) return { ok: false, itemId: null, message: null };
      // The newest row with these words is the one just saved.
      const item = [...(parsed.data.items ?? [])].reverse().find((i) => i.body === fact);
      return { ok: true, itemId: item?.id ?? null, message: null };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ok: false, itemId: null, message: err instanceof ApiError ? err.message : null };
    }
  },

  async forget(itemId) {
    try {
      await api(`/api/grio/memory?id=${encodeURIComponent(itemId)}`, { method: "DELETE" });
      return true;
    } catch (err) {
      if (isOffline(err)) offline(err);
      return false;
    }
  },

  async learn(key, value) {
    try {
      await api("/api/profile/intelligence", { body: { key, value } });
      return { ok: true, message: null };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ok: false, message: err instanceof ApiError ? err.message : null };
    }
  },

  async discoverIntent(query) {
    try {
      const res = await api<{
        ok?: boolean;
        summary?: string;
        filters?: DiscoverFilters;
        unresolvedRequests?: string[];
        behaviorMode?: string;
        message?: string;
      }>("/api/discover/intent", { body: { query, allowClarification: false }, timeoutMs: 45_000 });
      if (!res || res.ok === false || !res.filters) {
        return { ok: false, message: res?.message ?? null, summary: "", filters: {}, unresolved: [], behaviorMode: null };
      }
      return {
        ok: true,
        message: null,
        summary: res.summary ?? query,
        filters: res.filters,
        unresolved: Array.isArray(res.unresolvedRequests) ? res.unresolvedRequests : [],
        behaviorMode: typeof res.behaviorMode === "string" ? res.behaviorMode : null,
      };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ok: false, message: err instanceof ApiError ? err.message : null, summary: "", filters: {}, unresolved: [], behaviorMode: null };
    }
  },

  async discoverSearch(filters, behaviorMode) {
    try {
      const res = await api<{ ok?: boolean; results?: Array<{ profileId?: unknown }>; countLabel?: string; message?: string }>(
        "/api/discover/search",
        {
          // Flexible, as the web's Grio search runs it: a spoken search is a
          // loose one, and the engine's own relaxation beats an empty row.
          body: { filters, mode: "flexible", pageSize: 6, ...(behaviorMode ? { behaviorMode } : {}) },
          timeoutMs: 45_000,
        },
      );
      if (!res || res.ok === false) return { ok: false, message: res?.message ?? null, profileIds: [], countLabel: "" };
      const profileIds = (res.results ?? [])
        .map((r) => r.profileId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      return { ok: true, message: null, profileIds, countLabel: res.countLabel ?? `${profileIds.length} profiles` };
    } catch (err) {
      if (isOffline(err)) offline(err);
      return { ok: false, message: err instanceof ApiError ? err.message : null, profileIds: [], countLabel: "" };
    }
  },
};
