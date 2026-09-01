import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";
import type { UserDashboardViewModel } from "@/lib/contracts/userDashboard";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { buildIntelligenceState, type IntelligenceProgress } from "@/lib/services/profile/intelligenceService";
import { computeTrustScore } from "@/lib/services/trust/trustScoreService";
import { getOrCreateTodayReel } from "@/lib/services/match/reelGenerator";
import { getDemandSnapshot } from "@/lib/services/demand/demandService";
import { getActivitySnapshot, getRecentInterestFaces } from "@/lib/services/activity/admirerService";
import { getRecentFamilyActivity } from "@/lib/services/family/familyService";
import { getRecentUnplayedVoiceNotes } from "@/lib/services/voice/voiceNoteService";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getConversationsData } from "@/lib/data/messagesData";
import { getNotices } from "@/lib/services/notice/noticeService";
import { getTodayPollView } from "@/lib/services/vibe/pollService";
import { getGapQuestion } from "@/lib/services/deepProfile/deepProfileService";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getPlanCatalog, planNameOf } from "@/lib/services/plans/planCatalog";
import { noopT, type Translate } from "@/lib/i18n/translate";
import { getDiscoverySettings } from "@/lib/services/discovery/discoverySettingsService";
import { buildLearnedBehaviorProfile, summarizeBehaviorLearning } from "@/lib/services/discovery/behaviorLearning";

/**
 * M01D1 §5.4 — deterministic, not an AI call; code decides, per D-32.
 *
 * The completion ladder below is unchanged: while required fields are still
 * missing, filling them is genuinely the next thing. What changed is what
 * happens at the top of that ladder. "Aapki profile poori hai" used to be the
 * terminal state, which is precisely the lie this whole layer exists to stop —
 * a complete profile is where the app *starts* knowing someone, not where it
 * finishes. So a 100%-complete profile with an unanswered intelligence layer
 * gets pointed at that layer instead of at "explore matches".
 */
function aiNextStep(
  completionPercent: number,
  intelligence: IntelligenceProgress,
  t: Translate = noopT,
): UserDashboardViewModel["aiNextStep"] {
  if (completionPercent < 30) {
    return {
      id: "next-basic",
      tone: "info",
      title: t("dashboard.nextStep.basic.title", "Basic Details Start Karein"),
      message: t(
        "dashboard.nextStep.basic.message",
        "Naam, umar, height jaisi zaroori baatein bata dijiye — bas do minute ka kaam hai.",
      ),
      ctaLabel: t("dashboard.nextStep.basic.cta", "Bol Kar Shuru Karein"),
      ctaActionId: "/profile/build",
    };
  }
  if (completionPercent < 70) {
    return {
      id: "next-family",
      tone: "info",
      title: t("dashboard.nextStep.family.title", "Family Details Aur Partner Preferences Add Karein"),
      message: t(
        "dashboard.nextStep.family.message",
        "Ye baatein aapke matches ki quality seedha improve karti hain.",
      ),
      ctaLabel: t("dashboard.nextStep.family.cta", "Aage Badhein"),
      ctaActionId: "/profile/build",
    };
  }
  if (completionPercent < 100) {
    return {
      id: "next-photo",
      tone: "warning",
      title: t("dashboard.nextStep.photo.title", "Photo Add Karein"),
      message: t(
        "dashboard.nextStep.photo.message",
        "Photo add karne se trust score badhta hai aur profile complete lagti hai.",
      ),
      ctaLabel: t("dashboard.nextStep.photo.cta", "Photo Add Karein"),
      ctaActionId: "/profile/build",
    };
  }
  const layer = intelligence.nextLayer;
  if (layer) {
    const remaining = layer.total - layer.answered;
    return {
      id: `next-intelligence-${layer.slug}`,
      tone: "info",
      title: layer.title,
      message: `${remaining} chhote sawaal · ~${layer.estimatedMinutes} minute. ${layer.unlocks}.`,
      ctaLabel: t("dashboard.nextStep.intelligence.cta", "Answer Questions"),
      ctaActionId: `/user/profile/intelligence/${layer.slug}`,
    };
  }

  return {
    id: "next-explore",
    tone: "success",
    title: t("dashboard.nextStep.explore.title", "Matches Explore Karein"),
    message: t("dashboard.nextStep.explore.message", "Aapki profile poori hai — roz ke rishte dekhna shuru kariye."),
    ctaLabel: t("dashboard.nextStep.explore.cta", "Rishta Reel Kholein"),
    ctaActionId: "/user/reel",
  };
}

