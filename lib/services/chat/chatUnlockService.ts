import "server-only";
import type { Payment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { getPlanCatalog } from "@/lib/services/plans/planCatalog";
import { getItemCatalog, itemOf } from "@/lib/services/items/itemCatalog";
import { createNotice } from "@/lib/services/notice/noticeService";
import { NO_REPLY_GUARANTEE_HOURS, type ChatUnlockQuoteView, type PassOffer } from "@/lib/contracts/chatUnlock";

/**
 * Chat Unlock (D-90) — the one moment the app asks a member for money.
 *
 * Everything before it is free: being seen, seeing faces, sending and receiving
 * interests, matching. The first paid step is opening a conversation with a
 * mutual match, because by then the other person has already said yes — the
 * member is paying for something that has demonstrably happened, not for a
 * chance at it.
 *
 * ## The rules this file owns
 *
 *   • A chat is open when the match has an unlock, when **either** member's
 *     plan includes chat (so a Rishta Pass holder's matches can actually reply
 *     to them), or during a live Serious Circle window.
 *   • One unlock opens the match for both members. `ChatUnlock.matchId` is
 *     unique, so that is structural, not remembered.
 *   • A member who opened a chat, wrote, and got no reply within 72 hours gets
 *     one unlock back as a credit — at most three a month. Settled on read, like
 *     every other clock in this app.
 *   • A partner-referred member's first unlock is free (replaces D-13).
 *   • Credits are never cash and never transferable.
 */

export const CHAT_UNLOCK_ITEM_CODE = "CHAT_UNLOCK";

/** No-reply refunds per member within `NO_REPLY_CAP_WINDOW_DAYS`. */
export const NO_REPLY_CREDIT_CAP = 3;
export const NO_REPLY_CAP_WINDOW_DAYS = 30;

/** How far back unsettled unlocks are still looked at. */
const SETTLE_LOOKBACK_DAYS = 60;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ access

export type ChatAccess =
  | { open: true; via: "plan" | "unlock" | "circle"; windowEndsAt: Date | null }
  | { open: false };

/** Is this match's chat open for this member, and why. Not a participant → closed. */
export async function getChatAccess(userId: string, matchId: string, now = new Date()): Promise<ChatAccess> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { userAId: true, userBId: true, chatUnlock: { select: { id: true } } },
  });
  if (!match || (match.userAId !== userId && match.userBId !== userId)) return { open: false };
  if (match.chatUnlock) return { open: true, via: "unlock", windowEndsAt: null };

  // Both members' plans, not only the asker's: a Pass that opened chat for its
  // holder alone would be a Pass whose matches cannot answer.
  const [a, b] = await Promise.all([getEntitlements(match.userAId), getEntitlements(match.userBId)]);
  if (a.chat || b.chat) return { open: true, via: "plan", windowEndsAt: null };

  const circle = await prisma.circleConnection.findFirst({
    where: { matchId, connectedAt: { not: null }, windowEndsAt: { gt: now } },
    select: { windowEndsAt: true },
  });
  if (circle) return { open: true, via: "circle", windowEndsAt: circle.windowEndsAt };

  return { open: false };
}

/**
 * `getChatAccess` for a list of matches at once — the conversation list's
 * lock badges. Same three reasons, read in three batched queries plus one
 * entitlement read per distinct member.
 */
export async function openChatMatchIds(
  matches: { id: string; userAId: string; userBId: string }[],
  now = new Date(),
): Promise<Set<string>> {
  if (matches.length === 0) return new Set();
  const ids = matches.map((m) => m.id);
  const memberIds = [...new Set(matches.flatMap((m) => [m.userAId, m.userBId]))];

  const [unlocks, circles, chatByMember] = await Promise.all([
    prisma.chatUnlock.findMany({ where: { matchId: { in: ids } }, select: { matchId: true } }),
    prisma.circleConnection.findMany({
      where: { matchId: { in: ids }, connectedAt: { not: null }, windowEndsAt: { gt: now } },
      select: { matchId: true },
    }),
    Promise.all(memberIds.map(async (id) => [id, (await getEntitlements(id)).chat] as const)),
  ]);

  const chat = new Map(chatByMember);
  const open = new Set<string>(unlocks.map((u) => u.matchId));
  for (const c of circles) if (c.matchId) open.add(c.matchId);
  for (const m of matches) if (chat.get(m.userAId) || chat.get(m.userBId)) open.add(m.id);
  return open;
}

// ------------------------------------------------------------------ guards

export type UnlockGuard = { ok: true; otherUserId: string } | { ok: false; message: string; status: number };

