import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
import { LIFECYCLE_TIERS, type LifecycleTier } from "@/lib/contracts/lifecycle";
import { NO_REPLY_GUARANTEE_HOURS } from "@/lib/contracts/chatUnlock";
import type { PlanCode } from "@/lib/constants/plans";

/**
 * The campaign catalog — code, not database rows.
 *
 * Same call as `MINDSET_QUESTIONS` and the quest definitions:
 * a campaign is a *query plus a sentence*, and putting either in an admin panel
 * means a migration every time a word changes and a UI that can invent reasons
 * to message people. The catalog being code is also what makes the review
 * below possible — every sentence a user can receive is in this one file.
 *
 * ## The rule every campaign obeys
 *
 * **A nudge may only state something that is already true, and the user must
 * be able to act on it.** No "wo aapka intezaar kar rahe hain, jaldi kijiye"
 * over a fact nobody checked (that is the invented-urgency copy D-61 rules
 * out); no "aapki profile trending hai" over a number that doesn't exist. Every
 * body string below is built from a count this file just read out of the
 * database, and every `href` goes to the screen where the thing can be done.
 *
 * ## Why the counts are in the copy
 *
 * "Kisi ne aapko interest bheja" is a reminder. "3 log aapke jawab ka intezaar
 * kar rahe hain" is information. The second one is also falsifiable — the user
 * opens the screen and either sees three or catches us lying — which is
 * exactly the pressure that keeps this honest.
 *
 * ## Masking
 *
 * `actorMasked` and the no-names rule from `noticeService` apply with more
 * force here than anywhere else: these arrive as push, on a lock screen, in a
 * house where other people can read it. Where a campaign involves someone whose
 * identity is not yet earned (an Ask Bridge question), no identifying detail
 * appears in the copy at all — not just hidden behind a flag.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Matches with a live Serious Circle window — one of D-90's three ways a chat
 * is open (with an unlock, or either member's plan). Batched because both chat
 * campaigns walk every match.
 */
async function liveCircleMatchIds(matchIds: string[], now: Date): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await prisma.circleConnection.findMany({
    where: { matchId: { in: matchIds }, connectedAt: { not: null }, windowEndsAt: { gt: now } },
    select: { matchId: true },
  });
  return new Set(rows.map((r) => r.matchId).filter((id): id is string => Boolean(id)));
}

/** One campaign's candidate, already carrying the exact words it will send. */
export interface NudgeCandidate {
  userId: string;
  title: string;
  body: string;
  href: string;
  /**
   * Written to `Notice.relatedId` and used as the cooldown key. Namespaced
   * `lifecycle:<campaign>` so it can never collide with a real entity id —
   * except where a campaign deliberately shares a key with an existing nudge
   * (see `stale-thread`), which is how the two paths stay de-duplicated.
   */
  dedupeKey: string;
  actorMasked?: boolean;
}

export interface CampaignContext {
  now: Date;
  /** Billed plan per user, resolved once for the whole run. Absent = FREE. */
  planOf: Map<string, PlanCode>;
}

export interface Campaign {
  id: string;
  label: string;
  tier: LifecycleTier;
  /** Days before the same `dedupeKey` may fire again. */
  cooldownDays: number;
  find(ctx: CampaignContext): Promise<NudgeCandidate[]>;
}

/**
 * Ordered by priority — index 0 wins when one user matches several. The order
 * is the tier order; within a tier it is "how much does this cost the user to
 * ignore", most first.
 */
