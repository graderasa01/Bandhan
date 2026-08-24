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
import { noopT, type Translate } from "@/lib/i18n/translate";

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
  /**
   * Defaults to `noopT` so every existing caller keeps compiling and keeps
   * rendering the inline Hinglish — the same growth path `computeTrustScore`
   * and `getKundliNotes` took when they grew a `t`.
   */
  t: Translate = noopT,
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
      title: t("today.p0.profileNotLive.title", "Profile abhi live nahi hai"),
      detail:
        completion.missingFields.length > 0
          ? t(
              "today.p0.profileNotLive.detailMissing",
              "Ye baaki hai: {fields}. Jab tak profile live nahi hoti, aap kisi ko dikhte nahi.",
            ).replace("{fields}", completion.missingFields.slice(0, 3).join(", "))
          : t("today.p0.profileNotLive.detail", "Profile live hone tak aap kisi ko dikhte nahi."),
      href: "/user/profile/me",
      cta: t("today.p0.profileNotLive.cta", "Finish profile"),
      count: completion.missingFields.length,
    });
  }
  if (rejectedPhotos > 0) {
    add({
      tier: "P0_URGENT",
      key: "photo-rejected",
      title:
        rejectedPhotos === 1
          ? t("today.p0.photoRejected.titleOne", "Ek photo reject ho gayi")
          : t("today.p0.photoRejected.titleMany", "{count} photo reject ho gayin").replace("{count}", String(rejectedPhotos)),
      detail: t("today.p0.photoRejected.detail", "Review me pass nahi hui. Nayi photo daal dijiye — bina photo ke profile bahut kam khulti hai."),
      href: "/user/profile/me",
      cta: t("today.p0.photoRejected.cta", "Replace photo"),
      count: rejectedPhotos,
    });
  }

  /* ── P1 — a person is waiting ─────────────────────────────────────────── */
  if (awaitingReply > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "unread-messages",
      title:
        awaitingReply === 1
          ? t("today.p1.messages.titleOne", "Ek message ka jawab baaki hai")
          : t("today.p1.messages.titleMany", "{count} chat me jawab baaki hai").replace("{count}", String(awaitingReply)),
      detail: t("today.p1.messages.detail", "Unhone bheja tha, jawab abhi gaya nahi."),
      href: "/user/messages",
      cta: t("today.p1.messages.cta", "Open chat"),
      count: awaitingReply,
    });
  }
  if (questions.length > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "inbound-questions",
      title:
        questions.length === 1
          ? t("today.p1.questions.titleOne", "Ek sawaal aaya hai")
          : t("today.p1.questions.titleMany", "{count} sawaal aaye hain").replace("{count}", String(questions.length)),
      detail: t("today.p1.questions.detail", "Kisi ne aapse ek cheez poochhi hai aur jawab ka intezaar kar rahe hain."),
      href: "/user/inbox",
      cta: "Answer",
      count: questions.length,
    });
  }
  if (inboundInterests > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "inbound-interests",
      title:
        inboundInterests === 1
          ? t("today.p1.interests.titleOne", "Ek interest aaya hai")
          : t("today.p1.interests.titleMany", "{count} interest aaye hain").replace("{count}", String(inboundInterests)),
      detail: t("today.p1.interests.detail", "Inhone aapme dilchaspi dikhayi hai — haan ya na, dono theek hai, par jawab dena zaroori hai."),
      href: "/user/interests",
      cta: t("today.p1.interests.cta", "Review"),
      count: inboundInterests,
    });
  }
  if (unplayedVoice > 0) {
    add({
      tier: "P1_WAITING_ON_ME",
      key: "unplayed-voice",
      title:
        unplayedVoice === 1
          ? t("today.p1.voice.titleOne", "Ek voice note suna nahi")
          : t("today.p1.voice.titleMany", "{count} voice note sune nahi").replace("{count}", String(unplayedVoice)),
      detail: t("today.p1.voice.detail", "Kisi ne apni awaaz me kuch bheja hai."),
      href: "/user/inbox",
      cta: t("today.p1.voice.cta", "Listen"),
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
      title: t("today.p2.circleLive.title", "Serious Circle abhi chal raha hai"),
      detail: t(
        "today.p2.circleLive.detail",
        "{count} log aapke jawab ka intezaar kar rahe hain. Ye session khatam hone ke baad wapas nahi milta.",
      ).replace("{count}", String(circle.awaitingMe)),
      href: "/user/circle",
      cta: t("today.p2.circleLive.cta", "Join now"),
      count: circle.awaitingMe,
    });
  } else if (circle?.eligible && circle.status === "SCHEDULED" && !circle.registered) {
    // `registered` matters: telling somebody to register for a thing they have
    // already registered for is the fastest way to teach them that this list
    // does not actually know what they have done.
    add({
      tier: "P2_TIME_BOUND",
      key: "circle-open",
      title: t("today.p2.circleOpen.title", "Serious Circle ke liye registration khula hai"),
      detail: t(
        "today.p2.circleOpen.detail",
        "{slot} — roster shuru hone se 24 ghante pehle band ho jaata hai.",
      ).replace("{slot}", circle.slotLabel),
      href: "/user/circle",
      cta: t("today.p2.circleOpen.cta", "Register"),
      count: null,
    });
  }

  /* ── P3 — an active rishta with an obvious next step ──────────────────── */
  if (silentMatches > 0) {
    add({
      tier: "P3_ACTIVE_RISHTA",
      key: "silent-matches",
      title:
        silentMatches === 1
          ? t("today.p3.silent.titleOne", "Ek match me baat shuru nahi hui")
          : t("today.p3.silent.titleMany", "{count} match me baat shuru nahi hui").replace("{count}", String(silentMatches)),
      detail: t("today.p3.silent.detail", "Dono taraf se haan ho chuki hai. Pehla message koi bhi bhej sakta hai."),
      href: "/user/matches",
      cta: t("today.p3.silent.cta", "Say hello"),
      count: silentMatches,
    });
  }

  /* ── P4 — today's rishtey ─────────────────────────────────────────────── */
  if (roster && roster.reelLeft > 0) {
    add({
      tier: "P4_TODAY_REEL",
      key: "reel-remaining",
      title: t("today.p4.reel.title", "Aaj ke {count} rishtey baaki hain").replace("{count}", String(roster.reelLeft)),
      detail:
        roster.reelLeft === roster.reelTotal
          ? t("today.p4.reel.detailFresh", "Aaj ke naye rishtey abhi khole nahi.")
          : t("today.p4.reel.detailPartial", "{total} me se {seen} dekh liye.")
              .replace("{total}", String(roster.reelTotal))
              .replace("{seen}", String(roster.reelTotal - roster.reelLeft)),
      href: "/user/reel",
      cta: t("today.p4.reel.cta", "Open reel"),
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
      title: t("today.p5.gap.title", "Ek sawaal: {label}").replace("{label}", gap.label),
      detail: gap.why,
      href: "/user/profile/intelligence",
      cta: "Answer",
      count: null,
    });
  }

  /* ── P6 — trust ───────────────────────────────────────────────────────── */
  if (profile && user) {
    const trust = computeTrustScore(user, profile, t);
    const next = trust.improvementFactors[0];
    if (next && trust.trustScore !== null) {
      // Mobile/email verification is a one-tap OTP flow, not a form to fill —
      // point straight at it instead of the trust-score explainer page. See
      // `computeTrustScore`'s two verification factors, which are the only
      // ones with a working action outside the profile builder.
      //
      // Tested on `actionHref`, not on the label. The label used to be compared
      // against the Hinglish literals — which was already fragile and became
      // wrong the moment `t` started translating it: an English user would have
      // been sent to the explainer page instead of the OTP screen, with a
      // "Improve trust" button, and nothing would have looked broken.
      // `actionHref` is set on exactly those two factors and on no others.
      const isVerification = next.actionHref === "/user/verify-contact";
      add({
        tier: "P6_TRUST",
        key: "trust-next",
        title: next.label,
        detail: t("today.p6.trust.detail", "{description} Abhi trust {score}/100 hai.")
          .replace("{description}", next.description)
          .replace("{score}", String(trust.trustScore)),
        href: isVerification ? "/user/verify-contact" : "/user/profile-trust-score",
        cta: isVerification
          ? t("today.p6.trust.ctaVerify", "Verify now")
          : t("today.p6.trust.ctaImprove", "Improve trust"),
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
      title: !profile.basicDetails?.birthTime
        ? t("today.p7.kundli.titleTime", "Kundli ke liye birth time add karein")
        : t("today.p7.kundli.titlePlace", "Kundli ke liye birth place add karein"),
      detail: t("today.p7.kundli.detail", "Lagna ke liye exact time aur sahi shehar chahiye — Chandra rashi aur guna milan iske bina bhi kaam karte hain."),
      href: "/profile/build",
      cta: t("today.p7.kundli.cta", "Add details"),
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
      detail: t("today.p7.quest.detail", "{done}/{target} ho chuka hai.")
        .replace("{done}", String(nearlyDone.progress))
        .replace("{target}", String(nearlyDone.target)),
      href: "/user/dashboard",
      cta: t("today.p7.quest.cta", "Continue"),
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