/** The member is in this match and neither side has blocked the other. */
export async function checkUnlockable(userId: string, matchId: string): Promise<UnlockGuard> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { userAId: true, userBId: true } });
  if (!match || (match.userAId !== userId && match.userBId !== userId)) {
    return { ok: false, message: "Match nahi mila.", status: 404 };
  }
  const otherUserId = match.userAId === userId ? match.userBId : match.userAId;

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerUserId: userId, blockedUserId: otherUserId },
        { blockerUserId: otherUserId, blockedUserId: userId },
      ],
    },
    select: { blockerUserId: true },
  });
  if (block) return { ok: false, message: "Is match ke saath chat nahi khul sakti.", status: 403 };

  return { ok: true, otherUserId };
}

// ------------------------------------------------------------------ credits

/**
 * A partner-referred member's first unlock is free — lazily, and exactly once.
 *
 * Lazy (on the first quote) rather than at registration, so members who were
 * referred before D-90 get it without a backfill. The unique
 * (user, reason, partner) makes a second call a no-op, and a partner who is
 * not in good standing gives nothing.
 */
export async function ensurePartnerWelcomeCredit(userId: string): Promise<void> {
  const referral = await prisma.partnerReferral.findUnique({
    where: { userId },
    select: { partnerId: true, partner: { select: { status: true } } },
  });
  if (!referral) return;
  if (referral.partner.status !== "APPROVED" && referral.partner.status !== "ACTIVE") return;

  await prisma.chatUnlockCredit.upsert({
    where: { userId_reason_sourceRef: { userId, reason: "PARTNER_WELCOME", sourceRef: referral.partnerId } },
    create: { userId, reason: "PARTNER_WELCOME", sourceRef: referral.partnerId },
    update: {},
  });
}

/**
 * The 72-hour promise, kept on read.
 *
 * For every unlock this member opened that is past its 72 hours and not yet
 * settled: if they wrote at least once in that window and the other member
 * wrote nothing, one unlock comes back as a credit. Either way the unlock is
 * marked settled, so the answer never changes and never pays twice.
 *
 * When this month's three refunds are used up, the remaining unlocks are left
 * unsettled rather than marked lost — they are paid once the window frees up.
 */
