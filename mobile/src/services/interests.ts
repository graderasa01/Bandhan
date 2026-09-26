import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { db, delay, makeMatch } from "~/mocks/mockDb";
import type { InterestsResponse, SendInterestResponse } from "~/types/api";

/**
 * Interests and matches:
 *
 *   GET    /api/mobile/interests   received + sent + matches (the web's own view models)
 *   POST   /api/interests          send from a profile (`sendInterest`, quota + mutual match)
 *   PATCH  /api/interests/:id      accept (creates the match) / decline — recipient only
 *   DELETE /api/interests/:id      withdraw a still-pending one — sender only, 24h window
 */
export interface InterestsService {
  list(): Promise<InterestsResponse>;
  send(profileId: string): Promise<SendInterestResponse>;
  respond(interestId: string, status: "ACCEPTED" | "DECLINED"): Promise<{ matchId: string | null }>;
  withdraw(interestId: string): Promise<void>;
}

const live: InterestsService = {
  list: () => api<InterestsResponse>("/api/mobile/interests"),
  send: (profileId) => api<SendInterestResponse>("/api/interests", { body: { profileId } }),
  async respond(interestId, status) {
    const res = await api<{ ok: boolean; matchId: string | null }>(`/api/interests/${encodeURIComponent(interestId)}`, {
      method: "PATCH",
      body: { status },
    });
    return { matchId: res.matchId };
  },
  async withdraw(interestId) {
    await api(`/api/interests/${encodeURIComponent(interestId)}`, { method: "DELETE" });
  },
};

const mock: InterestsService = {
  async list() {
    await delay(350);
    return {
      ok: true,
      interests: {
        received: db.received.filter((i) => i.status !== "WITHDRAWN"),
        sent: db.sent,
        emptyReceived: { title: "Abhi koi interest nahi aaya hai.", description: "Profile complete karein taaki matches aapko find kar sakein." },
        emptySent: { title: "Aapne abhi tak koi interest nahi bheja.", description: "Reel ya Search se pasand ke rishte ko interest bhejiye." },
      },
      matches: {
        matches: db.matches,
        emptyState: { title: "Abhi koi match nahi mila.", description: "Rishta Reel par swipe karke matches banayein." },
      },
    };
  },
  async send(profileId) {
    await delay(350);
    const card = db.cards.find((c) => c.id === profileId);
    if (!card) throw new ApiError(404, "NOT_FOUND", "Profile nahi mila.");
    if (card.interestSent) throw new ApiError(403, "ALREADY_SENT", "Interest pehle hi bheja ja chuka hai.");
    card.interestSent = true;
    const received = db.received.find((i) => i.profileId === profileId);
    if (received) {
      received.status = "ACCEPTED";
      return { ok: true, matched: true, matchId: makeMatch(profileId) };
    }
    db.sent.unshift({
      id: `i_${profileId}_${Date.now()}`,
      fromUser: { displayName: "Aap" },
      toUser: { displayName: card.displayName, age: card.age ?? undefined, city: card.city ?? undefined },
      status: "SENT",
      sentDate: new Date().toISOString().slice(0, 10),
      profileId,
      canWithdraw: true,
    });
    return { ok: true, matched: false, matchId: null };
  },
  async respond(interestId, status) {
    await delay(350);
    const interest = db.received.find((i) => i.id === interestId);
    if (!interest) throw new ApiError(404, "NOT_FOUND", "Interest nahi mila.");
    interest.status = status;
    if (status === "ACCEPTED" && interest.profileId) return { matchId: makeMatch(interest.profileId) };
    return { matchId: null };
  },
  async withdraw(interestId) {
    await delay(300);
    const interest = db.sent.find((i) => i.id === interestId);
    if (!interest) throw new ApiError(404, "NOT_FOUND", "Interest nahi mila.");
    interest.status = "WITHDRAWN";
    interest.canWithdraw = false;
    const card = db.cards.find((c) => c.id === interest.profileId);
    if (card) card.interestSent = false;
  },
};

export const interestsService: InterestsService = IS_MOCK ? mock : live;
