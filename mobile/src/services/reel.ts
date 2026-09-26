import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { FEED_QUESTIONS, FIELD_BY_KEY, isAnswered, questionFor } from "~/catalog";
import { computeMyProfile, db, delay, makeMatch } from "~/mocks/mockDb";
import type {
  ReelCard,
  ReelIcebreakerResponse,
  ReelLane,
  ReelLaneCounts,
  ReelLibraryPage,
  ReelMoreResponse,
  ReelRefineQuestion,
  ReelSwipeDirection,
  ReelViewModel,
  SwipeResponse,
} from "~/types/api";

/**
 * Discovery — the web's reel pipeline, never a second ranking:
 *
 *   GET  /api/mobile/reel          today's deck (`getReelData`, same as /user/reel)
 *   POST /api/reel/more            the next batch (D-91), with the seen cursor (D-92)
 *   POST /api/reel/swipe           RIGHT = interest (quota-checked), DOWN = shortlist, LEFT = skip
 *   PUT/DELETE /api/like/:id       private like (D-91b)
 *   PUT/DELETE /api/shortlist/:id  shortlist toggle
 *   POST /api/reel/library         Meri List lanes
 *   POST /api/reel/icebreaker      a first line to send
 */
export interface SwipeInput {
  profileId: string;
  direction: ReelSwipeDirection;
  reelId?: string;
  decisionMs?: number;
  wasButton?: boolean;
}

export interface ReelService {
  getReel(): Promise<ReelViewModel>;
  more(seenCursor: string | null): Promise<ReelMoreResponse>;
  swipe(input: SwipeInput): Promise<SwipeResponse>;
  setLiked(profileId: string, liked: boolean): Promise<void>;
  setShortlisted(profileId: string, on: boolean): Promise<void>;
  library(lane: ReelLane, cursor: string | null): Promise<ReelLibraryPage>;
  /** Meri List's counts, fresh (`getLaneCounts`). */
  laneCounts(): Promise<ReelLaneCounts>;
  /** An opening line to edit — nothing is sent by asking. */
  icebreaker(profileId: string): Promise<ReelIcebreakerResponse>;
  /** Attaches a note to the interest already sent to this person. */
  attachNote(profileId: string, message: string): Promise<void>;
}

const live: ReelService = {
  async getReel() {
    const res = await api<{ ok: boolean; reel: ReelViewModel }>("/api/mobile/reel");
    return res.reel;
  },
  more: (seenCursor) => api<ReelMoreResponse>("/api/reel/more", { body: { seenCursor } }),
  swipe: (input) => api<SwipeResponse>("/api/reel/swipe", { body: input }),
  async setLiked(profileId, liked) {
    await api(`/api/like/${encodeURIComponent(profileId)}`, { method: liked ? "PUT" : "DELETE" });
  },
  async setShortlisted(profileId, on) {
    await api(`/api/shortlist/${encodeURIComponent(profileId)}`, { method: on ? "PUT" : "DELETE" });
  },
  library: (lane, cursor) => api<ReelLibraryPage>("/api/reel/library", { body: { lane, cursor } }),
  async laneCounts() {
    const res = await api<{ ok: boolean; counts: ReelLaneCounts }>("/api/mobile/reel/lanes");
    return res.counts;
  },
  async icebreaker(profileId) {
    try {
      return await api<ReelIcebreakerResponse>("/api/reel/icebreaker", { body: { profileId }, timeoutMs: 45_000 });
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "ok" in err.body) return err.body as ReelIcebreakerResponse;
      throw err;
    }
  },
  async attachNote(profileId, message) {
    await api<ReelIcebreakerResponse>("/api/reel/icebreaker", { method: "PATCH", body: { profileId, message } });
  },
};

/* ------------------------------------------------------------------ */
/* Mock                                                                */
/* ------------------------------------------------------------------ */

function mockFeedQuestions(): ReelRefineQuestion[] {
  const values = db.values;
  const forSelf = db.fillingFor === "self";
  const out: ReelRefineQuestion[] = [];
  for (const key of FEED_QUESTIONS.fields) {
    const def = FIELD_BY_KEY[key];
    if (!def || def.type !== "select" || !def.options || def.options.length > FEED_QUESTIONS.maxOptions) continue;
    if (FEED_QUESTIONS.never.includes(key) || isAnswered(def, values)) continue;
    out.push({ key, question: questionFor(def, forSelf), options: [...def.options], multi: false });
  }
  return out;
}

function card(profileId: string): ReelCard {
  const c = db.cards.find((x) => x.id === profileId);
  if (!c) throw new ApiError(404, "NOT_FOUND", "Profile nahi mila.");
  return c;
}

