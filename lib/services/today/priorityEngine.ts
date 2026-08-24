import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getCircleTeaser } from "@/lib/services/circle/circleService";
import { getActiveQuests } from "@/lib/services/quests/questService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeTrustScore } from "@/lib/services/trust/trustScoreService";
import { buildSelfKnowledge, type SelfKnowledgeSnapshot } from "@/lib/services/grio/selfKnowledge";
import { buildGrioRoster, type GrioRoster } from "@/lib/services/grio/roster";

/**
 * One deterministic answer to "what should I do next?".
 *
 * ## The problem this replaces
 *
 * The dashboard grew a card per feature — reel, activity, quests, Deep Profile,
 * intelligence, trust, Circle, family — and every one of them shouts at the
 * same volume. That is not a design flaw anybody chose; it is what happens when
 * eight teams' worth of work lands on one screen and nothing owns the ordering.
 * The cost is specific and measurable: a user with a real interest waiting on
 * them sees it in the same visual weight as "complete your profile 87%", so the
 * thing with a person behind it loses to the thing with a progress bar.
 *
 * So the ordering becomes code, in one place, and every surface reads it: the
 * dashboard renders the top few, Grio's briefing speaks them, and "aaj kya
 * karun" answers from the same list. Three surfaces that used to each decide
 * for themselves now cannot disagree.
 *
 * ## Why tiers rather than a score
 *
 * A score would need weights, and weights across incomparable things — an
 * unanswered question versus an unverified phone number — are numbers nobody
 * can defend. Tiers encode the one judgement that *is* defensible and that the
 * product direction states outright: **a person waiting on you outranks a
 * system nudging you.** Inside a tier, ordering is by count and then by tier
 * order, which is stable and needs no tuning.
 *
 * ## What is deliberately absent
 *
 * No "streak is about to break", no "3 people viewed you, upgrade to see", no
 * manufactured scarcity. P8 exists as the lowest tier precisely so that selling
 * has a defined place — beneath every real thing — rather than being smuggled
 * into P1 dressed as urgency.
 */

/**
 * Ordered most-urgent first. The array order *is* the priority order; nothing
 * else encodes it, so inserting a tier means putting it in the right place here.
 */
export const PRIORITY_TIERS = [
  /** Something is broken or blocking: the profile is invisible, a photo was rejected. */
  "P0_URGENT",
  /** A real person is waiting on a reply. */
  "P1_WAITING_ON_ME",
  /** Time-bound and uncatchable-up: a Circle that opens tonight. */
  "P2_TIME_BOUND",
  /** An active rishta with an obvious next step. */
  "P3_ACTIVE_RISHTA",
  /** Today's new rishtey. */
  "P4_TODAY_REEL",
  /** A high-value thing Grio still does not know. */
  "P5_INTELLIGENCE_GAP",
  /** Trust / readiness the user can improve. */
  "P6_TRUST",
  /** Meaningful progress the user is close to completing. */
  "P7_PROGRESS",
  /** Plan and upgrade. Last, always. */
  "P8_UPGRADE",
] as const;

export type PriorityTier = (typeof PRIORITY_TIERS)[number];

const TIER_ORDER: Record<PriorityTier, number> = Object.fromEntries(
  PRIORITY_TIERS.map((t, i) => [t, i]),
) as Record<PriorityTier, number>;

export interface TodayPriority {
  tier: PriorityTier;
  /** Stable across renders — used as a React key and for telemetry, never shown. */
  key: string;
  /** Short heading. Code's words. */
  title: string;
  /** One line of why. Code's words — never a model's, this is spoken aloud. */
  detail: string;
  href: string;
  /** Button label. English, per the app's CTA convention. */
  cta: string;
  /** How many, when the item is a count of things. Drives within-tier ordering. */
  count: number | null;
}

export interface TodayBoard {
  priorities: TodayPriority[];
  /** The roster the reel item was built from, so callers do not re-fetch it. */
  roster: GrioRoster | null;
  /** The graph the intelligence gap came from, reused by callers that need it. */
  selfKnowledge: SelfKnowledgeSnapshot | null;
}

/** Beyond this a priority list is a to-do app, which is the thing being replaced. */
export const TOP_PRIORITIES = 3;

