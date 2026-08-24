import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { computeTrustScore } from "@/lib/services/trust/trustScoreService";
import { buildIntelligenceState } from "@/lib/services/profile/intelligenceService";
import { listFamilyMembers } from "@/lib/services/family/familyService";
import { getBadgeState } from "@/lib/services/circle/badgeService";
import { getExpectationGapReport } from "@/lib/services/family/familyExpectationService";

/**
 * Bandhan Journey — one readiness picture instead of seven competing ones.
 *
 * ## The problem
 *
 * A user currently has a profile-completion percentage, a trust score, a
 * "3 of 9 areas understood" coverage number, a Vibe streak, a Shaadi Ready
 * badge, quest progress and a Deep Profile state. Every one is real and every
 * one is shown separately, so the honest answer to "am I ready?" is seven
 * numbers that do not add up to anything. Worse, they are not comparable: 78%
 * complete and 4 of 9 understood measure different things in different units,
 * and a user reading both cannot tell which to fix first.
 *
 * This composes them into six **areas** with one shared shape, so they can sit
 * in a list and be compared at a glance.
 *
 * ## What it deliberately is not
 *
 * **Not a score.** There is no "your readiness: 68". Averaging trust against
 * family involvement would produce a number with no meaning — a user with a
 * perfect profile and no family added is not 50% ready for anything. Each area
 * keeps its own units and its own next step.
 *
 * **Not points.** Nothing here awards anything; `questService` still owns
 * rewards and keeps owning them. This is a mirror, not a game. The product
 * direction is explicit that gamification should serve marriage progress rather
 * than dopamine, and the difference in practice is that no area here can be
 * "won" by opening the app more often.
 *
 * **Not a gate.** No area blocks anything. A user at zero on all six can still
 * use every feature they have paid for.
 */

export type JourneyAreaKey =
  | "PROFILE"
  | "TRUST"
  | "UNDERSTANDING"
  | "FAMILY"
  | "CIRCLE"
  | "CONVERSATION";

export interface JourneyArea {
  key: JourneyAreaKey;
  /** Short label. English, per the app's chrome convention. */
  label: string;
  /** Where this stands, in the area's own units — "4 of 9", "62/100", "2 log". */
  value: string;
  /**
   * 0..100 for a bar. Present even where the area's natural unit is not a
   * percentage, because a row of bars is the only way six different units
   * become comparable at a glance — the *number* stays in `value`.
   */
  percent: number;
  /** True once this area needs nothing more from the user right now. */
  done: boolean;
  /** One line: what moving this actually buys. Code's words. */
  why: string;
  /** Where to go. Null when there is nothing to do. */
  href: string | null;
  cta: string | null;
}

export interface BandhanJourney {
  areas: JourneyArea[];
  /** How many areas are settled. The one number a user reads first. */
  complete: number;
  total: number;
  /** The area worth moving next, or null when all six are settled. */
  next: JourneyArea | null;
}

/** Bounded and rounded once, so no caller has to remember to clamp. */
function pct(value: number, of: number): number {
  if (of <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / of) * 100)));
}

/**
 * Beyond this many family seats there is nothing more to prove — the area is
 * about whether family is *involved at all*, not about recruiting a crowd.
 */
const FAMILY_TARGET = 2;

