import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { CAMPAIGNS, type NudgeCandidate } from "./campaigns";
import {
  PREVIEW_LIMIT,
  type CampaignResult,
  type LifecycleRunSummary,
  type PlannedNudge,
  type SkipReason,
} from "@/lib/contracts/lifecycle";
import type { PlanCode, UserStatus } from "@prisma/client";

/**
 * The Lifecycle Engine — the first thing in this app that reaches a user who
 * is *not* currently in it.
 *
 * Every existing nudge is lazy-on-read: Ghosting Shield writes its notice when
 * the thread is opened, quests when the dashboard renders, celebrations when
 * the action happens. That design is deliberate and correct for those cases —
 * but it means the one person who most needs a reason to come back, the person
 * who has stopped opening the app, is the one person nothing can reach.
 *
 * ## Why it is not a broadcast
 *
 * The failure mode of an automated messaging job is never "sent too little".
 * It is that it messages a real person often enough that BandhanTak becomes the
 * app they turn notifications off for — and that is irreversible. So the engine
 * is built to send *less* than it could, in five independent ways:
 *
 *  1. **One nudge per user per run, ranked.** A user matching six campaigns
 *     gets the single highest-tier one. See `LIFECYCLE_TIERS` for why the
 *     order is what it is.
 *  2. **Only people who aren't here.** Someone who swiped an hour ago has the
 *     inbox on screen already; a push telling them what's in it is noise.
 *  3. **Nothing while the last one is unread.** If the previous nudge hasn't
 *     been opened, a second one is not more signal — it is proof the first
 *     didn't matter.
 *  4. **A weekly ceiling per user**, across all campaigns, on top of each
 *     campaign's own cooldown.
 *  5. **Quiet hours.** Nothing between 9pm and 9am IST. A matrimony
 *     notification at 3am is read by whoever picks up the phone.
 *
 * ## Why dry run is a first-class mode, not a debug flag
 *
 * `runLifecycleNudges({ dryRun: true })` does every query, every ranking and
 * every brake, and returns the exact sentences that would have gone out —
 * without writing a row. Nobody should have to turn on a job that messages
 * their whole member base and find out afterwards what it said. `/admin/
 * lifecycle` is that preview, and the cron and the preview run the same
 * function so they can never diverge.
 */

/** Nothing goes out outside this IST window. Inclusive start, exclusive end. */
const SEND_WINDOW_IST = { startHour: 9, endHour: 21 };

/** Someone active more recently than this doesn't need to be told what's in their inbox. */
const MIN_IDLE_HOURS = 20;

/** Across every campaign. The per-campaign cooldowns sit *under* this ceiling. */
const MAX_NUDGES_PER_WEEK = 2;

/** Ceiling per invocation — a misconfiguration costs one batch, not the member base. */
const BATCH_LIMIT = 200;

/** Ranking is cheap; the brake queries are not. Cap what goes into them. */
const MAX_CANDIDATES = 2000;

/**
 * Every lifecycle notice is written as `CHAT_NUDGE` — the app's existing
 * "we are nudging you" kind, as opposed to the kinds that record something a
 * *person* did (VOICE_NOTE_RECEIVED, QUESTION_ASKED, MATCH_CREATED).
 *
 * Using the existing enum rather than adding a `LIFECYCLE_NUDGE` value is a
 * deliberate no-migration choice: one shared kind means one push `tag`, so two
 * nudges can never stack on a lock screen, and it keeps this engine
 * de-duplicated against `ghostingShieldService`, which already writes this kind
 * against a match id. The cost is that "was this nudge automated" is answered
 * by the `lifecycle:` prefix on `relatedId` rather than by the kind itself.
 */
const NUDGE_KIND = "CHAT_NUDGE" as const;

const DAY_MS = 86_400_000;

/** Who may be nudged at all. SUSPENDED, BLOCKED and DELETED are absent on purpose. */
const NUDGEABLE_STATUSES = new Set<UserStatus>(["ACTIVE", "INCOMPLETE"]);

export interface LifecycleRunOptions {
  dryRun?: boolean;
  /** Test seam only — the cron and the admin preview both leave this unset. */
  now?: Date;
}

