import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { getOrCreateTodayReel, todayUTCDate } from "@/lib/services/match/reelGenerator";
import { WHO_MARKER_START, WHO_MARKER_END } from "@/lib/contracts/concierge";

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

/** Why somebody is on the list. A person can be on it for several reasons at once. */
export type GrioRosterSource = "reel" | "shortlist" | "interest_received";

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
}

export interface GrioRoster {
  entries: GrioRosterEntry[];
  /** How many of today's reel cards are still unswiped. */
  reelLeft: number;
  reelTotal: number;
}

const SHORTLIST_LIMIT = 25;
const INTEREST_LIMIT = 25;

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
  opts: { generateReel?: boolean } = {},
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

  const [swipes, blockedUserIds, shortlisted, received] = await Promise.all([
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
    extra: { reelRank?: number; score?: number } = {},
  ) {
    if (blocked.has(p.userId)) return;
    const existing = byProfileId.get(p.id);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      existing.reelRank ??= extra.reelRank ?? null;
      existing.score ??= extra.score ?? null;
      return;
    }
    byProfileId.set(p.id, {
      profileId: p.id,
      name: p.displayName?.trim() || "Profile",
      sources: [source],
      reelRank: extra.reelRank ?? null,
      seenToday: seen.has(p.id),
      score: extra.score ?? null,
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

export const GRIO_WHO_INSTRUCTIONS = `

KISI EK PAR FOCUS KARNA — jab user upar wali list me se kisi ek ki baat kare, to us insaan ka number ${WHO_MARKER_START}n${WHO_MARKER_END} ki tarah likh dijiye (jaise ${WHO_MARKER_START}1${WHO_MARKER_END}). App khud us profile par focus kar dega.
- Ye tab likhiye jab user kahe "sabse zyada matching wale ke baare me batao", "pehle wale ke baare me", "doosre ke baare me", "Priya ke baare me", ya us jaisa kuch bhi jisse ek hi insaan saaf samajh aata ho.
- Ek jawab me sirf ek ${WHO_MARKER_START}n${WHO_MARKER_END}. Do log ek saath focus nahi ho sakte.
- Ye koi button nahi hai — user ko tap nahi karna padta, app turant focus kar deta hai. Isliye "pehle profile kholiye", "shortlist par jaiye", ya "kisi ek ko select kijiye" jaisa kabhi mat kahiye. Agar samajh na aaye ki kaun, to sirf itna poochhiye ki kaun — number khud chun kar mat likhiye.
- Focus hote hi aapko unki poori jaankari mil jayegi aur tab aap unke baare me theek se bata payenge. Isliye ${WHO_MARKER_START}n${WHO_MARKER_END} ke saath lambi baat mat likhiye — ek chhoti si line kaafi hai, jaise "Theek hai, Priya ko dekhte hain."
- Jinka naam list me nahi hai unke liye ye marker mat lagaiye.`;