export async function buildBandhanJourney(userId: string): Promise<BandhanJourney | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!profile) return null;

  const [user, intelligence, family, badge, gaps, replied] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { mobileVerifiedAt: true, emailVerifiedAt: true },
    }),
    buildIntelligenceState(profile),
    listFamilyMembers(userId).catch(() => []),
    getBadgeState(userId).catch(() => null),
    getExpectationGapReport(userId).catch(() => null),
    // Conversation readiness is measured by the thing it is actually about:
    // has this person ever held a conversation on the platform. A match where
    // both sides spoke is the smallest honest evidence of that, and it is the
    // same "both spoke" test `deriveStage` uses for TALKING.
    prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { id: true, messages: { select: { senderId: true }, take: 50 } },
    }),
  ]);

  const completion = computeCompletion(profile);
  const trust = user ? computeTrustScore(user, profile) : null;

  const talking = replied.filter(
    (m) => m.messages.some((x) => x.senderId === userId) && m.messages.some((x) => x.senderId !== userId),
  ).length;

  const familyAnswered = gaps?.respondents.length ?? 0;

  const areas: JourneyArea[] = [
    {
      key: "PROFILE",
      label: "Profile ready",
      value: `${completion.percent}%`,
      percent: completion.percent,
      done: completion.isLive && completion.percent >= 100,
      why: completion.isLive
        ? "Poori profile par log rukte hain — adhoori par scroll kar jaate hain."
        : "Jab tak profile live nahi hoti, aap kisi ko dikhte hi nahi.",
      href: completion.percent >= 100 ? null : "/profile/build",
      cta: completion.percent >= 100 ? null : "Complete",
    },
    {
      key: "TRUST",
      label: "Trust",
      value: trust?.trustScore === null || !trust ? "abhi nahi" : `${trust.trustScore}/100`,
      percent: trust?.trustScore ?? 0,
      // 85 is `trustScoreService`'s own STRONG threshold — not a second bar.
      done: (trust?.trustScore ?? 0) >= 85,
      why: "Verify hui profile par jawab jaldi milta hai.",
      href: (trust?.trustScore ?? 0) >= 85 ? null : "/user/profile-trust-score",
      cta: (trust?.trustScore ?? 0) >= 85 ? null : "Improve",
    },
    {
      key: "UNDERSTANDING",
      label: "Grio aapko kitna samajhta hai",
      value: `${intelligence.progress.completedLayers} of ${intelligence.progress.totalLayers}`,
      percent: pct(intelligence.progress.completedLayers, intelligence.progress.totalLayers),
      done: intelligence.progress.completedLayers >= intelligence.progress.totalLayers,
      why: "Jitna zyada samajh, utne behtar rishtey — aur utni saaf salah.",
      href: intelligence.progress.nextLayer ? "/user/profile/intelligence" : null,
      cta: intelligence.progress.nextLayer ? "Answer" : null,
    },
    {
      key: "FAMILY",
      label: "Ghar wale",
      value: family.length === 0 ? "koi nahi" : `${family.length} jude`,
      percent: pct(Math.min(family.length, FAMILY_TARGET), FAMILY_TARGET),
      // Joined *and* they have said what they expect — a silent seat is not
      // involvement, it is an invite that was accepted and then ignored.
      done: family.length > 0 && familyAnswered > 0,
      why:
        family.length > 0 && familyAnswered === 0
          ? "Ghar wale jud to gaye hain, par unhone apni ummeed abhi nahi batayi."
          : "Ghar ki soch pehle se pata ho to rishta beech me nahi atakta.",
      href: family.length > 0 && familyAnswered > 0 ? null : "/user/family",
      cta: family.length > 0 && familyAnswered > 0 ? null : family.length > 0 ? "Remind them" : "Invite",
    },
    {
      key: "CONVERSATION",
      label: "Baat-cheet",
      value: talking === 0 ? "shuru nahi" : `${talking} me chal rahi`,
      // One real two-way conversation is the whole bar. This area asks whether
      // the user can start one, not how many they are juggling.
      percent: talking > 0 ? 100 : 0,
      done: talking > 0,
      why: "Match ban jaana aadha kaam hai — pehla message doosra aadha.",
      href: talking > 0 ? null : "/user/matches",
      cta: talking > 0 ? null : "Say hello",
    },
    {
      key: "CIRCLE",
      label: "Serious Circle",
      value: badge?.eventsAttended ? `${badge.eventsAttended} baar` : "abhi nahi",
      percent: badge?.eventsAttended ? 100 : 0,
      done: Boolean(badge?.active),
      why: "Wahan sirf wo log aate hain jo sach me shaadi karna chahte hain.",
      href: badge?.active ? null : "/user/circle",
      cta: badge?.active ? null : "See next",
    },
  ];

  const pending = areas.filter((a) => !a.done);

  return {
    areas,
    complete: areas.length - pending.length,
    total: areas.length,
    // The least-far-along unfinished area, so the suggestion is the one with
    // most room rather than the one nearest the finish. A user at 95% profile
    // and 0 family is told to invite family.
    next: pending.sort((a, b) => a.percent - b.percent)[0] ?? null,
  };
}

/** The block Grio reads. Null when there is no profile to describe. */
export function formatBandhanJourney(journey: BandhanJourney): string {
  const lines = journey.areas
    .map((a) => `- ${a.label}: ${a.value}${a.done ? " ✓" : ""}`)
    .join("\n");

  return `AAPKE USER KI TAIYARI (${journey.total} me se ${journey.complete} cheezein set hain):
${lines}

Is hisse ke niyam:
- Ye koi score nahi hai aur na hi koi level. Inhe jodkar "aap X% ready hain" jaisa kuch kabhi mat kahiye — har cheez ka apna paimana hai.
- Ye kisi feature ko rokti nahi. "Pehle ye poora kijiye tabhi..." jaisa kuch mat kahiye.
- Ek baar me ek hi cheez sujhaiye — jo sabse peeche hai wahi. Poori list gina dena taiyari nahi, thakan deta hai.`;
}