const mock: ReelService = {
  async getReel() {
    await delay(450);
    const me = computeMyProfile();
    const hasPhoto = db.photos.length > 0;
    return {
      reelId: "reel_mock",
      reelDate: new Date().toISOString().slice(0, 10),
      cards: db.cards.map((c) => ({
        ...c,
        // The D-90 gate: members who show no photo of their own see none.
        photoUnlocked: c.matchId ? true : c.photoLock === "match_only" ? false : hasPhoto || c.photoLock === "open",
      })),
      seenCursor: null,
      viewer: {
        name: me.values.fullName ?? "Aap",
        photoUrl: db.photos.find((p) => p.isPrimary)?.fileUrl ?? null,
        needsOwnPhoto: !hasPhoto,
        photoInReview: false,
        canPhotoEnhance: true,
        canPhotoUltraEnhance: false,
        city: me.values.currentCity ?? null,
      },
      laneCounts: mockLaneCounts(),
      refineQuestions: [],
      preferenceNotice: me.values.partnerAgeRange
        ? null
        : {
            state: "NOT_PROVIDED",
            title: "Aapki pasand abhi pata nahi",
            body: "Partner ki umar aur sheher bata dijiye — reel usi hisaab se chunegi.",
            ctaLabel: "Add Preferences",
            ctaHref: "/profile/build?mode=manual&fields=partnerAgeRange,partnerCityPreference",
          },
      todayDecisions: { seen: 0, sent: db.sent.length, shortlisted: db.cards.filter((c) => c.shortlisted).length },
      emptyState: null,
      unreadMessages: Object.values(db.threads).flat().filter((m) => m.senderId !== "u_me" && !m.readAt).length,
      profileGaps: me.missingFields,
      feedQuestions: mockFeedQuestions(),
      voiceEnabled: false,
      askBridgeEnabled: true,
      voiceQuest: null,
    };
  },
  async more() {
    await delay(500);
    return { ok: true, cards: [], exhausted: true, seenCursor: null };
  },
  async swipe({ profileId, direction }) {
    await delay(250);
    const c = card(profileId);
    c.seenBefore = true;
    if (direction === "RIGHT") {
      c.interestSent = true;
      c.lastDecision = "RIGHT";
      const received = db.received.find((i) => i.profileId === profileId);
      if (received) {
        // They had already sent one — this interest makes it mutual.
        received.status = "ACCEPTED";
        const matchId = makeMatch(profileId);
        return { ok: true, matched: true, matchId };
      }
      db.sent.unshift({
        id: `i_${profileId}_${Date.now()}`,
        fromUser: { displayName: "Aap" },
        toUser: { displayName: c.displayName, age: c.age ?? undefined, city: c.city ?? undefined },
        status: "SENT",
        sentDate: new Date().toISOString().slice(0, 10),
        profileId,
        canWithdraw: true,
      });
      return { ok: true, matched: false, matchId: null };
    }
    if (direction === "DOWN") {
      c.shortlisted = true;
      c.lastDecision = "DOWN";
    }
    if (direction === "LEFT") c.lastDecision = "LEFT";
    return { ok: true, matched: false, matchId: null };
  },
  async setLiked(profileId, liked) {
    await delay(150);
    card(profileId).liked = liked;
  },
  async setShortlisted(profileId, on) {
    await delay(150);
    card(profileId).shortlisted = on;
  },
  async library(lane) {
    await delay(300);
    const pick = (c: ReelCard) =>
      lane === "LIKED" ? c.liked
      : lane === "SHORTLIST" ? c.shortlisted
      : lane === "INTEREST" ? c.interestSent
      : lane === "MESSAGE" ? Boolean(c.matchId && (db.threads[c.matchId]?.length ?? 0) > 0)
      : c.seenBefore && !c.liked && !c.shortlisted && !c.interestSent;
    const cards = db.cards.filter(pick).map((c) => ({
      ...c,
      laneNote:
        lane === "LIKED" ? "Aapne pasand kiya"
        : lane === "SHORTLIST" ? "Shortlist me"
        : lane === "INTEREST" ? "Interest sent"
        : lane === "MESSAGE" ? "Baat chal rahi hai"
        : "Viewed",
    }));
    return { ok: true, lane, cards, nextCursor: null, total: cards.length };
  },
  async laneCounts() {
    await delay(200);
    return mockLaneCounts();
  },
  async icebreaker(profileId) {
    await delay(700);
    return { ok: true, suggestion: card(profileId).whyThisMatch.starter ?? "Namaste! Aapki profile padhkar achha laga." };
  },
  async attachNote(profileId, message) {
    await delay(300);
    const sent = db.sent.find((i) => i.profileId === profileId);
    if (!sent) throw new ApiError(404, "bad_request", "Pehle interest bhejna zaroori hai.");
    sent.message = message;
  },
};

function mockLaneCounts(): ReelLaneCounts {
  return {
    VIEWED: db.cards.filter((c) => c.seenBefore && !c.liked && !c.shortlisted && !c.interestSent).length,
    LIKED: db.cards.filter((c) => c.liked).length,
    SHORTLIST: db.cards.filter((c) => c.shortlisted).length,
    INTEREST: db.sent.length,
    MESSAGE: Object.values(db.threads).filter((t) => t.length > 0).length,
  };
}

export const reelService: ReelService = IS_MOCK ? mock : live;
