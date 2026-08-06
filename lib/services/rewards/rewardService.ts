import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, RewardKind } from "@prisma/client";

/**
 * Earned entitlements — the ledger that sits on top of the paid plan.
 *
 * ## The one economics rule
 *
 * A reward may widen what a user can **see**. It may never hand over what the
 * plans exist to **sell**.
 *
 *   allowed : REEL_UNLOCK, AI_ASK, VOICE_UNLOCK, BOOST, KUNDLI_UNLOCK
 *   never   : chat, admirerIdentity, contact numbers, deep report
 *
 * That split is why `RewardKind` is a closed enum rather than "any capability
 * key". If quests could grant `chat`, the quest system would quietly become a
 * free tier of the product, and every rupee of subscription revenue would be
 * competing against a feature we built ourselves.
 *
 * ## Why grants expire
 *
 * A permanent grant is a plan change wearing a costume. `DEFAULT_TTL_HOURS`
 * keeps a reward feeling like a reward: use it now, or it's gone. It also
 * bounds the blast radius of a mis-tuned quest — a bug can cost us a day, not
 * a cohort.
 */

/** Quest rewards live this long unless the caller says otherwise. */
export const DEFAULT_TTL_HOURS = 48;

/**
 * Per-kind ceiling on how much a single user may hold at once. Stops a
 * loop-y quest (or a generous admin) from stacking a hundred unlocks.
 */
const MAX_HELD: Record<RewardKind, number> = {
  REEL_UNLOCK: 10,
  AI_ASK: 20,
  VOICE_UNLOCK: 5,
  BOOST: 2,
  KUNDLI_UNLOCK: 3,
};

export type RewardCredits = Record<RewardKind, number>;

const ZERO_CREDITS: RewardCredits = {
  REEL_UNLOCK: 0,
  AI_ASK: 0,
  VOICE_UNLOCK: 0,
  BOOST: 0,
  KUNDLI_UNLOCK: 0,
};

function activeWhere(userId: string): Prisma.RewardGrantWhereInput {
  return {
    userId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/** How much of each kind the user can still spend right now. */
export async function getCredits(userId: string): Promise<RewardCredits> {
  const rows = await prisma.rewardGrant.findMany({
    where: activeWhere(userId),
    select: { kind: true, amount: true, consumed: true },
  });
  const out: RewardCredits = { ...ZERO_CREDITS };
  for (const r of rows) out[r.kind] += Math.max(0, r.amount - r.consumed);
  return out;
}

export type GrantResult =
  | { ok: true; granted: number; id: string }
  | { ok: false; reason: "AT_CAP"; held: number };

/**
 * Issues a grant. Idempotency is the caller's job via `source` — quests pass
 * their `questKey:periodKey`, so claiming twice writes one row (see the unique
 * guard in questService when that lands). Admin grants pass "admin:<reason>".
 */
export async function grantReward(params: {
  userId: string;
  kind: RewardKind;
  amount: number;
  source: string;
  ttlHours?: number | null;
}): Promise<GrantResult> {
  const { userId, kind, amount, source } = params;
  const ttlHours = params.ttlHours === undefined ? DEFAULT_TTL_HOURS : params.ttlHours;

  const credits = await getCredits(userId);
  const held = credits[kind];
  if (held >= MAX_HELD[kind]) return { ok: false, reason: "AT_CAP", held };

  const granted = Math.min(amount, MAX_HELD[kind] - held);
  const row = await prisma.rewardGrant.create({
    data: {
      userId,
      kind,
      amount: granted,
      source,
      expiresAt: ttlHours === null ? null : new Date(Date.now() + ttlHours * 3600_000),
    },
  });

  return { ok: true, granted, id: row.id };
}

/**
 * Spends `amount` of a kind, oldest-expiring first so a user never loses a
 * credit that was about to lapse while a fresher one sat unused.
 *
 * Returns false without consuming anything if the full amount isn't available
 * — partial spends would leave the caller having charged for something it
 * couldn't deliver.
 */
export async function consumeReward(userId: string, kind: RewardKind, amount = 1): Promise<boolean> {
  if (amount <= 0) return true;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.rewardGrant.findMany({
      where: { ...activeWhere(userId), kind },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });

    const available = rows.reduce((sum, r) => sum + Math.max(0, r.amount - r.consumed), 0);
    if (available < amount) return false;

    let left = amount;
    for (const row of rows) {
      if (left === 0) break;
      const spare = Math.max(0, row.amount - row.consumed);
      if (spare === 0) continue;
      const take = Math.min(spare, left);
      await tx.rewardGrant.update({
        where: { id: row.id },
        data: { consumed: { increment: take } },
      });
      left -= take;
    }
    return true;
  });
}

export interface RewardLedgerEntry {
  id: string;
  kind: RewardKind;
  remaining: number;
  source: string;
  expiresAt: Date | null;
}

/** Active grants, for the UI's "aapke paas abhi ye hai" strip. */
export async function getLedger(userId: string): Promise<RewardLedgerEntry[]> {
  const rows = await prisma.rewardGrant.findMany({
    where: activeWhere(userId),
    orderBy: { createdAt: "desc" },
  });
  return rows
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      remaining: Math.max(0, r.amount - r.consumed),
      source: r.source,
      expiresAt: r.expiresAt,
    }))
    .filter((r) => r.remaining > 0);
}

export const REWARD_LABELS: Record<RewardKind, string> = {
  REEL_UNLOCK: "Extra rishta card",
  AI_ASK: "AI se ek sawaal",
  VOICE_UNLOCK: "Ek voice note kholna",
  BOOST: "24 ghante ka profile boost",
  KUNDLI_UNLOCK: "Ek turant kundli banayen",
};
