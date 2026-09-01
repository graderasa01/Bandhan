import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { getActivitySnapshot } from "@/lib/services/activity/admirerService";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getNotices, getUnreadCount } from "@/lib/services/notice/noticeService";
import { getPlanContext, effectiveReelLimit, effectiveAiAskLimit } from "@/lib/services/plans/entitlements";
import { REWARD_LABELS } from "@/lib/services/rewards/rewardService";
import type { RewardKind } from "@prisma/client";
import { todayUTCDate } from "@/lib/services/match/reelGenerator";
import { monthStartUTC } from "@/lib/services/match/sendInterest";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import { buildIntelligenceState } from "@/lib/services/profile/intelligenceService";
import {
  buildLearnedBehaviorProfile,
  summarizeBehaviorLearning,
  type BehaviorLearningState,
} from "@/lib/services/discovery/behaviorLearning";

/**
 * Grio's READ tools (Phase G · §3.2) — the user's own state, folded into one
 * text block the model reads before answering.
 *
 * ## Why this doesn't break the concierge's data-blindness
 *
 * `app/api/concierge/route.ts` was built deliberately blind, and its stated
 * reason is worth quoting exactly, because it is narrower than "Grio sees no
 * data": *"A concierge that could see 'your matches' would immediately be
 * pulled into ranking or recommending a specific person — exactly what D-32
 * reserves for the deterministic pipeline."*
 *
 * The hazard is **candidate data**, not the user's own. Telling Grio that its
 * user's profile is 78% complete, or that two questions are waiting for an
 * answer, cannot pull it toward ranking anybody, because there is nobody in
 * the block to rank. So the boundary this file enforces is the sharper one:
 *
 *   **Only the user's own state. Never another person's attributes.**
 *
 * Concretely — counts about other people are allowed ("4 logon ne shortlist
 * kiya"), identities and attributes are not. That is also why today's reel
 * appears here as three numbers and never as a list of candidates: a count
 * cannot be ranked, and the moment Grio could read a candidate's age, city or
 * score it would be one prompt away from doing L2's job in prose.
 *
 * `getActivitySnapshot` does return faces (plan-gated names and photos) and
 * this file drops them on the floor — see `buildGrioContext`. It is reused
 * anyway rather than re-counted here so those numbers keep exactly one
 * definition; the same reasoning as the profile-activity panel.
 *
 * ## Cost
 *
 * All plain indexed reads, no AI call, and nothing here writes — notably
 * `prisma.profile.findUnique` rather than `getOrCreateProfile`, and a
 * `findUnique` on today's reel rather than `getOrCreateTodayReel`. Reading
 * your own context must never be the thing that creates a profile row or
 * burns a day's reel generation.
 */

export interface GrioContextFacts {
  planLabel: string;
  chat: boolean;
  reelPerDay: number;
  aiAskPerDay: number | null;
  profilePercent: number;
  profileLive: boolean;
  missingFields: string[];
  reelTotal: number;
  reelSwiped: number;
  viewers: number;
  shortlisted: number;
  pendingInterests: number;
  pendingQuestions: number;
  unreadNotices: number;
  recentNoticeTitles: string[];
  interestsSentThisMonth: number;
  interestsPerMonth: number | null;
  deepProfileScored: boolean;
  /**
   * Earned credits the user is holding right now, non-zero only.
   *
   * Added when `activateBoost` joined the action catalog. That action's `when`
   * tells the model not to offer the button unless a BOOST credit exists — a
   * rule it had no way to follow, because nothing in this block said whether
   * one did. The result would have been a button offered blindly, a 422 from
   * the endpoint, and a "Nahi ho paya" toast the user did nothing to deserve.
   *
   * Still the user's own state, so it changes nothing about this file's
   * boundary: a credit balance names no other person.
   */
  credits: { label: string; count: number }[];

  /** Grio Marriage Graph extension — see this file's header note below `getGrioContextFacts`. */
  mobileVerified: boolean;
  emailVerified: boolean;
  hasMobile: boolean;
  hasEmail: boolean;
  advancedDiscoveryEntitled: boolean;
  /** Null when the user has saved nothing yet — `ProfilePartnerPreferences` and `DiscoverySettings` are both effectively empty. */
  savedFilterSummary: string | null;
  behaviorLearning: BehaviorLearningState | "not_entitled";
  kundli: {
    hasDob: boolean;
    hasBirthTime: boolean;
    hasBirthPlace: boolean;
    precision: "none" | "no-time" | "no-place" | "full";
  };
  /** The highest-value Marriage Intelligence layer still open — title only, same source `aiNextStep` (dashboard) reads. Null once every layer is answered. */
  nextIntelligenceLayer: string | null;
}