/**
 * Builds every priority that currently applies, ordered.
 *
 * `roster` and `selfKnowledge` may be passed in by a caller that already has
 * them — the Grio route builds both on every turn, and re-fetching them here
 * would double the most expensive reads in the app for no new information.
 */
export async function buildTodayBoard(
  userId: string,
  reuse: { roster?: GrioRoster | null; selfKnowledge?: SelfKnowledgeSnapshot | null } = {},
): Promise<TodayBoard> {
  const [
    profile,
    user,
    questions,
    inboundInterests,
    unplayedVoice,
    silentMatches,
    awaitingReply,
    circle,
    quests,
    rejectedPhotos,
    roster,
    selfKnowledge,
  ] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { mobileVerifiedAt: true, emailVerifiedAt: true },
    }),
    getInboundQuestions(userId).catch(() => []),
    prisma.interest.count({ where: { toUserId: userId, status: "PENDING" } }).catch(() => 0),
    prisma.voiceNote.count({ where: { toUserId: userId, playedAt: null } }).catch(() => 0),
    // Matched and nobody has spoken. Both sides already said yes; the
    // conversation is dying of politeness. Same query `pending.ts` runs.
    prisma.match
      .count({ where: { OR: [{ userAId: userId }, { userBId: userId }], messages: { none: {} } } })
      .catch(() => 0),
    // They spoke last. The single most literal reading of "someone is waiting".
    prisma.match
      .count({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          messages: { some: { senderId: { not: userId }, readAt: null } },
        },
      })
      .catch(() => 0),
    getCircleTeaser(userId).catch(() => null),
    getActiveQuests(userId).catch(() => []),
    prisma.profilePhoto
      .count({ where: { profile: { userId }, verificationStatus: "REJECTED", deletedAt: null } })
      .catch(() => 0),
    reuse.roster !== undefined
      ? Promise.resolve(reuse.roster)
      : buildGrioRoster(userId).catch(() => null),
    reuse.selfKnowledge !== undefined
      ? Promise.resolve(reuse.selfKnowledge)
      : buildSelfKnowledge(userId).catch(() => null),
  ]);

  const out: TodayPriority[] = [];
  const add = (p: TodayPriority) => out.push(p);

  /* ── P0 — the user is invisible or something they did was rejected ────── */
  //
  // Genuinely urgent in the only sense that matters here: nothing else on this
  // list can help while the profile cannot be seen. This is not a nag about
  // completeness — `completionPercent` at 70% is a P6 concern. It fires only
  // when the profile is actually not live.
  const completion = profile ? computeCompletion(profile) : null;
  if (profile && completion && !completion.isLive) {
    add({
      tier: "P0_URGENT",
      key: "profile-not-live",
      title: "Profile abhi live nahi hai",
      detail:
        completion.missingFields.length > 0
          ? `Ye baaki hai: ${completion.missingFields.slice(0, 3).join(", ")}. Jab tak profile live nahi hoti, aap kisi ko dikhte nahi.`
          : "Profile live hone tak aap kisi ko dikhte nahi.",
      href: "/user/profile/me",
      cta: "Finish profile",
      count: completion.missingFields.length,
    });
  }
  if (rejectedPhotos > 0) {
    add({
      tier: "P0_URGENT",
      key: "photo-rejected",
      title: rejectedPhotos === 1 ? "Ek photo reject ho gayi" : `${rejectedPhotos} photo reject ho gayin`,
      detail: "Review me pass nahi hui. Nayi photo daal dijiye — bina photo ke profile bahut kam khulti hai.",
      href: "/user/profile/me",
      cta: "Replace photo",
      count: rejectedPhotos,
    });
  }

  /* ── P1 — a person is waiting ─────────────────────────────────────────── */
  if (awaitingReply > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "unread-messages",
      title: awaitingReply === 1 ? "Ek message ka jawab baaki hai" : `${awaitingReply} chat me jawab baaki hai`,
      detail: "Unhone bheja tha, jawab abhi gaya nahi.",
      href: "/user/messages",
      cta: "Open chat",
      count: awaitingReply,
    });
  }
  if (questions.length > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "inbound-questions",
      title: questions.length === 1 ? "Ek sawaal aaya hai" : `${questions.length} sawaal aaye hain`,
      detail: "Kisi ne aapse ek cheez poochhi hai aur jawab ka intezaar kar rahe hain.",
      href: "/user/inbox",
      cta: "Answer",
      count: questions.length,
    });
  }
  if (inboundInterests > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "inbound-interests",
      title: inboundInterests === 1 ? "Ek interest aaya hai" : `${inboundInterests} interest aaye hain`,
      detail: "Inhone aapme dilchaspi dikhayi hai — haan ya na, dono theek hai, par jawab dena zaroori hai.",
      href: "/user/interests",
      cta: "Review",
      count: inboundInterests,
    });
  }
  if (unplayedVoice > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "unplayed-voice",
      title: unplayedVoice === 1 ? "Ek voice note suna nahi" : `${unplayedVoice} voice note sune nahi`,
      detail: "Kisi ne apni awaaz me kuch bheja hai.",
      href: "/user/inbox",
      cta: "Listen",
      count: unplayedVoice,
    });
  }

  /* ── P2 — cannot be caught up on tomorrow ─────────────────────────────── */
  //
  // The one tier where "today" is literal. `pickSpecial` in briefing.ts makes
  // the same judgement for the same reason: a Circle that opens tonight is not
  // comparable to a poll that can be answered any time before midnight.
  if (circle?.eligible && circle.status === "LIVE" && circle.awaitingMe > 0) {
    add({
      tier: "P2_TIME_BOUND",
      key: "circle-live",
      title: "Serious Circle abhi chal raha hai",
      detail: `${circle.awaitingMe} log aapke jawab ka intezaar kar rahe hain. Ye session khatam hone ke baad wapas nahi milta.`,
      href: "/user/circle",
      cta: "Join now",
      count: circle.awaitingMe,
    });
  } else if (circle?.eligible && circle.status === "SCHEDULED" && !circle.registered) {
    // `registered` matters: telling somebody to register for a thing they have
    // already registered for is the fastest way to teach them that this list
    // does not actually know what they have done.
    add({
      tier: "P2_TIME_BOUND",
      key: "circle-open",
      title: "Serious Circle ke liye registration khula hai",
      detail: `${circle.slotLabel} — roster shuru hone se 24 ghante pehle band ho jaata hai.`,
      href: "/user/circle",
      cta: "Register",
      count: null,
    });
  }

  /* ── P3 — an active rishta with an obvious next step ──────────────────── */
  if (silentMatches > 0) {
    add({
      tier: "P3_ACTIVE_RISHTA",
      key: "silent-matches",
      title: silentMatches === 1 ? "Ek match me baat shuru nahi hui" : `${silentMatches} match me baat shuru nahi hui`,
      detail: "Dono taraf se haan ho chuki hai. Pehla message koi bhi bhej sakta hai.",
      href: "/user/matches",
      cta: "Say hello",
      count: silentMatches,
    });
  }

  /* ── P4 — today's rishtey ─────────────────────────────────────────────── */
  if (roster && roster.reelLeft > 0) {
    add({
      tier: "P4_TODAY_REEL",
      key: "reel-remaining",
      title: `Aaj ke ${roster.reelLeft} rishtey baaki hain`,
      detail:
        roster.reelLeft === roster.reelTotal
          ? "Aaj ke naye rishtey abhi khole nahi."
          : `${roster.reelTotal} me se ${roster.reelTotal - roster.reelLeft} dekh liye.`,
      href: "/user/reel",
      cta: "Open reel",
      count: roster.reelLeft,
    });
  }

  /* ── P5 — the highest-value thing Grio does not know ──────────────────── */
  //
  // One, not a list. The graph already ranks them by the catalog's own ask
  // order, so this is a read rather than a second judgement.
  const gap = selfKnowledge?.unknowns.find((u) => u.askableInChat) ?? selfKnowledge?.unknowns[0];
  if (gap) {
    add({
      tier: "P5_INTELLIGENCE_GAP",
      key: `gap-${gap.key}`,
      title: `Ek sawaal: ${gap.label}`,
      detail: gap.why,
      href: "/user/profile/intelligence",
      cta: "Answer",
      count: null,
    });
  }

  /* ── P6 — trust ───────────────────────────────────────────────────────── */
  if (profile && user) {
    const trust = computeTrustScore(user, profile);
    const next = trust.improvementFactors[0];
    if (next && trust.trustScore !== null) {
      // Mobile/email verification is a one-tap OTP flow, not a form to fill —
      // point straight at it instead of the trust-score explainer page. See
      // `computeTrustScore`'s two verification factors, which are the only
      // ones with a working action outside the profile builder.
      const isVerification = next.label === "Mobile Verify Karein" || next.label === "Email Verify Karein";
      add({
        tier: "P6_TRUST",
        key: "trust-next",
        title: next.label,
        detail: `${next.description} Abhi trust ${trust.trustScore}/100 hai.`,
        href: isVerification ? "/user/verify-contact" : "/user/profile-trust-score",
        cta: isVerification ? "Verify now" : "Improve trust",
        count: null,
      });
    }
  }

  /* ── P7 — kundli readiness, only when it is the next relevant action ──── */
  //
  // Deliberately not a permanent dashboard card (see priorityEngine's own
  // "what is deliberately absent" note) — this fires only while the chart is
  // genuinely incomplete, and disappears the moment birth time/place are both
  // on file. Lowest tier before selling, same as any other "nice to finish".
  if (profile && completion?.isLive && profile.dateOfBirth && (!profile.basicDetails?.birthTime || !profile.basicDetails?.birthPlace)) {
    add({
      tier: "P7_PROGRESS",
      key: "kundli-incomplete",
      title: !profile.basicDetails?.birthTime ? "Kundli ke liye birth time add karein" : "Kundli ke liye birth place add karein",
      detail: "Lagna ke liye exact time aur sahi shehar chahiye — Chandra rashi aur guna milan iske bina bhi kaam karte hain.",
      href: "/profile/build",
      cta: "Add details",
      count: null,
    });
  }

  /* ── P7 — progress the user is close to finishing ─────────────────────── */
  //
  // Only quests already under way. A quest at zero is an advertisement; a quest
  // at 3-of-4 is a thing the user started and would want finished.
  const nearlyDone = quests
    .filter((q) => !q.completed && q.target > 1 && q.progress > 0 && q.progress < q.target)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
  if (nearlyDone) {
    add({
      tier: "P7_PROGRESS",
      key: `quest-${nearlyDone.key}`,
      title: nearlyDone.title,
      detail: `${nearlyDone.progress}/${nearlyDone.target} ho chuka hai.`,
      href: "/user/dashboard",
      cta: "Continue",
      count: nearlyDone.target - nearlyDone.progress,
    });
  }

  out.sort((a, b) => {
    const tier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tier !== 0) return tier;
    // Within a tier, more waiting people first. A null count sorts last — it is
    // a single thing rather than a pile of them.
    return (b.count ?? 0) - (a.count ?? 0);
  });

  return { priorities: out, roster, selfKnowledge };
}