export async function getUserDashboardData(user: User, t: Translate = noopT): Promise<UserDashboardViewModel> {
  const profile = await getOrCreateProfile(user.id);
  const { percent, missingFields, isLive } = computeCompletion(profile);
  const trust = computeTrustScore(user, profile, t);

  if (trust.trustScore !== profile.trustScore || trust.scoreLabel !== profile.trustScoreLabel) {
    await prisma.profile.update({
      where: { id: profile.id },
      data: { trustScore: trust.trustScore, trustScoreLabel: trust.scoreLabel },
    });
  }

  const [
    receivedCount,
    sentCount,
    recentInterestFaces,
    reel,
    demand,
    activity,
    familyActivity,
    planCtx,
    voiceNoteSignals,
    inboundQuestions,
    conversations,
    notices,
    arenaGate,
    gapQuestionDef,
    intelligence,
  ] = await Promise.all([
    // Withdrawn interests are out of both counts: the recipient was never
    // meant to know it existed, and the sender took it back.
    prisma.interest.count({ where: { toUserId: user.id, status: { not: "WITHDRAWN" } } }),
    prisma.interest.count({ where: { fromUserId: user.id, status: { not: "WITHDRAWN" } } }),
    getRecentInterestFaces(user.id),
    isLive ? getOrCreateTodayReel(user.id) : Promise.resolve(null),
    getDemandSnapshot(profile, t),
    getActivitySnapshot(user.id, profile.id),
    getRecentFamilyActivity(user.id, 3, t),
    // Not `getActiveSubscription` alone any more: that only knows what was
    // *paid for*, so an admin-granted plan never reached this card.
    getPlanContext(user.id),
    getRecentUnplayedVoiceNotes(user.id, 3, t),
    getInboundQuestions(user.id, t),
    getConversationsData(user.id),
    getNotices(user.id, 20),
    isFeatureAvailable(user.id, "mindsetArena"),
    getGapQuestion(user.id),
    // Takes the already-loaded profile rather than re-reading it: this is one
    // extra indexed query on `profile_signal_answers`, and the derived answers
    // (old fields that already answer a layer question) are computed in memory.
    buildIntelligenceState(profile),
  ]);

  // Reward notices are a one-time announcement, not an ongoing state like a
  // voice note (playedAt) or a chat reply (last sender) — so unlike those,
  // "unread" is the right unactioned signal here, not a staleness risk.
  const rewardNotices = notices.filter((n) => n.kind === "REWARD_EARNED" && !n.read);
  // Same "unread is the unactioned signal" rule as rewards above. Capped at 2
  // so a run of announcements can't push every real signal off the carousel.
  const announcements = notices.filter((n) => n.kind === "ANNOUNCEMENT" && !n.read).slice(0, 2);

  // Same sequencing as /user/vibe (app/user/vibe/page.tsx): the poll fetch
  // itself needs to know the gate's already-resolved result, so it can't
  // join the big Promise.all above — only fetched at all when the plan
  // actually entitles it.
  const poll = arenaGate.allowed ? await getTodayPollView(user.id, t) : null;

  // Same gating discipline as everywhere else this pair is read together —
  // only queried at all for an entitled user.
  const smartMatches = planCtx.features.advancedDiscovery
    ? await (async () => {
        const [discoverySettings, behaviorProfile] = await Promise.all([
          getDiscoverySettings(user.id),
          buildLearnedBehaviorProfile(user.id).catch(() => null),
        ]);
        return {
          entitled: true as const,
          reelCount: reel?.candidates.length ?? 0,
          filterMode: discoverySettings.filterMode,
          behaviorState: summarizeBehaviorLearning({
            enabled: discoverySettings.behaviorLearningEnabled,
            profile: behaviorProfile,
            sampleSize: 0,
            positiveCount: 0,
          }).state,
        };
      })()
    : { entitled: false as const, reelCount: reel?.candidates.length ?? 0, filterMode: "FLEXIBLE" as const, behaviorState: "not_entitled" as const };

  // CANCELLED-but-still-in-period reads as ACTIVE here — this summary card's
  // type has no third state, and "still have access" is the fact that matters
  // at a glance. /user/subscription shows the cancelled nuance in full.
  //
  // "Have a plan" now means the *effective* plan is above FREE, so an admin
  // grant lights this card up exactly like a purchase does — with `source`
  // telling the card which of the two it is.
  const hasPlan = planCtx.effectivePlanCode !== "FREE";
  const subscriptionStatus: "NONE" | "ACTIVE" | "EXPIRED" = hasPlan ? "ACTIVE" : "NONE";

  return {
    user: { id: user.id, displayName: user.fullName, role: "USER" },
    profile: { completionPercentage: percent, missingFields, statusLabel: profile.profileStatus },
    profileIntelligence: intelligence.progress,
    trust: {
      score: trust.trustScore,
      label: trust.scoreLabel,
      positiveFactors: trust.positiveFactors,
      improvementFactors: trust.improvementFactors,
    },
    aiNextStep: aiNextStep(percent, intelligence.progress, t),
    reel: { dailyLimit: reel?.dailyLimit ?? 5, cardCount: reel?.candidates.length ?? 0 },
    demand,
    activity,
    familyActivity,
    interestsPreview: {
      receivedCount,
      sentCount,
      recentFaces: recentInterestFaces,
      emptyState: {
        title: t("dashboard.interests.emptyTitle", "Abhi koi interest nahi aaya hai."),
        description: t(
          "dashboard.interests.emptyDescription",
          "Profile complete aur trust score improve karne par matches aur interests improve honge.",
        ),
      },
    },
    subscription: {
      currentPlan: planNameOf(await getPlanCatalog(), planCtx.effectivePlanCode),
      status: subscriptionStatus,
      source: planCtx.planSource,
      grantedUntil:
        planCtx.grantExpiresAt?.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }) ?? null,
      cta: {
        label:
          subscriptionStatus === "ACTIVE"
            ? t("dashboard.subscription.managePlan", "Manage Plan")
            : t("dashboard.subscription.viewPlans", "View Plans"),
        href: "/user/subscription",
      },
    },
    voiceNoteSignals,
    inboundQuestions,
    conversations,
    rewardNotices,
    announcements,
    vibePoll: poll && poll.votedOptionIndex === null ? { id: poll.id, question: poll.question } : null,
    gapQuestion: gapQuestionDef ? { key: gapQuestionDef.key, question: gapQuestionDef.question } : null,
    smartMatches,
  };
}