export async function getGrioContextFacts(userId: string): Promise<GrioContextFacts> {
  const [profile, planCtx, user] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE }),
    getPlanContext(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { mobile: true, email: true, mobileVerifiedAt: true, emailVerifiedAt: true } }),
  ]);

  const completion = profile ? computeCompletion(profile) : null;

  const [
    activity,
    reel,
    questions,
    notices,
    unreadNotices,
    interestsSentThisMonth,
    dimensionCount,
    discoverySettings,
    behaviorProfile,
  ] = await Promise.all([
    profile
      ? getActivitySnapshot(userId, profile.id)
      : Promise.resolve(null),
    prisma.dailyReel.findUnique({
      where: { userId_reelDate: { userId, reelDate: todayUTCDate() } },
      select: { _count: { select: { candidates: true, swipes: true } } },
    }),
    getInboundQuestions(userId),
    getNotices(userId, 3),
    getUnreadCount(userId),
    prisma.interest.count({ where: { fromUserId: userId, createdAt: { gte: monthStartUTC() } } }),
    profile
      ? prisma.profileDimensionScore.count({ where: { profileId: profile.id } })
      : Promise.resolve(0),
    // Advanced Discovery block below is best-effort and only queried for an
    // entitled user — the same "no extra cost for the overwhelming majority
    // of turns" discipline the rest of this file follows.
    planCtx.features.advancedDiscovery
      ? prisma.discoverySettings.findUnique({ where: { userId } })
      : Promise.resolve(null),
    planCtx.features.advancedDiscovery
      ? buildLearnedBehaviorProfile(userId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const intelligence = profile ? await buildIntelligenceState(profile).catch(() => null) : null;

  const prefs = profile?.partnerPreferences ?? null;
  const savedFilterBits: string[] = [];
  if (prefs?.minAge || prefs?.maxAge) savedFilterBits.push(`umar ${prefs.minAge ?? "?"}-${prefs.maxAge ?? "?"}`);
  if (prefs?.preferredCities && prefs.preferredCities.length > 0) savedFilterBits.push(`sheher: ${prefs.preferredCities.join(", ")}`);
  if (prefs?.educationPreference && prefs.educationPreference !== "Koi farak nahi") savedFilterBits.push(`shiksha: ${prefs.educationPreference}`);
  if (discoverySettings?.verifiedOnly) savedFilterBits.push("sirf verified");
  if (discoverySettings?.minTrustScore != null) savedFilterBits.push(`min trust: ${discoverySettings.minTrustScore}`);
  if (discoverySettings?.filterMode === "STRICT") savedFilterBits.push("STRICT mode");

  const behaviorState: BehaviorLearningState | "not_entitled" = !planCtx.features.advancedDiscovery
    ? "not_entitled"
    : summarizeBehaviorLearning({
        enabled: discoverySettings?.behaviorLearningEnabled ?? true,
        profile: behaviorProfile,
        sampleSize: 0,
        positiveCount: 0,
      }).state;

  const basic = profile?.basicDetails;
  const hasDob = Boolean(profile?.dateOfBirth);
  const hasBirthTime = Boolean(basic?.birthTime);
  const hasBirthPlace = Boolean(basic?.birthPlace);
  const kundliPrecision: GrioContextFacts["kundli"]["precision"] = !hasDob
    ? "none"
    : !hasBirthTime
      ? "no-time"
      : !hasBirthPlace
        ? "no-place"
        : "full";

  return {
    planLabel: planNameOf(await getPlanCatalog(), planCtx.effectivePlanCode),
    chat: planCtx.features.chat,
    reelPerDay: effectiveReelLimit(planCtx),
    aiAskPerDay: effectiveAiAskLimit(planCtx),
    profilePercent: completion?.percent ?? 0,
    profileLive: completion?.isLive ?? false,
    // Labels only — `missingFields` is already a list of human labels, never values.
    missingFields: completion?.missingFields ?? [],
    reelTotal: reel?._count.candidates ?? 0,
    reelSwiped: reel?._count.swipes ?? 0,
    // Counts only. `activity.faces` / `activity.viewerFaces` are deliberately
    // not read — those are other people's names and photos (see docstring).
    viewers: activity?.viewers ?? 0,
    shortlisted: activity?.shortlisted ?? 0,
    pendingInterests: activity?.pendingInterests ?? 0,
    pendingQuestions: questions.length,
    unreadNotices,
    recentNoticeTitles: notices.map((n) => n.title),
    interestsSentThisMonth,
    interestsPerMonth: planCtx.features.interestsPerMonth,
    deepProfileScored: dimensionCount > 0,
    // Reuses the balances `getPlanContext` already fetched — no extra query.
    credits: (Object.entries(planCtx.credits) as [RewardKind, number][])
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => ({ label: REWARD_LABELS[kind], count })),

    mobileVerified: Boolean(user?.mobileVerifiedAt),
    emailVerified: Boolean(user?.emailVerifiedAt),
    hasMobile: Boolean(user?.mobile),
    hasEmail: Boolean(user?.email),
    advancedDiscoveryEntitled: planCtx.features.advancedDiscovery,
    savedFilterSummary: savedFilterBits.length > 0 ? savedFilterBits.join(", ") : null,
    behaviorLearning: behaviorState,
    kundli: { hasDob, hasBirthTime, hasBirthPlace, precision: kundliPrecision },
    nextIntelligenceLayer: intelligence?.progress.nextLayer?.title ?? null,
  };
}

/**
 * The facts as the model sees them.
 *
 * Written as terse labelled lines rather than JSON because every downstream
 * consumer is a language model reading Hinglish, and a JSON blob costs more
 * tokens to say the same thing while inviting the model to quote field names
 * back at the user — the exact bug `deepProfileAnalysis` had to fix in its own
 * prompt ("relocateWilling field khaali hai").
 */
export function formatGrioContext(f: GrioContextFacts): string {
  const lines: string[] = [];

  const askLabel = f.aiAskPerDay === null ? "unlimited" : `${f.aiAskPerDay}/din`;
  lines.push(
    `Plan: ${f.planLabel} — chat ${f.chat ? "khula hai" : "band hai"}, roz ${f.reelPerDay} rishtey, AI sawaal ${askLabel}`,
  );

  const missing = f.missingFields.slice(0, 5).join(", ");
  lines.push(
    `Profile: ${f.profilePercent}% poori, ${f.profileLive ? "live hai" : "abhi live nahi hai"}` +
      (missing ? ` — adhoore: ${missing}` : " — sab bhara hua hai"),
  );

  lines.push(
    f.reelTotal === 0
      ? "Aaj ka reel: abhi khola nahi"
      : `Aaj ka reel: ${f.reelTotal} rishtey, ${f.reelSwiped} dekh liye, ${Math.max(0, f.reelTotal - f.reelSwiped)} baaki`,
  );

  lines.push(
    `Aap par activity: ${f.viewers} logon ne profile dekhi, ${f.shortlisted} ne shortlist kiya, ${f.pendingInterests} interest jawab ka intezaar kar rahe hain`,
  );

  lines.push(
    f.interestsPerMonth === null
      ? `Interest: is mahine ${f.interestsSentThisMonth} bheje (koi limit nahi)`
      : // Cap first, then spend — "50 me se 2 bheje". The two were swapped
        // until 2026-08-07, which handed the model the sentence "2 me se 50
        // bheje" and made it tell users on BASIC their month was exhausted
        // after two interests.
        `Interest: is mahine ${f.interestsPerMonth} me se ${f.interestsSentThisMonth} bheje`,
  );

  lines.push(`Aaye hue sawaal jinka jawab baaki hai: ${f.pendingQuestions}`);

  lines.push(
    f.unreadNotices === 0
      ? "Inbox: kuch naya nahi"
      : `Inbox: ${f.unreadNotices} unread` +
          (f.recentNoticeTitles.length ? ` — ${f.recentNoticeTitles.join(" · ")}` : ""),
  );

  lines.push(`Deep Profile: ${f.deepProfileScored ? "analyze ho chuki hai" : "abhi analyze nahi hui"}`);

  // Absent line, not a "0" line — "aapke paas 0 boost credit hai" invites the
  // model to bring up a credit the user has never heard of.
  if (f.credits.length > 0) {
    lines.push(
      `Kamaye hue credits jo abhi kharch ho sakte hain: ${f.credits
        .map((c) => `${c.label} × ${c.count}`)
        .join(", ")}`,
    );
  }

  lines.push(
    `Verification: mobile ${f.hasMobile ? (f.mobileVerified ? "verified" : "verify nahi hua") : "account me nahi hai"}, ` +
      `email ${f.hasEmail ? (f.emailVerified ? "verified" : "verify nahi hua") : "account me nahi hai"}`,
  );

  lines.push(
    `Advanced Discovery: ${f.advancedDiscoveryEntitled ? "is plan me khula hai" : "is plan me nahi hai (upgrade se khulta hai)"}` +
      (f.advancedDiscoveryEntitled
        ? ` — saved filters: ${f.savedFilterSummary ?? "kuch save nahi kiya"}, behaviour learning: ${
            { active: "chalu hai", collecting: "abhi seekh raha hai", paused: "paused hai", not_entitled: "N/A" }[f.behaviorLearning]
          }`
        : ""),
  );

  lines.push(
    `Kundli readiness: DOB ${f.kundli.hasDob ? "hai" : "nahi hai"}, birth time ${f.kundli.hasBirthTime ? "hai" : "nahi hai"}, ` +
      `birth place ${f.kundli.hasBirthPlace ? "hai" : "nahi hai"} — chart: ${
        { none: "ban hi nahi sakta", "no-time": "sirf Chandra rashi (lagna ke liye time chahiye)", "no-place": "sirf Chandra rashi (lagna ke liye sahi shehar chahiye)", full: "poora chart bana hua hai" }[
          f.kundli.precision
        ]
      }`,
  );

  if (f.nextIntelligenceLayer) {
    lines.push(`Marriage Intelligence ka agla khaali area: ${f.nextIntelligenceLayer}`);
  }

  return lines.join("\n");
}

export async function buildGrioContext(userId: string): Promise<string> {
  return formatGrioContext(await getGrioContextFacts(userId));
}
