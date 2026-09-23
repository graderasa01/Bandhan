import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { getOrCreateTodayReel, todayUTCDate } from "@/lib/services/match/reelGenerator";
import { openChatMatchIds } from "@/lib/services/chat/chatUnlockService";
import {
  WHO_MARKER_START,
  WHO_MARKER_END,
  SEND_MARKER_START,
  SEND_MARKER_END,
  SHOW_MARKER_START,
  SHOW_MAX_CARDS,
  FIND_MARKER_START,
  type ConciergeRosterEntry,
} from "@/lib/contracts/concierge";
import { ACT_MARKER_START, ACT_MARKER_END, type GrioActionKey } from "@/lib/contracts/grio";

/**
 * The people this conversation can point at, numbered by code.
 *
 * ## The problem this solves
 *
 * Until now Grio could not answer "sabse zyada matching rishtey ke baare me
 * batao". It had no names at all (`context.ts` hands it three numbers), so the
 * best it could manage was to offer a button that opened a picker — and a user
 * talking hands-free cannot tap a picker. The feature was refusing the most
 * natural thing anyone says out loud.
 *
 * ## Why handing over names does not reopen the ranking hazard
 *
 * `context.ts` states the boundary: *"Only the user's own state. Never another
 * person's attributes."* — because a Grio that could see candidates' attributes
 * would be one prompt away from doing L2's job in prose.
 *
 * This file hands over **names and an ordinal, and nothing else**. No age, no
 * city, no work, no score, no photo. That is the same line
 * `ConciergeWalkthroughStep` already draws and for the same stated reason, and
 * it is what makes the list unrankable: there is literally nothing in it to rank
 * *on*. The order is not the model's either — it comes from
 * `DailyReelProfile.rank`, decided by `scoreCandidates` when the reel was
 * generated. Grio reads out a sequence code fixed; it cannot reorder it and has
 * no basis on which to try.
 *
 * The division of labour is unchanged from Rishta Lens: **code ranks, Grio
 * points.** What is new is only that pointing no longer requires a finger.
 *
 * ## Where the scores come from
 *
 * Nothing here re-runs the scoring pipeline. Today's reel already persists
 * `rank` and `finalScore` per candidate. For shortlisted people and inbound
 * interests, the score is looked up from whatever reel row that pair already
 * has — one indexed query, no profile loads. Someone with no such row is marked
 * unmeasured rather than given an invented number, which is rare in practice for
 * exactly the reason it sounds: you can only shortlist somebody you were shown.
 *
 * That is a deliberate refusal to compute fresh scores here. Loading fifty full
 * profiles and re-scoring them on every chat turn would put L2's whole cost on a
 * conversational read path — and would let Grio's answer disagree with the reel
 * the user is looking at, which is worse than saying "abhi naapa nahi gaya".
 */

/**
 * Why somebody is on the list. A person can be on it for several reasons at once.
 *
 * `match` (2026-09-23): people the user already matched with, so "Priya ko
 * message bhej do" can resolve to a thread by voice instead of opening a picker
 * a hands-free user cannot tap. `shown`: people whose cards are on the chat
 * screen right now (a search result, a `<<<SHOW:>>>`), so "pehli wali ko
 * interest bhejo" means the card the user is looking at.
 */
export type GrioRosterSource = "reel" | "shortlist" | "interest_received" | "match" | "shown";

export interface GrioRosterEntry {
  /** 1-based, and the only handle the model is ever given for this person. */
  n: number;
  profileId: string;
  name: string;
  sources: GrioRosterSource[];
  /** Today's reel rank, when they are in it. Null otherwise. */
  reelRank: number | null;
  /** True when this reel card has already been swiped today. */
  seenToday: boolean;
  /** Code's own match score for this pair, when one has ever been computed. */
  score: number | null;
  /** Their match with the user, when there is one — never given to the model. */
  matchId: string | null;
  /** Whether that match's chat is open (unlock, a Pass, or a Circle window). */
  chatOpen: boolean;
}

export interface GrioRoster {
  entries: GrioRosterEntry[];
  /** How many of today's reel cards are still unswiped. */
  reelLeft: number;
  reelTotal: number;
}

