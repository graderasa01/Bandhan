import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileText, Film, Heart, Sparkles, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { getUserDashboardData } from "@/lib/data/userDashboardData";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getCircleTeaser } from "@/lib/services/circle/circleService";
import UserShell from "@/components/layout/UserShell";
import ProfileGate from "@/components/user/ProfileGate";
import ProfileCompletionCard from "@/components/profile/ProfileCompletionCard";
import ProfileOverviewCard from "@/components/profile/ProfileOverviewCard";
import TrustScoreCard from "@/components/profile/TrustScoreCard";
import AIInsightBanner, { type ActivityInsightSlide } from "@/components/profile/AIInsightBanner";
import AINextStepCard from "@/components/profile/AINextStepCard";
import SubscriptionStatusCard from "@/components/profile/SubscriptionStatusCard";
import DemandMeterCard from "@/components/user/DemandMeterCard";
import ProfileActivityCard from "@/components/user/ProfileActivityCard";
import IncognitoToggle from "@/components/profile/IncognitoToggle";
import { getIncognitoSetting } from "@/lib/services/profile/incognitoService";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import FamilyActivityCard from "@/components/user/FamilyActivityCard";
import CircleDashboardBanner from "@/components/circle/CircleDashboardBanner";
import CountUp from "@/components/ui/CountUp";
import type { User } from "@prisma/client";
import type { UserDashboardViewModel } from "@/lib/contracts/userDashboard";

export default async function UserDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/dashboard");

  const profile = await getOrCreateProfile(user.id);
  const { isLive, stage1MissingFields, stage1Progress } = computeCompletion(profile);

  return (
    <UserShell userName={user.fullName}>
      {/* Stage 1 incomplete → the one thing that unblocks everything, instead
          of an empty dashboard that teaches the product is empty. */}
      <ProfileGate live={isLive} missingFields={stage1MissingFields} progress={stage1Progress}>
        <DashboardContent user={user} />
      </ProfileGate>
    </UserShell>
  );
}

/** Deterministic, real-data sentence — never an invented AI claim (D-32: code decides). */
function buildAIInsight(reelCardCount: number, trustScore: number | null, completionPercent: number): string {
  if (reelCardCount > 0) {
    return `Aapke profile ke aadhar par AI ne aaj ${reelCardCount} naye rishte match kiye hain.`;
  }
  if (completionPercent < 100) {
    return `Profile ${completionPercent}% complete hai — baaki bharte hi AI aapke liye rishte dhoondhna shuru kar dega.`;
  }
  if (trustScore !== null && trustScore < 60) {
    return "Trust score badhane se aapko behtar quality ke matches milna shuru honge.";
  }
  return "Aapki profile poori aur verified hai — roz naye rishte check karte rahiye.";
}

/** "2 ghante pehle" style — computed server-side (once, at request time) so it never
 *  mismatches between server render and client hydration the way a client-computed
 *  "now" would. */