export async function settleNoReplyGuarantees(userId: string, now = new Date()): Promise<number> {
  const capStart = new Date(now.getTime() - NO_REPLY_CAP_WINDOW_DAYS * DAY_MS);
  let room =
    NO_REPLY_CREDIT_CAP -
    (await prisma.chatUnlockCredit.count({ where: { userId, reason: "NO_REPLY", createdAt: { gte: capStart } } }));

  const due = new Date(now.getTime() - NO_REPLY_GUARANTEE_HOURS * HOUR_MS);
  const unlocks = await prisma.chatUnlock.findMany({
    where: {
      unlockedByUserId: userId,
      guaranteeSettledAt: null,
      createdAt: { lte: due, gte: new Date(now.getTime() - SETTLE_LOOKBACK_DAYS * DAY_MS) },
    },
    select: { id: true, matchId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  let issued = 0;
  for (const u of unlocks) {
    const windowEnd = new Date(u.createdAt.getTime() + NO_REPLY_GUARANTEE_HOURS * HOUR_MS);
    const [wrote, heardBack] = await Promise.all([
      prisma.message.count({ where: { matchId: u.matchId, senderId: userId, createdAt: { gte: u.createdAt, lte: windowEnd } } }),
      prisma.message.count({
        where: { matchId: u.matchId, senderId: { not: userId }, createdAt: { gte: u.createdAt, lte: windowEnd } },
      }),
    ]);
    const owed = wrote > 0 && heardBack === 0;
    if (owed && room <= 0) continue;

    const paid = await prisma.$transaction(async (tx) => {
      const marked = await tx.chatUnlock.updateMany({
        where: { id: u.id, guaranteeSettledAt: null },
        data: { guaranteeSettledAt: now },
      });
      if (marked.count === 0 || !owed) return false;
      await tx.chatUnlockCredit.create({ data: { userId, reason: "NO_REPLY", sourceRef: u.id } });
      return true;
    });

    if (paid) {
      issued++;
      room--;
      // A consequence of the settlement, not part of it — a failed push must
      // not undo a credit the member is owed.
      await createNotice({
        userId,
        kind: "PLAN_GRANTED",
        title: "1 Chat Unlock wapas mila",
        body: `${NO_REPLY_GUARANTEE_HOURS} ghante me jawab nahi aaya, isliye aapka unlock credit ke roop me lauta diya gaya — kisi bhi rishte par use kar sakte hain.`,
        href: "/user/messages",
        relatedId: `chat-unlock-refund:${u.id}`,
      }).catch((err) => {
        console.error("[chat-unlock] refund notice failed:", err instanceof Error ? err.message : String(err));
      });
    }
  }
  return issued;
}

// ------------------------------------------------------------------ quote

async function passOffer(): Promise<PassOffer | null> {
  const pass = (await getPlanCatalog()).byCode.PASS;
  if (!pass || !pass.isActive || !pass.isPublic || pass.priceInPaise <= 0) return null;
  return { name: pass.name, pricePaise: pass.priceInPaise };
}

/**
 * How many free unlocks this member holds right now — for a screen that is not
 * about one chat (the plans page). Settles what is owed first, exactly as a
 * quote does, so the number never lags a refund the member has already earned.
 */
export async function availableChatUnlockCredits(userId: string, now = new Date()): Promise<number> {
  await Promise.all([ensurePartnerWelcomeCredit(userId), settleNoReplyGuarantees(userId, now)]);
  return prisma.chatUnlockCredit.count({ where: { userId, consumedAt: null } });
}

/** What opening this chat would take for this member, right now. */
export async function quoteChatUnlock(userId: string, matchId: string, now = new Date()): Promise<ChatUnlockQuoteView> {
  const guard = await checkUnlockable(userId, matchId);
  if (!guard.ok) return { state: "unavailable", message: guard.message };

  const access = await getChatAccess(userId, matchId, now);
  if (access.open) return { state: "open" };

  await Promise.all([ensurePartnerWelcomeCredit(userId), settleNoReplyGuarantees(userId, now)]);

  const [credits, pass] = await Promise.all([
    prisma.chatUnlockCredit.findMany({ where: { userId, consumedAt: null }, select: { reason: true } }),
    passOffer(),
  ]);
  if (credits.length > 0) {
    return {
      state: "credit",
      credits: credits.length,
      welcome: credits.some((c) => c.reason === "PARTNER_WELCOME"),
      pass,
    };
  }

  const item = itemOf(await getItemCatalog(), CHAT_UNLOCK_ITEM_CODE);
  if (!item || !item.isActive || !item.configValid || item.priceInPaise <= 0) {
    return { state: "unavailable", message: "Chat Unlock abhi available nahi hai." };
  }
  return { state: "pay", pricePaise: item.priceInPaise, pass };
}

// ------------------------------------------------------------------ opening

export type UnlockResult = { ok: true; alreadyOpen: boolean } | { ok: false; message: string; status: number };

class CreditSpentElsewhere extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * Opens the chat by spending the member's oldest credit.
 *
 * The unlock row and the spend are one transaction. If the other member's
 * unlock lands first, the unique `matchId` refuses the second row, the
 * transaction rolls back, and the credit is never spent — which is the answer
 * "already open" rather than an error.
 */
export async function unlockWithCredit(userId: string, matchId: string, now = new Date()): Promise<UnlockResult> {
  const guard = await checkUnlockable(userId, matchId);
  if (!guard.ok) return guard;
  if ((await getChatAccess(userId, matchId, now)).open) return { ok: true, alreadyOpen: true };

  try {
    return await prisma.$transaction(async (tx) => {
      const credit = await tx.chatUnlockCredit.findFirst({
        where: { userId, consumedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!credit) return { ok: false as const, message: "Aapke paas koi free unlock nahi bacha.", status: 409 };

      const unlock = await tx.chatUnlock.create({
        data: { matchId, unlockedByUserId: userId, source: "CREDIT", createdAt: now },
      });
      const spent = await tx.chatUnlockCredit.updateMany({
        where: { id: credit.id, consumedAt: null },
        data: { consumedAt: now, consumedUnlockId: unlock.id },
      });
      if (spent.count !== 1) throw new CreditSpentElsewhere();
      return { ok: true as const, alreadyOpen: false };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: true, alreadyOpen: true };
    if (err instanceof CreditSpentElsewhere) {
      return { ok: false, message: "Ye credit abhi-abhi kahin aur use hua — dobara try karein.", status: 409 };
    }
    throw err;
  }
}

/**
 * What a captured CHAT_UNLOCK payment does. Runs inside `handleGatewayEvent`'s
 * transaction; throws only on a payment that names no match at all.
 *
 * If the chat no longer needs opening — the other member's unlock landed
 * first, or the match is gone — the money becomes an ALREADY_OPEN credit
 * instead of a second row. Nobody pays for nothing.
 */
export async function fulfilChatUnlockPayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
  now: Date,
): Promise<{ matchId: string; alreadyOpen: boolean }> {
  const matchId = payment.itemRefId;
  if (!matchId) throw new Error(`[chat-unlock] payment ${payment.id} names no match.`);

  const match = await tx.match.findUnique({ where: { id: matchId }, select: { id: true } });
  const existing = match ? await tx.chatUnlock.findUnique({ where: { matchId }, select: { id: true } }) : null;

  if (!match || existing) {
    await tx.chatUnlockCredit.upsert({
      where: { userId_reason_sourceRef: { userId: payment.userId, reason: "ALREADY_OPEN", sourceRef: payment.id } },
      create: { userId: payment.userId, reason: "ALREADY_OPEN", sourceRef: payment.id },
      update: {},
    });
    return { matchId, alreadyOpen: true };
  }

  await tx.chatUnlock.create({
    data: { matchId, unlockedByUserId: payment.userId, source: "PAYMENT", paymentId: payment.id, createdAt: now },
  });
  return { matchId, alreadyOpen: false };
}