export async function runLifecycleNudges(
  options: LifecycleRunOptions = {},
): Promise<LifecycleRunSummary> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const withinSendWindow = isWithinSendWindow(now);

  const skipped: Record<SkipReason, number> = {
    quietHours: 0,
    recentlyActive: 0,
    weeklyCap: 0,
    unreadPending: 0,
    cooldown: 0,
    batchCap: 0,
    suspended: 0,
  };

  // ── 1. Resolve plans once ────────────────────────────────────────────
  // Campaigns that branch on capability (silent-match, chat-locked) all read
  // the same map, so a user's plan is looked up once per run rather than once
  // per campaign. Subscription only — admin entitlement overrides are a
  // hand-grant and resolving them means three queries per user.
  const planOf = await billedPlans(now);
  const ctx = { now, planOf };

  // ── 2. Every campaign, in parallel ───────────────────────────────────
  const found = await Promise.all(
    CAMPAIGNS.map(async (c) => ({ campaign: c, candidates: await c.find(ctx) })),
  );

  const campaignResults: CampaignResult[] = found.map(({ campaign, candidates }) => ({
    id: campaign.id,
    label: campaign.label,
    tier: campaign.tier,
    matched: new Set(candidates.map((x) => x.userId)).size,
    sent: 0,
    skipped: 0,
  }));
  const resultById = new Map(campaignResults.map((r) => [r.id, r]));

  // ── 3. One per user, highest priority wins ───────────────────────────
  // CAMPAIGNS is in priority order, so the first campaign to claim a user
  // keeps them. A later, lower-tier match for the same person is simply
  // dropped — not queued for a future run, because by then it may not be true.
  const chosen = new Map<string, { campaignId: string; candidate: NudgeCandidate }>();
  for (const { campaign, candidates } of found) {
    for (const candidate of candidates) {
      if (chosen.has(candidate.userId)) continue;
      chosen.set(candidate.userId, { campaignId: campaign.id, candidate });
    }
  }

  const ranked = [...chosen.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => campaignIndex(a.campaignId) - campaignIndex(b.campaignId));

  const candidateCount = ranked.length;
  const shortlist = ranked.slice(0, MAX_CANDIDATES);
  const userIds = shortlist.map((r) => r.userId);

  if (userIds.length === 0) {
    return summarise({ now, dryRun, withinSendWindow, candidateCount, selected: [], sent: 0, failed: 0, skipped, campaignResults });
  }

  // ── 4. Brakes, all batched ───────────────────────────────────────────
  const [users, lastSwipe, lastMessage, history] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, status: true, deletedAt: true, lastLoginAt: true },
    }),
    prisma.swipeAction.groupBy({
      by: ["actorUserId"],
      where: { actorUserId: { in: userIds } },
      _max: { createdAt: true },
    }),
    prisma.message.groupBy({
      by: ["senderId"],
      where: { senderId: { in: userIds } },
      _max: { createdAt: true },
    }),
    // 30 days covers the longest cooldown (14) with room, in one read.
    prisma.notice.findMany({
      where: {
        userId: { in: userIds },
        kind: NUDGE_KIND,
        createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      },
      select: { userId: true, relatedId: true, createdAt: true, readAt: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const swipeAt = new Map(lastSwipe.map((r) => [r.actorUserId, r._max.createdAt]));
  const messageAt = new Map(lastMessage.map((r) => [r.senderId, r._max.createdAt]));

  const historyOf = new Map<string, typeof history>();
  for (const n of history) {
    const list = historyOf.get(n.userId);
    if (list) list.push(n);
    else historyOf.set(n.userId, [n]);
  }

  const idleCutoff = new Date(now.getTime() - MIN_IDLE_HOURS * 3_600_000);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const selected: PlannedNudge[] = [];

  for (const row of shortlist) {
    const user = userById.get(row.userId);
    const result = resultById.get(row.campaignId)!;

    // A user row that vanished between the campaign query and now, or an
    // account that has been taken away. SUSPENDED/BLOCKED/DELETED people do
    // not get nudged.
    //
    // INCOMPLETE is explicitly *allowed*, and that is not an oversight: a user
    // whose profile isn't finished carries `status: INCOMPLETE`, and they are
    // precisely who `profile-not-live` exists for. An earlier version of this
    // check demanded `status === "ACTIVE"` and silently cancelled that entire
    // campaign — 7 of 7 matches dropped on the first live dry run.
    if (!user || user.deletedAt || !NUDGEABLE_STATUSES.has(user.status)) {
      skipped.suspended++;
      result.skipped++;
      continue;
    }

    const lastSeen = latest(user.lastLoginAt, swipeAt.get(row.userId), messageAt.get(row.userId));
    if (lastSeen && lastSeen > idleCutoff) {
      skipped.recentlyActive++;
      result.skipped++;
      continue;
    }

    const past = historyOf.get(row.userId) ?? [];
    if (past.some((n) => n.readAt === null)) {
      skipped.unreadPending++;
      result.skipped++;
      continue;
    }
    if (past.filter((n) => n.createdAt >= weekAgo).length >= MAX_NUDGES_PER_WEEK) {
      skipped.weeklyCap++;
      result.skipped++;
      continue;
    }

    const campaign = CAMPAIGNS[campaignIndex(row.campaignId)];
    const cooldownStart = new Date(now.getTime() - campaign.cooldownDays * DAY_MS);
    if (
      past.some((n) => n.relatedId === row.candidate.dedupeKey && n.createdAt >= cooldownStart)
    ) {
      skipped.cooldown++;
      result.skipped++;
      continue;
    }

    if (selected.length >= BATCH_LIMIT) {
      skipped.batchCap++;
      result.skipped++;
      continue;
    }

    selected.push({
      userId: row.userId,
      userName: user.fullName,
      campaignId: campaign.id,
      campaignLabel: campaign.label,
      tier: campaign.tier,
      title: row.candidate.title,
      body: row.candidate.body,
      href: row.candidate.href,
    });
  }

  // ── 5. Deliver ───────────────────────────────────────────────────────
  let sent = 0;
  let failed = 0;

  if (dryRun) {
    return summarise({ now, dryRun, withinSendWindow, candidateCount, selected, sent: 0, failed: 0, skipped, campaignResults });
  }

  if (!withinSendWindow) {
    // Not an error and not a loss: everything here is a standing condition,
    // still true at 9am. Counting it as a skip rather than sending anyway is
    // the whole point of the window.
    skipped.quietHours += selected.length;
    for (const s of selected) resultById.get(s.campaignId)!.skipped++;
    return summarise({ now, dryRun, withinSendWindow, candidateCount, selected: [], sent: 0, failed: 0, skipped, campaignResults });
  }

  for (const nudge of selected) {
    const source = chosen.get(nudge.userId)!.candidate;
    try {
      await createNotice({
        userId: nudge.userId,
        kind: NUDGE_KIND,
        title: nudge.title,
        body: nudge.body,
        href: nudge.href,
        actorMasked: source.actorMasked ?? false,
        relatedId: source.dedupeKey,
      });
      sent++;
      resultById.get(nudge.campaignId)!.sent++;
    } catch (err) {
      // `createNotice` swallows its own failures by design (a notice must never
      // roll back the thing that caused it), so this can realistically only
      // fire if the call itself is unreachable. Counted rather than assumed.
      failed++;
      console.error("[lifecycle] send failed:", err instanceof Error ? err.message : String(err));
    }
  }

  console.info(
    `[lifecycle:job] candidates=${candidateCount} selected=${selected.length} sent=${sent} ` +
      `failed=${failed} skipped=${JSON.stringify(skipped)}`,
  );

  return summarise({ now, dryRun, withinSendWindow, candidateCount, selected, sent, failed, skipped, campaignResults });
}

// ============================================================
// Helpers
// ============================================================

function campaignIndex(id: string): number {
  return CAMPAIGNS.findIndex((c) => c.id === id);
}

/**
 * IST without a timezone library: the offset is a fixed +5:30 and India has no
 * DST, so `getUTCHours` plus the offset is exactly right and cannot drift the
 * way a locale string parse can.
 */
function isWithinSendWindow(now: Date): boolean {
  const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  return (
    istMinutes >= SEND_WINDOW_IST.startHour * 60 && istMinutes < SEND_WINDOW_IST.endHour * 60
  );
}

function latest(...dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) if (d && (!best || d > best)) best = d;
  return best;
}

/** Same "a cancelled sub still counts until period end" rule as `getActiveSubscription`. */
async function billedPlans(now: Date): Promise<Map<string, PlanCode>> {
  const rows = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: now } },
    select: { userId: true, planCode: true },
  });
  return new Map(rows.map((r) => [r.userId, r.planCode]));
}

function summarise(input: {
  now: Date;
  dryRun: boolean;
  withinSendWindow: boolean;
  candidateCount: number;
  selected: PlannedNudge[];
  sent: number;
  failed: number;
  skipped: Record<SkipReason, number>;
  campaignResults: CampaignResult[];
}): LifecycleRunSummary {
  return {
    ranAt: input.now.toISOString(),
    dryRun: input.dryRun,
    withinSendWindow: input.withinSendWindow,
    candidates: input.candidateCount,
    selected: input.selected.length,
    sent: input.sent,
    failed: input.failed,
    skipped: input.skipped,
    campaigns: input.campaignResults,
    preview: input.selected.slice(0, PREVIEW_LIMIT),
  };
}