function timeAgo(d: Date): string {
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "Abhi";
  if (minutes < 60) return `${minutes} min pehle`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ghante pehle`;
  return `${Math.floor(hours / 24)} din pehle`;
}

/**
 * The AI Insight banner's slide list — slide 0 is always the existing
 * deterministic sentence (unchanged default), followed by real activity in
 * three priority tiers:
 *
 * 1. Unactioned, high-signal — nobody has looked at these yet, so they lead:
 *    a pending Interest (strongest, most reciprocal — someone directed a
 *    proposal at you), an unplayed voice note (costs the sender an Interest
 *    too, see voiceNoteService — this also covers "your question got
 *    answered", since the answer itself arrives as a voice note with
 *    context QUESTION_ANSWER), a pending Ask Bridge question, an unread chat
 *    message, an unclaimed quest reward (least reciprocal of the five, so it
 *    goes last within this tier); then the Vibe Hub's daily gap question and
 *    Mindset Arena poll (2026-08-03) — evergreen, self-directed, no one
 *    waiting on the other end, so they trail the real reciprocal signals but
 *    still rank above the passive tiers below.
 * 2. Seen, but no reaction yet — a thread the user has read but never
 *    replied to. Same fact ghostingShieldService's CHAT_NUDGE notice nudges
 *    on, recomputed here from live Message rows instead of read back from
 *    that notice, so a reply sent afterwards can never leave a stale slide.
 * 3. Passive, lower-priority activity — shortlist and profile-view, which
 *    need no reply. A profile view is the broadest/weakest signal (it
 *    includes rejected swipes — see admirerService's module docstring, which
 *    is also why it's gated behind the stricter Premium-only entitlement).
 *
 * Locked slides still appear (blurred face, Lock icon) rather than being
 * omitted — hiding them would make the upgrade invisible instead of tempting.
 */
function buildActivitySlides(data: UserDashboardViewModel, insightText: string): ActivityInsightSlide[] {
  const slides: ActivityInsightSlide[] = [
    { id: "insight", kind: "insight", icon: "sparkles", text: insightText },
  ];

  // Tier 1 — unactioned, high-signal, newest first within each type.
  for (const f of data.interestsPreview.recentFaces.slice(0, 3)) {
    slides.push({
      id: `interest-${f.key}`,
      kind: "activity",
      icon: "heart",
      text: `${f.displayName ?? "Kisi ne"} ne aapko Interest bheja hai.`,
      at: timeAgo(f.at),
      href: "/user/interests",
      avatar: { name: f.displayName ?? "?", photoUrl: f.photoUrl },
    });
  }

  for (const v of data.voiceNoteSignals.slice(0, 2)) {
    slides.push({
      id: `voice-${v.id}`,
      kind: "activity",
      icon: "mic",
      text: v.isAnswer
        ? "Aapke sawaal ka jawab voice me aa gaya hai."
        : `${v.teaser} ne aapko voice note bheji hai.`,
      at: timeAgo(v.createdAt),
      href: "/user/inbox",
    });
  }

  for (const q of data.inboundQuestions.slice(0, 2)) {
    slides.push({
      id: `question-${q.id}`,
      kind: "activity",
      icon: "question",
      text: `${q.teaser} ne aapse ek sawaal poocha hai.`,
      at: timeAgo(new Date(q.createdAt)),
      href: "/user/inbox",
    });
  }

  const unreadThreads = data.conversations.filter((c) => c.unreadCount > 0);
  for (const c of unreadThreads.slice(0, 2)) {
    slides.push({
      id: `message-${c.matchId}`,
      kind: "activity",
      icon: "message",
      text: `${c.other.displayName} ne aapko ${c.unreadCount > 1 ? `${c.unreadCount} messages` : "message"} bheja hai.`,
      at: timeAgo(new Date(c.updatedAt)),
      href: `/user/messages/${c.matchId}`,
      avatar: { name: c.other.displayName, photoUrl: c.other.photoUrl },
    });
  }

  // A quest reward — least reciprocal of the tier-1 signals (nobody's
  // waiting on a reply), so it goes last among them.
  for (const n of data.rewardNotices.slice(0, 2)) {
    slides.push({
      id: `reward-${n.id}`,
      kind: "activity",
      icon: "reward",
      text: `${n.title} — ${n.body}`,
      at: timeAgo(new Date(n.createdAt)),
      href: n.href ?? "/user/inbox",
    });
  }

  // Tier 1b — self-directed, evergreen: unlike tier 1 above, nobody *did*
  // anything, but there's always something the user can answer right now to
  // deepen their own profile (the Vibe Hub poll and Deep Profile's gap
  // question, both from `/user/vibe`). Ranked just under real people's
  // activity for the same reason quest rewards are — there's no one on the
  // other end waiting.
  if (data.gapQuestion) {
    slides.push({
      id: `gap-question-${data.gapQuestion.key}`,
      kind: "activity",
      icon: "question",
      text: `Aaj ka sawaal: "${data.gapQuestion.question}" — jawab dekar profile aur gehri banayein.`,
      href: "/user/vibe",
    });
  }
  if (data.vibePoll) {
    slides.push({
      id: `vibe-poll-${data.vibePoll.id}`,
      kind: "activity",
      icon: "question",
      text: `Aaj ka Mindset Arena poll: "${data.vibePoll.question}" — vote karke dusron ki soch dekhein.`,
      href: "/user/vibe",
    });
  }

  // Tier 2 — read already, reply still pending.
  const awaitingReply = data.conversations.filter(
    (c) => c.unreadCount === 0 && c.lastMessage !== null && c.lastMessage.senderId !== data.user.id,
  );
  for (const c of awaitingReply.slice(0, 2)) {
    slides.push({
      id: `reply-${c.matchId}`,
      kind: "activity",
      icon: "message",
      text: `${c.other.displayName} ka jawab abhi baaki hai — ek chhota sa reply rishta aage badha sakta hai.`,
      at: timeAgo(new Date(c.updatedAt)),
      href: `/user/messages/${c.matchId}`,
      avatar: { name: c.other.displayName, photoUrl: c.other.photoUrl },
    });
  }

  // Tier 3 — passive, lower priority, unchanged from before.
  if (data.activity.shortlisted > 0) {
    if (data.activity.canSeeIdentity) {
      for (const f of data.activity.faces.slice(0, 2)) {
        slides.push({
          id: `shortlist-${f.key}`,
          kind: "activity",
          icon: "bookmark",
          text: `${f.displayName ?? "Kisi ne"} ne aapko shortlist kiya hai.`,
          at: timeAgo(f.at),
          href: `/user/profile/${f.profileId}`,
          avatar: { name: f.displayName ?? "?", photoUrl: f.photoUrl },
        });
      }
    } else {
      const n = data.activity.shortlisted;
      slides.push({
        id: "shortlist-locked",
        kind: "activity",
        icon: "bookmark",
        text: `${n === 1 ? "Ek vyakti ne" : `${n} logon ne`} aapko shortlist kiya hai. Naam dekhne ke liye plan upgrade karein.`,
        href: "/user/subscription",
        locked: true,
      });
    }
  }

  if (data.activity.viewers > 0) {
    if (data.activity.canSeeViewerIdentity) {
      for (const f of data.activity.viewerFaces.slice(0, 2)) {
        slides.push({
          id: `viewer-${f.key}`,
          kind: "activity",
          icon: "eye",
          text: `${f.displayName ?? "Kisi ne"} ne aapki profile dekhi hai.`,
          at: timeAgo(f.at),
          href: `/user/profile/${f.profileId}`,
          avatar: { name: f.displayName ?? "?", photoUrl: f.photoUrl },
        });
      }
    } else {
      const n = data.activity.viewers;
      slides.push({
        id: "viewer-locked",
        kind: "activity",
        icon: "eye",
        text: `${n === 1 ? "Ek vyakti ne" : `${n} logon ne`} aapki profile dekhi hai. Naam dekhne ke liye plan upgrade karein.`,
        href: "/user/subscription",
        locked: true,
      });
    }
  }

  return slides;
}

async function DashboardContent({ user }: { user: User }) {
  const data = await getUserDashboardData(user);
  const { profile, trust, aiNextStep, reel, interestsPreview, subscription, demand, activity, familyActivity } = data;
  const insight = buildAIInsight(reel.cardCount, trust.score, profile.completionPercentage);
  const slides = buildActivitySlides(data, insight);

  // Phase F entry point. `getCircleTeaser` is also what advances the event's
  // lazy clock on dashboard traffic — see its docstring for why that matters
  // more than it looks.
  const circleGate = await isFeatureAvailable(user.id, "seriousCircle");
  const circleTeaser = circleGate.allowed ? await getCircleTeaser(user.id) : null;

  // Sits with the activity card rather than in a settings page: this switch is
  // only legible next to the "Viewed You" number it changes, in both
  // directions (see IncognitoToggle).
  const [incognitoEnabled, entitlements] = await Promise.all([
    getIncognitoSetting(user.id),
    getEntitlements(user.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* No subtitle here on purpose — a returning user doesn't need "manage
          your profile from here" spelled out every visit, and the Insight
          banner right below it already says something real and new. */}
      <section className="mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-accent-text sm:text-3xl">
          Namaste, {user.fullName}
        </h1>
      </section>

      <AIInsightBanner slides={slides} />

      {/* Hero — the reel teaser replaces the old "New Matches" grid */}
      <Link
        href="/user/reel"
        className="group relative mb-6 block overflow-hidden rounded-lg border border-hero-border bg-grad-hero p-6 text-hero-fg shadow-lg transition-transform hover:-translate-y-0.5 sm:p-8"
      >
        <div
          aria-hidden
          className="absolute -right-10 -top-10 size-40 rounded-full bg-primary/20 blur-2xl transition-opacity group-hover:opacity-80"
        />
        <div className="relative flex items-center gap-5">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-b from-primary to-primary-hover text-primary-fg shadow-gold">
            <Film className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-display)] text-xl font-bold sm:text-2xl">
              Aaj ke <CountUp value={reel.cardCount} /> rishtey ready hain
            </p>
            <p className="mt-1 text-sm text-hero-fg-muted">
              AI ne aapke liye chuni hain — swipe karke dekhiye
            </p>
          </div>
          <ArrowRight className="size-6 shrink-0 text-hero-icon transition-transform group-hover:translate-x-1" />
        </div>
      </Link>

      {/* Directly under the reel, not lower down: the reel is the daily loop and
          the Circle is the twice-weekly one, so they belong next to each other.
          Buried below the fold it would be a feature nobody discovers. */}
      {circleTeaser && <CircleDashboardBanner teaser={circleTeaser} />}

      {/* The two panels built on data the app already had — how many people can
          find you, and who has already reacted to you. */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DemandMeterCard demand={demand} />
        <div>
          <ProfileActivityCard activity={activity} />
          <IncognitoToggle initialEnabled={incognitoEnabled} allowed={entitlements.incognitoBrowse} />
        </div>
      </div>

      {familyActivity.length > 0 && (
        <div className="mb-6">
          <FamilyActivityCard items={familyActivity} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfileCompletionCard percentage={profile.completionPercentage} missingFields={profile.missingFields} />
        <TrustScoreCard
          score={trust.score}
          scoreLabel={trust.label}
          positiveFactors={trust.positiveFactors}
          improvementFactors={trust.improvementFactors}
        />
      </div>

      <div className="mb-6">
        <AINextStepCard data={aiNextStep} />
      </div>

      <div className="mb-6">
        <ProfileOverviewCard />
      </div>

      {/* Quick Actions — these three used to be full-width cards, each
          re-explaining itself in a full sentence on every single visit.
          A user who's been here before doesn't need "PDF for WhatsApp"
          spelled out daily; icon + label is the whole idea, and three of
          them side by side reads as one deliberate shelf instead of three
          separate blocks of scroll. */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <QuickAction href="/user/biodata" icon={FileText} label="Biodata PDF" />
        <QuickAction href="/user/deep-profile" icon={Sparkles} label="Deep Profile" />
        <QuickAction
          href="/user/interests"
          icon={Heart}
          label="Interests"
          badge={interestsPreview.receivedCount > 0 ? interestsPreview.receivedCount : undefined}
        />
      </div>

      <section className="mb-6">
        <SubscriptionStatusCard currentPlan={subscription.currentPlan} status={subscription.status} cta={subscription.cta} />
      </section>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Real count only — omitted entirely rather than shown as 0 (D-32: no invented urgency). */
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col items-center gap-2 rounded-lg border border-line bg-surface px-2 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md sm:px-3"
    >
      {badge !== undefined && (
        <span className="absolute right-2 top-2 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-semibold leading-5 text-accent-fg">
          {badge}
        </span>
      )}
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/40 bg-gradient-to-br from-primary/10 to-surface text-primary-text transition-colors group-hover:from-primary/20">
        <Icon className="size-5" />
      </span>
      <span className="text-[0.8125rem] font-semibold leading-tight text-accent-text">{label}</span>
    </Link>
  );
}