export const CAMPAIGNS: Campaign[] = [
  // ── Tier 1 · a real person is waiting ──────────────────────────────
  {
    id: "pending-interest",
    label: "Interest ka jawab baaki hai",
    tier: LIFECYCLE_TIERS.WAITING_HUMAN,
    cooldownDays: 3,
    async find({ now }) {
      // Today an Interest creates no Notice at all — this is the only thing
      // that tells someone a person is waiting on them.
      const rows = await prisma.interest.groupBy({
        by: ["toUserId"],
        where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - DAY_MS) } },
        _count: { _all: true },
      });
      return rows.map((r) => ({
        userId: r.toUserId,
        title: "Kisi ne aapko interest bheja hai",
        body:
          r._count._all === 1
            ? "Ek interest aapke jawab ka intezaar kar raha hai."
            : `${r._count._all} log aapke jawab ka intezaar kar rahe hain.`,
        href: "/user/interests",
        dedupeKey: "lifecycle:pending-interest",
        // The sender's identity is already visible on the Interests screen —
        // it is not withheld — but the push line itself names nobody.
        actorMasked: false,
      }));
    },
  },
  {
    id: "unanswered-question",
    label: "Sawaal ka jawab baaki hai",
    tier: LIFECYCLE_TIERS.WAITING_HUMAN,
    cooldownDays: 4,
    async find({ now }) {
      const rows = await prisma.profileQuestion.groupBy({
        by: ["toUserId"],
        where: {
          status: "PENDING",
          moderation: "APPROVED",
          createdAt: { lt: new Date(now.getTime() - DAY_MS) },
          expiresAt: { gt: now },
        },
        _count: { _all: true },
      });
      return rows.map((r) => ({
        userId: r.toUserId,
        title: "Ek sawaal aapka intezaar kar raha hai",
        body:
          r._count._all === 1
            ? "Aapse ek sawaal poocha gaya hai — jawab sirf voice mein, ek minute ka kaam."
            : `${r._count._all} sawaal aapka intezaar kar rahe hain — jawab sirf voice mein dena hai.`,
        href: "/user/inbox",
        dedupeKey: "lifecycle:unanswered-question",
        // Ask Bridge's whole shape is that the asker stays hidden until the
        // recipient answers. Nothing here may hint at who it was.
        actorMasked: true,
      }));
    },
  },
  {
    id: "stale-thread",
    label: "Message ka jawab reh gaya",
    tier: LIFECYCLE_TIERS.WAITING_HUMAN,
    cooldownDays: 3,
    async find({ now }) {
      const cutoff = new Date(now.getTime() - DAY_MS);

      // Last message per thread, reduced in memory rather than a correlated
      // subquery per match: the window is bounded (14 days), and a thread with
      // no traffic in a fortnight is not "waiting for a reply" any more — it's
      // over, and nudging it would be the invented-urgency mistake.
      const recent = await prisma.message.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 14 * DAY_MS) } },
        orderBy: { createdAt: "desc" },
        // Safe to truncate *because* it is newest-first: every thread this
        // slice contains still gets its true last message, and the threads it
        // drops are the quietest ones — the ones already past nudging.
        take: 5000,
        select: {
          matchId: true,
          senderId: true,
          createdAt: true,
          match: {
            select: {
              userAId: true,
              userBId: true,
              userA: { select: { fullName: true } },
              userB: { select: { fullName: true } },
            },
          },
        },
      });

      const lastByMatch = new Map<string, (typeof recent)[number]>();
      for (const m of recent) if (!lastByMatch.has(m.matchId)) lastByMatch.set(m.matchId, m);

      const out: NudgeCandidate[] = [];
      for (const [matchId, last] of lastByMatch) {
        if (last.createdAt > cutoff) continue;
        const { userAId, userBId, userA, userB } = last.match;
        const silentId = last.senderId === userAId ? userBId : userAId;
        const otherName = last.senderId === userAId ? userA.fullName : userB.fullName;
        out.push({
          userId: silentId,
          title: "Ek jawab reh gaya",
          // Deliberately the same sentence `ghostingShieldService` writes. The
          // two must not develop separate voices for the identical fact.
          body: `${otherName} ka message aapko mila tha — ek chhota sa jawab rishta aage badha sakta hai.`,
          href: `/user/messages/${matchId}`,
          // Ghosting Shield's own idempotency key, on purpose: it looks for
          // (CHAT_NUDGE, relatedId = matchId, createdAt > lastMessageAt), so
          // writing the same key here means the in-app path will not send a
          // second copy when the user finally opens the thread.
          dedupeKey: matchId,
        });
      }
      return out;
    },
  },
  {
    id: "silent-match",
    label: "Match hua, baat shuru nahi hui",
    tier: LIFECYCLE_TIERS.WAITING_HUMAN,
    cooldownDays: 5,
    async find({ now, planOf }) {
      const matches = await prisma.match.findMany({
        where: { createdAt: { lt: new Date(now.getTime() - 2 * DAY_MS) }, messages: { none: {} } },
        select: { id: true, userAId: true, userBId: true, chatUnlock: { select: { id: true } } },
      });

      // Hoisted out of the loop: `find` walks every match, and resolving the
      // catalog per user would be a lookup per row.
      const catalog = await getPlanCatalog();
      const circleOpen = await liveCircleMatchIds(matches.map((m) => m.id), now);
      const out: NudgeCandidate[] = [];
      for (const m of matches) {
        // Someone whose chat is not open must not be told to send a message.
        // That pair belongs to the `chat-locked` campaign, whose copy is honest
        // about the lock instead of pretending the button works. "Open" is the
        // D-90 rule: an unlock, either member's plan, or a Circle window.
        const open =
          Boolean(m.chatUnlock) ||
          circleOpen.has(m.id) ||
          planFeaturesOf(catalog, planOf.get(m.userAId) ?? "FREE").chat ||
          planFeaturesOf(catalog, planOf.get(m.userBId) ?? "FREE").chat;
        if (!open) continue;
        for (const userId of [m.userAId, m.userBId]) {
          out.push({
            userId,
            title: "Aapka match abhi tak chup hai",
            body: "Dono taraf se haan ho chuki hai. Pehla message sabse mushkil lagta hai — ek 'Namaste' kaafi hai.",
            href: `/user/messages/${m.id}`,
            dedupeKey: `lifecycle:silent-match:${m.id}`,
          });
        }
      }
      return out;
    },
  },

  // ── Tier 2 · something real is about to end ────────────────────────
  {
    id: "sub-expiring",
    label: "Plan khatam hone wala hai",
    tier: LIFECYCLE_TIERS.EXPIRING,
    cooldownDays: 7,
    async find({ now }) {
      // There is no auto-charge anywhere in `subscriptionService` — a renewal
      // is a fresh captured payment extending the period. So every one of
      // these genuinely ends on the date below, and saying so is not a scare.
      const subs = await prisma.subscription.findMany({
        where: {
          status: { in: ["ACTIVE", "CANCELLED"] },
          currentPeriodEnd: { gt: now, lt: new Date(now.getTime() + 5 * DAY_MS) },
        },
        select: { userId: true, planCode: true, currentPeriodEnd: true },
      });
      return subs.map((s) => {
        const days = Math.max(1, Math.ceil((s.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS));
        return {
          userId: s.userId,
          title: `Aapka ${s.planCode} plan ${days} din mein khatam ho raha hai`,
          body: "Renew na karne par chat, interest aur baaki unlock ki hui cheezein band ho jaayengi.",
          href: "/user/subscription",
          dedupeKey: "lifecycle:sub-expiring",
        };
      });
    },
  },

  // ── Tier 3 · nobody can find them ──────────────────────────────────
  {
    id: "profile-not-live",
    label: "Profile live nahi hui",
    tier: LIFECYCLE_TIERS.UNDISCOVERABLE,
    cooldownDays: 4,
    async find({ now }) {
      // A day's grace: somebody who registered this morning is mid-wizard, not
      // stuck, and a reminder then is just interrupting them.
      const users = await prisma.user.findMany({
        where: {
          role: "USER",
          deletedAt: null,
          createdAt: { lt: new Date(now.getTime() - DAY_MS) },
          OR: [{ profile: null }, { profile: { is: { isVisible: false } } }],
        },
        select: {
          id: true,
          profile: { select: { profileCompletionScore: true } },
        },
      });

      return users.map((u) => {
        const score = u.profile?.profileCompletionScore ?? 0;
        return {
          userId: u.id,
          title: "Aapki profile abhi kisi ko nahi dikh rahi",
          body:
            u.profile === null
              ? "Profile shuru hi nahi hui — bina iske aap kisi ki Reel mein nahi aayenge."
              : `Profile ${score}% poori hai. Jab tak live nahi hoti, aap kisi ki Reel mein nahi aayenge.`,
          href: "/user/profile-setup",
          dedupeKey: "lifecycle:profile-not-live",
        };
      });
    },
  },
  {
    id: "no-photo",
    label: "Live hai par photo nahi",
    tier: LIFECYCLE_TIERS.UNDISCOVERABLE,
    cooldownDays: 7,
    async find() {
      const profiles = await prisma.profile.findMany({
        where: {
          isVisible: true,
          deletedAt: null,
          photos: { none: { verificationStatus: "APPROVED", deletedAt: null } },
        },
        select: { userId: true },
      });
      return profiles.map((p) => ({
        userId: p.userId,
        title: "Aapki profile mein ek bhi photo nahi hai",
        body: "Profile live to hai, par bina photo ke log aage swipe kar dete hain. Ek photo se farq padta hai.",
        href: "/user/profile/me",
        dedupeKey: "lifecycle:no-photo",
      }));
    },
  },

  // ── Tier 4 · a real reason to come back ────────────────────────────
  {
    id: "reel-idle",
    label: "Kai din se Reel nahi kholi",
    tier: LIFECYCLE_TIERS.HABIT,
    cooldownDays: 5,
    async find({ now }) {
      const since = new Date(now.getTime() - 7 * DAY_MS);

      // One shared count, not a per-user one: "pichhle hafte kitni nayi
      // profiles live hui" is the same true number for everybody, and asking
      // it once keeps this campaign to two queries instead of N.
      const [freshProfiles, users] = await Promise.all([
        prisma.profile.count({ where: { isVisible: true, deletedAt: null, createdAt: { gte: since } } }),
        prisma.user.findMany({
          where: {
            role: "USER",
            deletedAt: null,
            profile: { is: { isVisible: true } },
            createdAt: { lt: new Date(now.getTime() - 3 * DAY_MS) },
            swipeActions: { none: { createdAt: { gte: new Date(now.getTime() - 3 * DAY_MS) } } },
          },
          select: { id: true },
        }),
      ]);

      // Nothing new to show is not a reason to message anyone.
      if (freshProfiles === 0) return [];

      return users.map((u) => ({
        userId: u.id,
        title: "Pichhle hafte nayi profiles aayi hain",
        body: `${freshProfiles} nayi profiles live hui hain. Aapki Reel wahin hai jahan chhodi thi.`,
        href: "/user/reel",
        dedupeKey: "lifecycle:reel-idle",
      }));
    },
  },

  // ── Tier 5 · the one monetisation nudge, and the slowest ───────────
  {
    id: "chat-locked",
    label: "Match hai, chat abhi khuli nahi",
    tier: LIFECYCLE_TIERS.UPGRADE,
    cooldownDays: 14,
    async find({ now, planOf }) {
      const matches = await prisma.match.findMany({
        where: { createdAt: { lt: new Date(now.getTime() - DAY_MS) }, chatUnlock: { is: null } },
        select: { id: true, userAId: true, userBId: true },
      });

      const catalog = await getPlanCatalog();
      const circleOpen = await liveCircleMatchIds(matches.map((m) => m.id), now);
      const lockedByUser = new Map<string, string[]>();
      for (const m of matches) {
        // D-90: a chat open through either member's plan, or a Circle window,
        // is open for both — nobody in that pair needs telling.
        if (circleOpen.has(m.id)) continue;
        if (planFeaturesOf(catalog, planOf.get(m.userAId) ?? "FREE").chat) continue;
        if (planFeaturesOf(catalog, planOf.get(m.userBId) ?? "FREE").chat) continue;
        for (const id of [m.userAId, m.userBId]) {
          lockedByUser.set(id, [...(lockedByUser.get(id) ?? []), m.id]);
        }
      }

      return [...lockedByUser].map(([userId, ids]) => ({
        userId,
        title:
          ids.length === 1 ? "Aapka ek match hai, chat abhi khuli nahi" : `Aapke ${ids.length} match hain, chat abhi khuli nahi`,
        // Every clause is a rule the code keeps: one unlock opens the chat for
        // both, and a message with no reply inside the window comes back.
        body: `Dono taraf se haan ho chuki hai. Ek Chat Unlock se chat aap dono ke liye khul jaati hai — aur likhne ke ${NO_REPLY_GUARANTEE_HOURS} ghante me jawab na aaye to unlock wapas milta hai.`,
        // Straight to the thread when there is one, where the unlock card is.
        href: ids.length === 1 ? `/user/messages/${ids[0]}` : "/user/messages",
        dedupeKey: "lifecycle:chat-locked",
      }));
    },
  },
];

export const CAMPAIGN_BY_ID = new Map(CAMPAIGNS.map((c) => [c.id, c]));
