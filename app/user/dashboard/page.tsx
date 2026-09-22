import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Film, Sparkles, User as UserIcon } from "lucide-react";
import { LeafSpray, RuleMotif } from "@/components/public/_shared/Ornaments";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { activateIfReady } from "@/lib/services/profile/readinessService";
import { getUserDashboardData } from "@/lib/data/userDashboardData";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getCircleTeaser } from "@/lib/services/circle/circleService";
import { GAP_QUESTIONS } from "@/lib/profile/dailyQuestions";
import UserShell from "@/components/layout/UserShell";
import ProfileGate from "@/components/user/ProfileGate";
import type { ActivityInsightSlide } from "@/components/profile/AIInsightBanner";
import FamilyActivityCard from "@/components/user/FamilyActivityCard";
import CircleDashboardBanner from "@/components/circle/CircleDashboardBanner";
import TodayPriorities from "@/components/user/TodayPriorities";
import ProfileLiveBanner from "@/components/user/ProfileLiveBanner";
import RishtaStatusRows from "@/components/user/RishtaStatusRows";
import OneQuestionCard from "@/components/user/OneQuestionCard";
import { buildTodayBoard, PRIORITY_TIERS, type PriorityTier } from "@/lib/services/today/priorityEngine";
import CountUp from "@/components/ui/CountUp";
import type { User } from "@prisma/client";
import type { UserDashboardViewModel } from "@/lib/contracts/userDashboard";

