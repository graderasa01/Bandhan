/** M01X — User dashboard & trust overview contracts */
import type { EmptyStateModel, UIAction } from "./common";
import type { AIInsightViewModel } from "./ai";
import type { TrustFactor, TrustScoreLabel } from "@/lib/services/trust/trustScoreService";
import type { DemandSnapshot } from "@/lib/services/demand/demandService";
import type { ActivitySnapshot, AdmirerFace } from "@/lib/services/activity/admirerService";
import type { FamilyActivityItem } from "@/lib/services/family/familyService";
import type { RecentVoiceNoteSignal } from "@/lib/services/voice/voiceNoteService";
import type { InboundQuestionView } from "./askBridge";
import type { ConversationViewModel } from "./messages";
import type { NoticeView } from "./notice";
import type { IntelligenceProgress } from "@/lib/services/profile/intelligenceService";

/** Base shape for a match preview card — extended by `MatchCardViewModel` in discovery.ts. */
export type MatchPreviewViewModel = {
  id: string; displayName: string; age: number; city: string;
  education: string; profession: string; trustScore: number | null; verified: boolean;
};

export type UserDashboardViewModel = {
  user: { id: string; displayName: string; role: "USER" };
  profile: { completionPercentage: number; missingFields: string[]; statusLabel: string };
  /**
   * "Bandhan aapko kitna samajhta hai" — deliberately a *different* number from
   * `profile.completionPercentage` above, not a rename of it.
   *
   * Completion answers "can this profile be shown?" and is satisfied by name,
   * age, city and education. Coverage answers "do we know what kind of life
   * this person wants?" — children, joint vs nuclear, money, conflict — and a
   * 100%-complete profile routinely scores zero on it. Collapsing the two into
   * one bar is what let the app believe it understood people it had never
   * asked anything that matters.
   */
  profileIntelligence: IntelligenceProgress;
  trust: {
    score: number | null; label: TrustScoreLabel;
    positiveFactors: TrustFactor[]; improvementFactors: TrustFactor[];
  };
  aiNextStep: AIInsightViewModel;
  reel: { dailyLimit: number; cardCount: number };
  interestsPreview: {
    receivedCount: number;
    sentCount: number;
    /** Last 5 pending senders, most recent first — always identified, see admirerService. */
    recentFaces: AdmirerFace[];
    emptyState: EmptyStateModel;
  };
  /** Reverse matching — how many people this user is a candidate *for*. */
  demand: DemandSnapshot;
  /** Views/shortlists already recorded against this profile. */
  activity: ActivitySnapshot;
  /** "Papa ne Priya ko shortlist ki" — empty when no Family Circle member has acted yet. */
  familyActivity: FamilyActivityItem[];
  /**
   * The *effective* plan, not just the billed one. This used to read only
   * `getActiveSubscription()`, so a plan an admin granted by hand was invisible
   * here — the user's features quietly changed and their own card still said
   * "Free". `source` keeps the grant labelled honestly rather than passing it
   * off as a purchase.
   */
  subscription: {
    currentPlan: string | null;
    status: "NONE" | "ACTIVE" | "EXPIRED";
    source: "BILLED" | "ADMIN_GRANT";
    /** Pre-formatted ("30 Aug 2026"); null when the grant never expires or there is none. */
    grantedUntil: string | null;
    cta: UIAction;
  };
  /** Unplayed only — see getRecentUnplayedVoiceNotes. Feeds the AI Insight banner. */
  voiceNoteSignals: RecentVoiceNoteSignal[];
  /** Pending, unexpired Ask Bridge questions aimed at this user. Feeds the AI Insight banner. */
  inboundQuestions: InboundQuestionView[];
  /** Every match thread, newest first — the AI Insight banner derives both "new message" and "your reply is pending" slides from this one list. */
  conversations: ConversationViewModel[];
  /** Unread REWARD_EARNED notices only — see getUserDashboardData. Feeds the AI Insight banner. */
  rewardNotices: NoticeView[];
  /**
   * Unread admin-authored ANNOUNCEMENT notices (offers, "aaj ye naya hai").
   * Kept separate from `rewardNotices` because they outrank *everything* in
   * the banner, including the AI insight — this is the one slide a human wrote
   * on purpose for this user, and burying it under generated activity would
   * make the whole feature pointless.
   */
  announcements: NoticeView[];
  /** Today's still-unvoted Mindset Arena poll — null when the plan doesn't entitle it or it's already voted. Feeds the AI Insight banner. */
  vibePoll: { id: string; question: string } | null;
  /** Next unanswered Deep Profile gap question — null once every gap field is filled. No plan gate (see dailyQuestions.ts). Feeds the AI Insight banner. */
  gapQuestion: { key: string; question: string } | null;
  /** The dashboard's one compact Advanced Discovery surface — see `SmartMatchesCard`. */
  smartMatches: {
    entitled: boolean;
    reelCount: number;
    filterMode: "FLEXIBLE" | "STRICT";
    behaviorState: "paused" | "collecting" | "active" | "not_entitled";
  };
};