const SHORTLIST_LIMIT = 25;
const INTEREST_LIMIT = 25;
/** Most recent first. Each one costs an entitlement read for the chat-open flag. */
const MATCH_LIMIT = 15;
/** A search page. Matches `GRIO_CARDS_MAX`, the most the chat can be showing. */
const SHOWN_LIMIT = 12;

/**
 * `generateReel` splits the two callers apart, and the split is the difference
 * between a fast chat turn and a correct one.
 *
 * The opening briefing passes `true`: asking Grio what today looks like *is*
 * asking for today's reel, the same argument `/api/concierge/walkthrough` makes
 * for its own `getOrCreateTodayReel`. Nothing is consumed — a generated reel is
 * the same reel `/user/reel` will show.
 *
 * Every chat turn passes `false`. Running the generator behind an ordinary
 * sentence would put the whole L0-L2 pipeline on the latency path of a reply,
 * and by then the briefing has almost always already built it.
 */
export async function buildGrioRoster(
  userId: string,
  opts: {
    generateReel?: boolean;
    /**
     * Profile ids whose cards the chat is showing — from the browser, so each
     * is re-checked below exactly like every other row (visible, not blocked,
     * not the user). Only a name ever reaches the model, which is also all the
     * card on screen already told the user.
     */
    shownProfileIds?: string[];
  } = {},
): Promise<GrioRoster> {
  const visible = { deletedAt: null, isVisible: true, profileStatus: { not: "DRAFT" as const } };

  const reel = opts.generateReel
    ? await getOrCreateTodayReel(userId).catch(() => null)
    : await prisma.dailyReel.findUnique({
        where: { userId_reelDate: { userId, reelDate: todayUTCDate() } },
        include: {
          candidates: {
            orderBy: { rank: "asc" },
            select: {
              rank: true,
              finalScore: true,
              profile: { select: { id: true, userId: true, displayName: true } },
            },
          },
        },
      });

  const shownIds = [...new Set(opts.shownProfileIds ?? [])].slice(0, SHOWN_LIMIT);

  const [swipes, blockedUserIds, shortlisted, received, matches, shown] = await Promise.all([
    reel
      ? prisma.swipeAction.findMany({
          where: { actorUserId: userId, dailyReelId: reel.id },
          select: { targetProfileId: true },
        })
      : Promise.resolve([]),
    getBlockedUserIds(userId),
    prisma.shortlist.findMany({
      where: { userId, targetProfile: visible },
      orderBy: { createdAt: "desc" },
      take: SHORTLIST_LIMIT,
      select: { targetProfile: { select: { id: true, userId: true, displayName: true } } },
    }),
    prisma.interest.findMany({
      where: { toUserId: userId, status: "PENDING", fromUser: { profile: visible } },
      orderBy: { createdAt: "asc" },
      take: INTEREST_LIMIT,
      select: { fromUser: { select: { profile: { select: { id: true, userId: true, displayName: true } } } } },
    }),
    prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: "desc" },
      take: MATCH_LIMIT,
      select: {
        id: true,
        userAId: true,
        userBId: true,
        userA: { select: { profile: { select: { id: true, userId: true, displayName: true, deletedAt: true } } } },
        userB: { select: { profile: { select: { id: true, userId: true, displayName: true, deletedAt: true } } } },
      },
    }),
    shownIds.length
      ? prisma.profile.findMany({
          where: { id: { in: shownIds }, userId: { not: userId }, ...visible },
          select: { id: true, userId: true, displayName: true },
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set(swipes.map((s) => s.targetProfileId));
  // Re-filtered on read because the reel is persisted once a day and a block
  // made at 4pm has to apply to a list built at 9am — `reelData.ts` and the
  // walkthrough endpoint make the same pass for the same reason.
  const blocked = new Set(blockedUserIds);

  type Draft = Omit<GrioRosterEntry, "n">;
  const byProfileId = new Map<string, Draft>();

  function add(
    p: { id: string; userId: string; displayName: string | null },
    source: GrioRosterSource,
    extra: { reelRank?: number; score?: number; matchId?: string } = {},
  ) {
    if (blocked.has(p.userId)) return;
    const existing = byProfileId.get(p.id);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      existing.reelRank ??= extra.reelRank ?? null;
      existing.score ??= extra.score ?? null;
      existing.matchId ??= extra.matchId ?? null;
      return;
    }
    byProfileId.set(p.id, {
      profileId: p.id,
      name: p.displayName?.trim() || "Profile",
      sources: [source],
      reelRank: extra.reelRank ?? null,
      seenToday: seen.has(p.id),
      score: extra.score ?? null,
      matchId: extra.matchId ?? null,
      chatOpen: false,
    });
  }

  const reelCandidates = reel?.candidates ?? [];
  for (const c of reelCandidates) {
    add(c.profile, "reel", { reelRank: c.rank, score: c.finalScore });
  }
  for (const row of received) {
    if (row.fromUser.profile) add(row.fromUser.profile, "interest_received");
  }
  for (const row of shortlisted) {
    add(row.targetProfile, "shortlist");
  }
  for (const m of matches) {
    const other = m.userAId === userId ? m.userB.profile : m.userA.profile;
    if (other && !other.deletedAt) add(other, "match", { matchId: m.id });
  }
  for (const p of shown) {
    add(p, "shown");
  }

  // Asked once for every match on the list, with the same rule the chat
  // itself uses — so Grio can say "pehle chat kholni hogi" instead of drafting
  // a message the send would refuse.
  const openChats = await openChatMatchIds(matches);
  for (const entry of byProfileId.values()) {
    if (entry.matchId) entry.chatOpen = openChats.has(entry.matchId);
  }

  await fillMissingScores(userId, byProfileId);

  /*
   * One ordering rule, applied to everybody: today's reel first in its own
   * persisted rank, then everyone else by whatever score the pipeline has
   * already recorded for them.
   *
   * Today's reel outranks a higher-scoring shortlist entry deliberately. Those
   * two numbers were computed on different days against different signal sets,
   * so interleaving them would silently assert a comparison the pipeline never
   * made — and "aaj ka #1" is the thing the user is actually looking at on the
   * reel screen. Unmeasured people sort last rather than as zero: no signal is
   * not a low score.
   */
  const entries: GrioRosterEntry[] = [...byProfileId.values()]
    .sort((a, b) => {
      if (a.reelRank !== null && b.reelRank !== null) return a.reelRank - b.reelRank;
      if (a.reelRank !== null) return -1;
      if (b.reelRank !== null) return 1;
      if (a.score !== null && b.score !== null) return b.score - a.score;
      if (a.score !== null) return -1;
      if (b.score !== null) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((draft, i) => ({ ...draft, n: i + 1 }));

  const reelTotal = reelCandidates.filter((c) => !blocked.has(c.profile.userId)).length;
  const reelLeft = reelCandidates.filter(
    (c) => !blocked.has(c.profile.userId) && !seen.has(c.profile.id),
  ).length;

  return { entries, reelTotal, reelLeft };
}

/**
 * Borrows each unscored pair's most recent reel row, if it has one.
 *
 * The `orderBy` is what makes "most recent" true — a person shown on three
 * different days has three rows, and the freshest is the only one whose signals
 * resemble today's.
 */
async function fillMissingScores(
  userId: string,
  byProfileId: Map<string, Omit<GrioRosterEntry, "n">>,
): Promise<void> {
  const needing = [...byProfileId.values()].filter((e) => e.score === null).map((e) => e.profileId);
  if (needing.length === 0) return;

  const rows = await prisma.dailyReelProfile
    .findMany({
      where: { profileId: { in: needing }, dailyReel: { userId } },
      orderBy: { dailyReel: { reelDate: "desc" } },
      select: { profileId: true, finalScore: true },
    })
    .catch(() => []);

  for (const row of rows) {
    const entry = byProfileId.get(row.profileId);
    if (entry && entry.score === null) entry.score = row.finalScore;
  }
}

/**
 * The roster as the model reads it.
 *
 * Every line is a name, an ordinal, and why they are on the list. The score is
 * rendered as a plain number with no interpretation attached, because the moment
 * this block explained what a score *means* it would be teaching the model to
 * argue about ranking rather than to read it out.
 *
 * Null when there is nobody — an empty heading invites the model to fill it.
 */
export function formatGrioRoster(roster: GrioRoster): string | null {
  if (roster.entries.length === 0) return null;

  const lines = roster.entries.map((e) => {
    const tags: string[] = [];
    if (e.sources.includes("reel")) {
      tags.push(e.seenToday ? "aaj ke reel me (dekh liya)" : "aaj ke reel me (abhi baaki hai)");
    }
    if (e.sources.includes("interest_received")) tags.push("inhone aapke user ko interest bheja hai");
    if (e.sources.includes("shortlist")) tags.push("user ki shortlist me");
    if (e.matchId) {
      tags.push(
        e.chatOpen
          ? "MATCH ho chuka hai, chat khuli hai (message bheja ja sakta hai)"
          : "MATCH ho chuka hai, par chat abhi band hai (Chat Unlock ₹99 ya Rishta Pass se khulegi)",
      );
    }
    if (e.sources.includes("shown")) tags.push("abhi chat screen par inka card dikh raha hai");
    const score = e.score !== null ? `, match score ${Math.round(e.score)}/100` : ", match score abhi naapa nahi gaya";
    return `#${e.n} ${e.name} — ${tags.join(", ")}${score}`;
  });

  return `AAJ KE RISHTEY AUR LOG (ye poori list aur iska kram CODE ne tay kiya hai):
${lines.join("\n")}

Is list ke niyam:
- Kram code ka hai, aapka nahi. #1 sabse upar hai kyunki matching ke hisaab se wo sabse upar aaya — aap ise badal nahi sakte, aur apna koi alag ranking nahi bana sakte.
- In logon ke baare me aapko naam ke alawa KUCH BHI nahi pata — na umar, na sheher, na kaam, na parivaar. Jab tak app kisi ek par focus na kar de, tab tak unke baare me ek shabd bhi apne se mat likhiye.
- "Sabse zyada matching kaun", "sabse upar kaun" — ye poochha jaye to seedha #1 bata dijiye, ye code ka hisaab hai, aapki raay nahi. Par "in dono me behtar kaun hai" jaisa faisla phir bhi nahi dena.
- Jinka score "naapa nahi gaya" likha hai, unke liye koi andaaza mat lagaiye — saaf keh dijiye ki abhi naapa nahi gaya.`;
}

/**
 * The roster as the *client* receives it: ordinal, id, name, and the match id
 * a `<<<SEND>>>` needs. Scores and source tags stay on the server — they were
 * for the model's reading, and shipping them would put an unrendered ranking in
 * the browser. One function so the three routes that return a roster cannot
 * drift into three shapes.
 */
export function rosterForClient(roster: GrioRoster | null): ConciergeRosterEntry[] {
  return (roster?.entries ?? []).map((e) => ({ n: e.n, profileId: e.profileId, name: e.name, matchId: e.matchId }));
}

/**
 * Showing people, searching, and messaging a match — the three things a member
 * says out loud that the roster alone could not answer (2026-09-23).
 *
 * All three keep the roster's one rule: the model points with a number or
 * restates a request; code fetches, checks and shows. Static, so it rides in
 * the cached `system` prefix.
 */
/** Typed so a renamed key fails the build instead of teaching the model a dead button. */
const OPEN_MATCHES_KEY: GrioActionKey = "openMatches";

export const GRIO_PEOPLE_INSTRUCTIONS = `

LOGON KO SCREEN PAR DIKHANA — ${SHOW_MARKER_START}1,2,3${WHO_MARKER_END}
- Jab user kahe "dikhao" — "aaj ke rishtey dikhao", "mere matches dikhao", "shortlist wale dikhao", "Priya ki profile dikhao" — to upar wali list me se unke number ${SHOW_MARKER_START}n,n,n${WHO_MARKER_END} me likh dijiye. App unke photo wale card isi chat me dikha dega, har card par Interest/Shortlist/Message ke button ke saath.
- Zyada se zyada ${SHOW_MAX_CARDS} number. Card kis kram me dikhenge ye app list ke hisaab se khud rakhta hai.
- Card khud naam, umar, sheher dikhata hai — aap kisi ke baare me wo baat mat likhiye jo aapko pata nahi. Ek chhoti line kaafi hai: "Ye rahe aapke matches."
- Kisi EK ke baare me baat karni ho to ${WHO_MARKER_START}n${WHO_MARKER_END}; sirf dikhana ho to ${SHOW_MARKER_START}...${WHO_MARKER_END}.

SEARCH — ${FIND_MARKER_START}...${WHO_MARKER_END}
- Jab user koi aisa insaan dhoondhna chahe jo upar ki list me nahi — "Jaipur ki doctor dikhao", "26-30 saal ke engineer", "Pune me koi CA hai kya" — to unki maang chhote shabdon me ${FIND_MARKER_START}Jaipur, doctor, 26-30 saal${WHO_MARKER_END} me likh dijiye. App wahi search chalata hai jo Advanced Discovery page chalata hai, aur nateeje card me dikhata hai.
- Marker ke andar sirf user ki maang — apni taraf se koi shart mat jodiye.
- Search me kaun aaya ye aapko nahi dikhega; app sirf ek line likhega ki kitne mile. Kisi ke baare me andaaza mat lagaiye. Uske baad user kisi card ki baat kare ("pehli wali ko interest bhejo") to wo log agli baar upar ki list me "abhi chat screen par" ke saath honge — unka number wahin se lijiye.
- Ek jawab me ek hi ${FIND_MARKER_START}...${WHO_MARKER_END}.

MATCH KO MESSAGE BHEJNA — sirf un logon ko jinke saath list me "MATCH ho chuka hai, chat khuli hai" likha hai:
- User kahe "Priya ko message bhejo ki kal shaam baat karte hain" — to ${WHO_MARKER_START}n${WHO_MARKER_END} likhiye aur uske baad wahi message ${SEND_MARKER_START}...${SEND_MARKER_END} ke beech. Message user ke apne shabdon ke kareeb rakhiye, apni taraf se nayi baat mat jodiye. App bhejne se pehle user ko dikhayega (ya bol kar poochhega) — aap "bhej diya" mat kahiye.
- Jinke saath "chat abhi band hai" likha hai unke liye message mat likhiye: bataiye ki pehle Chat Unlock (₹99) ya Rishta Pass se chat khulegi, aur ${ACT_MARKER_START}${OPEN_MATCHES_KEY}${ACT_MARKER_END} ka button dijiye.
- Jinka match hi nahi hua unhe message nahi ja sakta — unke liye interest, voice note ya ek sawaal hi raasta hai. Unke liye ${SEND_MARKER_START} kabhi mat likhiye.`;

export const GRIO_WHO_INSTRUCTIONS = `

KISI EK PAR FOCUS KARNA — jab user upar wali list me se kisi ek ki baat kare, to us insaan ka number ${WHO_MARKER_START}n${WHO_MARKER_END} ki tarah likh dijiye (jaise ${WHO_MARKER_START}1${WHO_MARKER_END}). App khud us profile par focus kar dega.
- Ye tab likhiye jab user kahe "sabse zyada matching wale ke baare me batao", "pehle wale ke baare me", "doosre ke baare me", "Priya ke baare me", ya us jaisa kuch bhi jisse ek hi insaan saaf samajh aata ho.
- Ek jawab me sirf ek ${WHO_MARKER_START}n${WHO_MARKER_END}. Do log ek saath focus nahi ho sakte.
- Ye koi button nahi hai — user ko tap nahi karna padta, app turant focus kar deta hai. Isliye "pehle profile kholiye", "shortlist par jaiye", ya "kisi ek ko select kijiye" jaisa kabhi mat kahiye. Agar samajh na aaye ki kaun, to sirf itna poochhiye ki kaun — number khud chun kar mat likhiye.
- Focus hote hi aapko unki poori jaankari mil jayegi aur tab aap unke baare me theek se bata payenge. Isliye ${WHO_MARKER_START}n${WHO_MARKER_END} ke saath lambi baat mat likhiye — ek chhoti si line kaafi hai, jaise "Theek hai, Priya ko dekhte hain."
- Jinka naam list me nahi hai unke liye ye marker mat lagaiye.`;