export default async function UserDashboard({
  searchParams,
}: {
  searchParams?: Promise<{ profile?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/dashboard");

  const profile = await getOrCreateProfile(user.id);
  // Server-authoritative, and self-healing: `activateIfReady` is the one place
  // a profile becomes live, so running it here means the dashboard gate and the
  // database can never disagree about whether this account is visible.
  const { view } = await activateIfReady(user.id, profile);
  const isLive = view.activatedOnServer;

  // `?profile=live` is what the profile builder redirects to the moment the
  // server confirms the profile — read here, once, so the banner is a
  // per-request decision and never flashes in on a refresh. Only honoured when
  // the profile really is live: the flag is a hint, the database is the fact.
  const params = searchParams ? await searchParams : {};
  const justWentLive = isLive && params.profile === "live";

  return (
    <UserShell userName={user.fullName}>
      {/* Stage 1 incomplete → the one thing that unblocks everything, instead
          of an empty dashboard that teaches the product is empty. */}
      <ProfileGate
        live={isLive}
        blockers={view.readiness.blockers}
        progress={{ done: view.readiness.done, total: view.readiness.total }}
      >
        <DashboardContent user={user} justWentLive={justWentLive} />
      </ProfileGate>
    </UserShell>
  );
}

/** "2 ghante pehle" style — computed server-side (once, at request time) so it never
 *  mismatches between server render and client hydration the way a client-computed
 *  "now" would. */
function timeAgo(d: Date, t: Translate): string {
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return t("userPage.dashboard.timeNow", "Abhi");
  if (minutes < 60) return `${minutes}${t("userPage.dashboard.timeMin", " min pehle")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("userPage.dashboard.timeHours", " ghante pehle")}`;
  return `${Math.floor(hours / 24)}${t("userPage.dashboard.timeDays", " din pehle")}`;
}

/**
 * The "Mere rishte" rows — real activity, ranked in three priority tiers
 * (`RishtaStatusRows` shows the top three; the deterministic "AI insight"
 * sentence that used to lead this list is gone — it restated the reel hero):
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
function buildActivitySlides(data: UserDashboardViewModel, t: Translate): ActivityInsightSlide[] {
  const slides: ActivityInsightSlide[] = [];

  // Tier 0 — an admin wrote this, for this user, today. An offer is a
  // one-time thing someone chose to say, so it leads.
  for (const n of data.announcements) {
    slides.push({
      id: `announcement-${n.id}`,
      kind: "activity",
      icon: "announcement",
      text: `${n.title} — ${n.body}`,
      at: timeAgo(new Date(n.createdAt), t),
      href: n.href ?? "/user/inbox",
    });
  }

  // Tier 1 — unactioned, high-signal, newest first within each type.
  for (const f of data.interestsPreview.recentFaces.slice(0, 3)) {
    slides.push({
      id: `interest-${f.key}`,
      kind: "activity",
      icon: "heart",
      text: `${f.displayName ?? t("userPage.dashboard.someone", "Kisi ne")}${t("userPage.dashboard.sentYouInterest", " ne aapko Interest bheja hai.")}`,
      at: timeAgo(f.at, t),
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
        ? t("userPage.dashboard.answerInVoice", "Aapke sawaal ka jawab voice me aa gaya hai.")
        : `${v.teaser}${t("userPage.dashboard.sentYouVoiceNote", " ne aapko voice note bheji hai.")}`,
      at: timeAgo(v.createdAt, t),
      href: "/user/inbox",
    });
  }

  for (const q of data.inboundQuestions.slice(0, 2)) {
    slides.push({
      id: `question-${q.id}`,
      kind: "activity",
      icon: "question",
      text: `${q.teaser}${t("userPage.dashboard.askedYouQuestion", " ne aapse ek sawaal poocha hai.")}`,
      at: timeAgo(new Date(q.createdAt), t),
      href: "/user/inbox",
    });
  }

  const unreadThreads = data.conversations.filter((c) => c.unreadCount > 0);
  for (const c of unreadThreads.slice(0, 2)) {
    slides.push({
      id: `message-${c.matchId}`,
      kind: "activity",
      icon: "message",
      text: `${c.other.displayName}${t("userPage.dashboard.sentYouPre", " ne aapko ")}${
        c.unreadCount > 1 ? `${c.unreadCount} messages` : t("userPage.dashboard.aMessage", "message")
      }${t("userPage.dashboard.sentYouPost", " bheja hai.")}`,
      at: timeAgo(new Date(c.updatedAt), t),
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
      at: timeAgo(new Date(n.createdAt), t),
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
      text: `${t("userPage.dashboard.gapQuestionPre", 'Aaj ka sawaal: "')}${data.gapQuestion.question}${t("userPage.dashboard.gapQuestionPost", '" — jawab dekar profile aur gehri banayein.')}`,
      href: "/user/vibe",
    });
  }
  if (data.vibePoll) {
    slides.push({
      id: `vibe-poll-${data.vibePoll.id}`,
      kind: "activity",
      icon: "question",
      text: `${t("userPage.dashboard.vibePollPre", 'Aaj ka Mindset Arena poll: "')}${data.vibePoll.question}${t("userPage.dashboard.vibePollPost", '" — vote karke dusron ki soch dekhein.')}`,
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
      text: `${c.other.displayName}${t("userPage.dashboard.awaitingReply", " ka jawab abhi baaki hai — ek chhota sa reply rishta aage badha sakta hai.")}`,
      at: timeAgo(new Date(c.updatedAt), t),
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
          text: `${f.displayName ?? t("userPage.dashboard.someone", "Kisi ne")}${t("userPage.dashboard.shortlistedYou", " ne aapko shortlist kiya hai.")}`,
          at: timeAgo(f.at, t),
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
        text: `${n === 1 ? t("userPage.dashboard.onePerson", "Ek vyakti ne") : `${n}${t("userPage.dashboard.nPeople", " logon ne")}`}${t("userPage.dashboard.shortlistedYouLockedPass", " aapko shortlist kiya hai. Naam Rishta Pass me dikhte hain.")}`,
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
          text: `${f.displayName ?? t("userPage.dashboard.someone", "Kisi ne")}${t("userPage.dashboard.viewedYou", " ne aapki profile dekhi hai.")}`,
          at: timeAgo(f.at, t),
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
        text: `${n === 1 ? t("userPage.dashboard.onePerson", "Ek vyakti ne") : `${n}${t("userPage.dashboard.nPeople", " logon ne")}`}${t("userPage.dashboard.viewedYouLockedPass", " aapki profile dekhi hai. Naam Rishta Pass me dikhte hain.")}`,
        href: "/user/subscription",
        locked: true,
      });
    }
  }

  return slides;
}

/**
 * Priorities that outrank today's reel. Only one of these earns the top slot
 * on the dashboard — a pending Interest, an unread message, a live Circle
 * window — because for everyone else the reel *is* the action, and a second
 * "what to do" block above it would just be the reel card saying "open the
 * reel" one more time.
 */
const ABOVE_REEL = new Set<PriorityTier>(
  PRIORITY_TIERS.slice(0, PRIORITY_TIERS.indexOf("P4_TODAY_REEL")),
);

async function DashboardContent({ user, justWentLive }: { user: User; justWentLive: boolean }) {
  const t = await getT();

  // These three ask the database three unrelated questions — the dashboard's
  // own data, whether this plan includes Serious Circle, and today's priority
  // board — and none of them needs another's answer. Awaited one after the
  // other they cost three round trips end to end; issued together they cost
  // one. The database is in another region, so a round trip here is tens of
  // milliseconds, not the sub-millisecond it would be next door, and this
  // page is the app's front door.
  //
  // `buildTodayBoard` keeps its own catch: best-effort, like every other
  // optional block here — a dashboard that 500s because one count query
  // hiccuped is worse than one that renders without its priority rail. The
  // catch has to sit on the individual promise rather than around the group,
  // or one failing rail would take the whole page's data down with it.
  const [data, circleGate, todayBoard] = await Promise.all([
    getUserDashboardData(user, t),
    // Phase F entry point.
    isFeatureAvailable(user.id, "seriousCircle"),
    buildTodayBoard(user.id, {}, t).catch((err) => {
      console.error("[today] board failed:", err instanceof Error ? err.message : String(err));
      return { priorities: [], roster: null, selfKnowledge: null };
    }),
  ]);

  const { profile, reel, familyActivity } = data;
  const slides = buildActivitySlides(data, t);

  // Genuinely sequential — there is no teaser to fetch until the gate says
  // this account can see one. `getCircleTeaser` is also what advances the
  // event's lazy clock on dashboard traffic — see its docstring for why that
  // matters more than it looks.
  const circleTeaser = circleGate.allowed ? await getCircleTeaser(user.id) : null;
  const urgent = todayBoard.priorities.find((p) => ABOVE_REEL.has(p.tier)) ?? null;

  // The day's one optional question: `userDashboardData` picks the first
  // unanswered key, the catalog supplies its tappable options.
  const gapKey = data.gapQuestion?.key ?? null;
  const gapQuestion = gapKey ? (GAP_QUESTIONS.find((q) => q.key === gapKey) ?? null) : null;

  return (
    /*
     * Today, action-first.
     *
     * The first viewport answers one question — "what should I do now?" —
     * with at most three modules:
     *
     *   1. the one thing that outranks the reel, if there is one
     *      (a pending Interest, an unread message — `ABOVE_REEL`)
     *   2. today's rishtey (the reel hero — for most people, the action)
     *   3. "Mere rishte" — up to three one-line status rows
     *
     * Then, below: the Circle window on the days it exists, one optional
     * question, family activity when there is any, and a single row of links
     * to the hubs that own everything else. Trust score, profile
     * intelligence, the demand meter, subscription, biodata, deep profile,
     * the next-step card and the profile overview all moved to `/user/me` —
     * each is a fine card, and together on this page they were a wall.
     */
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      {/* The greeting is the page's title, so it gets a title's ruling — the
          motif and a hairline fading out to the right, the way a name is set
          at the head of an invitation. Wine, not foil: a person's own name has
          to be crisp, and the foil's light stops sit near 1.2:1 on cream. */}
      <div>
        <h1 className="bt-display text-[1.75rem] leading-tight sm:text-[2.1rem]">
          {t("userPage.dashboard.greeting", "Namaste")}, {user.fullName}
        </h1>
        <div className="bt-rule bt-rule--left mt-2.5" aria-hidden>
          <RuleMotif />
        </div>
      </div>

      {/* One-time, from the profile builder's redirect; strips its own query. */}
      <ProfileLiveBanner show={justWentLive} />

      {/* 1 — only when something genuinely outranks the reel. */}
      {urgent && <TodayPriorities priorities={[urgent]} />}

      {/* 2 — today's rishtey. One heading, one line, one CTA — on the one
          panel of the page that inverts: the home page's wine invitation,
          with today's number on it. A gold seal for the film, foil for the
          numeral (gold on wine reads at display size; on cream it would
          not), botanicals in the margins, the foil thread along the top. */}
      {/*
        Zero is a real answer and it needs its own sentence. "Aapke liye 0
        rishtey ready hain" over an Open Reel button is the app telling
        somebody they are not wanted and then asking them to go and look at
        it — and it is wrong besides: the pool being empty means they have
        already been through everybody, and those people are still there to
        look at again. So the card says "dobara dekhein" instead, and only
        when there is genuinely somebody to see.

        It used to link into `?tab=VIEWED` to find them. That deep link is
        gone with D-92: the reel's own For You now mixes the people this
        member has seen in with the new ones, so the reel opens where it
        should — on For You — and the faces are already in it.
      */}
      <Link
        href="/user/reel"
        className="bt-shell bt-shell--deep bt-shell--foil bt-card--link group block p-5 sm:p-8"
      >
        <LeafSpray className="bt-vine -left-9 -top-7 h-[196px] w-[118px]" />
        <LeafSpray flip className="bt-vine bt-vine--soft -bottom-14 -right-7 hidden h-[210px] w-[126px] sm:block" />
        <span
          aria-hidden
          className="absolute -right-16 -top-16 size-56 rounded-full bg-gold-400/15 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
        />

        <div className="relative flex items-center gap-4 sm:gap-6">
          <span className="bt-ring bt-ring--gold [--paper-ring-size:3.25rem] sm:[--paper-ring-size:3.75rem]">
            <Film className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <span className="bt-chip mb-2">
              <Sparkles />
              {t("userPage.dashboard.reelHeroEyebrow", "Rishta Reel")}
            </span>
            {/* D-91: the pool, not the day. `waiting` is a row count of people
                who match and have not been swiped yet, so the numeral can be
                the whole truth instead of the first fifteen of it. */}
            {reel.waiting > 0 ? (
              <>
                <p className="bt-display text-[1.45rem] leading-tight sm:text-[1.9rem]">
                  {t("userPage.dashboard.reelHeroPre", "Aapke liye ")}
                  <span className="bt-numeral bt-foil text-[1.3em]">
                    <CountUp value={reel.waiting} />
                  </span>
                  {t("userPage.dashboard.reelHeroPost", " rishtey ready hain")}
                </p>
                <p className="mt-1.5 text-[0.875rem] leading-snug text-muted">
                  {t("userPage.dashboard.reelHeroSub", "Ek ke baad ek — jitne dekhna chahein")}
                </p>
              </>
            ) : reel.viewedAgain > 0 ? (
              <>
                <p className="bt-display text-[1.45rem] leading-tight sm:text-[1.9rem]">
                  {t("userPage.dashboard.reelHeroSeenPre", "Aap ")}
                  <span className="bt-numeral bt-foil text-[1.3em]">
                    <CountUp value={reel.viewedAgain} />
                  </span>
                  {t("userPage.dashboard.reelHeroSeenPost", " rishtey dekh chuke hain")}
                </p>
                <p className="mt-1.5 text-[0.875rem] leading-snug text-muted">
                  {t(
                    "userPage.dashboard.reelHeroSeenSub",
                    "Nayi profiles judte hi yahin aayengi — tab tak inhe dobara dekh sakte hain",
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="bt-display text-[1.45rem] leading-tight sm:text-[1.9rem]">
                  {t("userPage.dashboard.reelHeroNoneTitle", "Naye rishtey jud rahe hain")}
                </p>
                <p className="mt-1.5 text-[0.875rem] leading-snug text-muted">
                  {t(
                    "userPage.dashboard.reelHeroNoneSub",
                    "Aapke liye matching profile judte hi sabse pehle yahin dikhegi",
                  )}
                </p>
              </>
            )}
          </div>

          <span className="bt-cta hidden h-12 shrink-0 items-center gap-2 rounded-full px-5 text-[0.875rem] font-semibold transition-transform duration-200 group-hover:translate-x-1 sm:inline-flex">
            {reel.waiting === 0 && reel.viewedAgain > 0
              ? t("userPage.dashboard.reelHeroCtaAgain", "View Again")
              : t("userPage.dashboard.reelHeroCta", "Open Reel")}
            <ArrowRight className="size-4" />
          </span>
          {/* Wrapped, because `.bt-ring` sets `display: grid` unlayered and
              would out-rank a `sm:hidden` placed on the ring itself. */}
          <span className="shrink-0 sm:hidden">
            <span className="bt-ring bt-ring--bare [--paper-ring-size:2.5rem] transition-transform group-hover:translate-x-1">
              <ArrowRight className="size-5" />
            </span>
          </span>
        </div>
      </Link>

      {/* 3 — what happened: interests, messages, announcements, as rows. */}
      <RishtaStatusRows slides={slides} />

      {/* Time-boxed and genuinely today-shaped, so it stays near the top on
          the days it exists and simply isn't there on the others. */}
      {circleTeaser && <CircleDashboardBanner teaser={circleTeaser} />}

      {/* One optional question, tap to answer, no streak. */}
      {gapQuestion && <OneQuestionCard question={gapQuestion} />}

      {/* Profile resume, and only when there is something to resume. A thin
          line rather than a card: it is a nudge about work in progress, not a
          module competing with the ones above it. */}
      {profile.completionPercentage < 100 && (
        <Link
          href="/profile/build"
          className="bt-card bt-card--link group flex items-center gap-3.5 px-4 py-3"
        >
          <span className="bt-ring bt-ring--blush [--paper-ring-size:2.5rem]">
            <UserIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.875rem] font-semibold text-ink">
                {t("userPage.dashboard.resumeProfile", "Profile poori karein")}
              </span>
              <span className="bt-numeral shrink-0 text-[0.9375rem]">{profile.completionPercentage}%</span>
            </span>
            {/* The bar is the nudge: it says how much is left without a
                sentence about it, and its foil fill is the same gold the
                page's other bars carry. */}
            <span className="bt-bar bt-bar--thin mt-2">
              <span className="bt-bar__fill" style={{ width: `${profile.completionPercentage}%` }} />
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-1" />
        </Link>
      )}

      {familyActivity.length > 0 && <FamilyActivityCard items={familyActivity} />}

      {/* Everything else lives in its hub. Pills, not cards: a row of three
          destinations, not three more things to read — the same ghost pill
          the home page uses for its second action, behind a ruling so the
          row reads as the page's footer rather than a fourth module. */}
      <div className="bt-rule" aria-hidden>
        <RuleMotif />
      </div>
      <nav
        aria-label={t("userPage.dashboard.hubsAria", "Aur")}
        className="flex flex-wrap items-center justify-center gap-2.5"
      >
        <HubLink href="/user/me" label={t("userPage.dashboard.hubMe", "Me & Trust")} />
        <HubLink href="/user/family" label={t("userPage.dashboard.hubFamily", "Family")} />
        <HubLink href="/user/discover" label={t("userPage.dashboard.hubSearch", "Search")} />
      </nav>
    </div>
  );
}

function HubLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="bt-cta-ghost group inline-flex h-12 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5"
    >
      {label}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