/**
 * The prompt block, so Grio's "aaj kya karun" answers from the same ordering
 * the dashboard renders.
 *
 * Capped at `TOP_PRIORITIES` for the same reason the dashboard is: a list long
 * enough to contain everything is a list that has stopped prioritising. Grio can
 * still speak about anything else if asked — the rest of its context has not
 * moved — but this is what "what should I do" resolves to.
 */
export function formatTodayBoard(board: TodayBoard): string | null {
  const top = board.priorities.slice(0, TOP_PRIORITIES);
  if (top.length === 0) return null;

  const lines = top.map((p, i) => `${i + 1}. ${p.title} — ${p.detail}`).join("\n");

  return `AAJ SABSE ZAROORI KYA HAI (ye kram CODE ne tay kiya hai, aapne nahi):
${lines}

Is list ke niyam:
- Kram code ka hai. Apna alag kram mat banaiye aur koi cheez upar-neeche mat kijiye.
- Jab user poochein "aaj kya karun" ya "sabse zaroori kya hai", to isi list se jawab dijiye — pehle wali cheez pehle.
- Ye poori list nahi hai, sirf sabse upar ki teen cheezein hain. Aur bhi kuch pending ho sakta hai; wo baaki blocks me hai.
- Ek saath teenon mat gina dijiye jab tak user poori list na maange — ek cheez sujhaiye aur user ko chunne dijiye.`;
}
