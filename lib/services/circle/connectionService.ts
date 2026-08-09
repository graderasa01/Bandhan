import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createMatch } from "@/lib/services/match/confirmMutual";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import type { CircleConnection } from "@prisma/client";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Phase F — the Connect flow, and the one place chat is handed out for free.
 *
 * ## Both sides, or nothing
 *
 * A pairing is a *proposal to two people at once*, not an interest sent by
 * one. Neither side's answer is revealed to the other until both have
 * answered, and only mutual acceptance creates a `Match`. That is the same
 * consent rule the rest of the app runs on — a Circle pairing is the app
 * introducing two people, and an introduction nobody agreed to is a cold
 * approach with extra steps.
 *
 * A decline is never surfaced as a decline. The other side sees the pairing
 * quietly close. There is no version of "Priya ne mana kar diya" that is worth
 * showing a human being.
 *
 * ## The 48-hour window, and why it isn't a hole in the plan ladder
 *
 * `rewardService`'s rule is that an earned reward may widen what a user can
 * *see* but never hand over what the plans exist to *sell* — chat is
 * explicitly on its "never" list. This window sits *outside* that ledger
 * deliberately, and it is worth being precise about why it is not the same
 * thing wearing a costume:
 *
 *   - It is **pair-scoped**, not account-scoped. It opens one conversation,
 *     with one person, chosen by the matcher — not "chat" as a capability.
 *   - It is **expiring and short**. 48 hours (7 days for the event's top pair).
 *   - It is **not grantable**. There is no `RewardKind` for it and no admin
 *     path to it; the only way to hold one is to have attended an event and
 *     had someone accept you back.
 *   - Its purpose is **conversion, not generosity**. A free user who has never
 *     experienced chat cannot value it. This is the trial, and the window
 *     closing mid-conversation is the strongest upgrade prompt the product
 *     has.
 *
 * If any of those four stop being true, this has become a free tier and should
 * be deleted.
 */

const HOUR_MS = 3_600_000;

/** Standard window for a mutual Circle connection. */
export const CONNECT_WINDOW_HOURS = 48;
/** The event's single best-scoring pair (`rank = 1`) — the "sabse achhi jodi" prize. */
export const TOP_PAIR_WINDOW_HOURS = 24 * 7;

/**
 * How long after the room closes a pairing can still be answered.
 *
 * Without this, a pair where one person opened at 8:15pm and the other at
 * 9:55pm would almost always fail — the second person's answer would land
 * after the window shut. Requiring both answers inside two hours would kill
 * most connections for a reason that has nothing to do with either person's
 * interest.
 */
export const CONNECT_GRACE_HOURS = 24;

export type ConnectionSide = "A" | "B";

export function sideFor(conn: CircleConnection, userId: string): ConnectionSide | null {
  if (conn.userAId === userId) return "A";
  if (conn.userBId === userId) return "B";
  return null;
}

export function otherUserId(conn: CircleConnection, userId: string): string {
  return conn.userAId === userId ? conn.userBId : conn.userAId;
}

export type AnswerResult =
  | { ok: true; connected: boolean; windowEndsAt: Date | null; matchId: string | null }
  | { ok: false; error: string; message: string; status: number };

/**
 * Records one side's yes/no. Creates the `Match` and opens the window only on
 * the second yes.
 */
export async function answerConnection(
  userId: string,
  connectionId: string,
  accept: boolean,
  now = new Date(),
  t: Translate = noopT,
): Promise<AnswerResult> {
  const conn = await prisma.circleConnection.findUnique({
    where: { id: connectionId },
    include: { event: true },
  });
  if (!conn) {
    return { ok: false, error: "NOT_FOUND", message: t("circle.connection.error.notFound", "Ye connection nahi mila."), status: 404 };
  }

  const side = sideFor(conn, userId);
  if (!side) {
    return { ok: false, error: "FORBIDDEN", message: t("circle.connection.error.forbidden", "Ye connection aapka nahi hai."), status: 403 };
  }

  if (now < conn.event.startsAt) {
    return { ok: false, error: "NOT_OPEN", message: t("circle.connection.error.notOpen", "Circle abhi shuru nahi hua."), status: 409 };
  }
  const answerDeadline = new Date(conn.event.endsAt.getTime() + CONNECT_GRACE_HOURS * HOUR_MS);
  if (now > answerDeadline) {
    return { ok: false, error: "CLOSED", message: t("circle.connection.error.closed", "Is Circle ka samay khatam ho gaya."), status: 409 };
  }

  const alreadyAnswered = side === "A" ? conn.aAnsweredAt : conn.bAnsweredAt;
  if (alreadyAnswered) {
    return {
      ok: false,
      error: "ALREADY_ANSWERED",
      message: t("circle.connection.error.alreadyAnswered", "Aap jawab de chuke hain."),
      status: 409,
    };
  }

  const mine = side === "A" ? { aAnsweredAt: now, aAccepted: accept } : { bAnsweredAt: now, bAccepted: accept };
  const theirAccepted = side === "A" ? conn.bAccepted : conn.aAccepted;
  const bothYes = accept && theirAccepted === true;

  if (!bothYes) {
    await prisma.circleConnection.update({ where: { id: conn.id }, data: mine });
    return { ok: true, connected: false, windowEndsAt: null, matchId: null };
  }

  const hours = conn.rank === 1 ? TOP_PAIR_WINDOW_HOURS : CONNECT_WINDOW_HOURS;
  const windowEndsAt = new Date(now.getTime() + hours * HOUR_MS);

  const match = await createMatch(conn.userAId, conn.userBId);

  const updated = await prisma.circleConnection.update({
    where: { id: conn.id },
    data: { ...mine, connectedAt: now, windowEndsAt, matchId: match.id },
  });

  const windowText =
    conn.rank === 1
      ? "Aap dono is Circle ki sabse achhi jodi hain — 7 din tak khulkar baat kijiye."
      : "48 ghante tak baat kar sakte hain, plan chahe jo bhi ho.";

  for (const uid of [conn.userAId, conn.userBId]) {
    await createNotice({
      userId: uid,
      kind: "MATCH_CREATED",
      title: "Circle me connection ho gaya",
      body: windowText,
      href: `/user/messages/${match.id}`,
      relatedId: match.id,
    });
  }

  return { ok: true, connected: true, windowEndsAt: updated.windowEndsAt, matchId: match.id };
}

/**
 * Whether this user may send a message in this match right now.
 *
 * Two independent yeses: the plan's `chat` capability, or a live Circle
 * window on this specific match. Written as one function so the send path has
 * exactly one gate to call and the window can never be checked in one place
 * and forgotten in another.
 */
export async function canChatInMatch(
  userId: string,
  matchId: string,
  now = new Date(),
): Promise<{ allowed: boolean; via: "plan" | "circle" | "none"; windowEndsAt: Date | null }> {
  const features = await getEntitlements(userId);
  if (features.chat) return { allowed: true, via: "plan", windowEndsAt: null };

  const open = await prisma.circleConnection.findFirst({
    where: { matchId, connectedAt: { not: null }, windowEndsAt: { gt: now } },
    select: { windowEndsAt: true },
  });
  if (open) return { allowed: true, via: "circle", windowEndsAt: open.windowEndsAt };

  return { allowed: false, via: "none", windowEndsAt: null };
}

export interface CircleConnectionView {
  id: string;
  rank: number;
  score: number;
  /** Verifiable "why" from lock time — e.g. "7 me se 5 sawaalon par ek jaisa jawab". */
  sochReason: string | null;
  otherUserId: string;
  myAnswer: boolean | null;
  /** Never the other side's raw answer — see below. */
  status: "waiting_for_me" | "waiting_for_them" | "connected" | "closed";
  connectedAt: string | null;
  windowEndsAt: string | null;
  matchId: string | null;
}

/**
 * This user's pairings for an event.
 *
 * `status` deliberately collapses "they said no" and "they haven't answered"
 * into different-looking-but-non-accusatory states: a declined pairing reads
 * as `closed`, identical to one that simply ran out of time. The other
 * person's answer is never returned to the client in any form.
 */
export async function getMyConnections(
  userId: string,
  eventId: string,
  now = new Date(),
): Promise<CircleConnectionView[]> {
  const rows = await prisma.circleConnection.findMany({
    where: { eventId, OR: [{ userAId: userId }, { userBId: userId }] },
    include: { event: { select: { endsAt: true } } },
    orderBy: { rank: "asc" },
  });

  return rows.map((conn) => {
    const side = sideFor(conn, userId)!;
    const myAnswer = side === "A" ? conn.aAccepted : conn.bAccepted;
    const theirAnswer = side === "A" ? conn.bAccepted : conn.aAccepted;
    const expired = now > new Date(conn.event.endsAt.getTime() + CONNECT_GRACE_HOURS * HOUR_MS);

    let status: CircleConnectionView["status"];
    if (conn.connectedAt) status = "connected";
    else if (myAnswer === null && !expired) status = "waiting_for_me";
    else if (myAnswer === true && theirAnswer === null && !expired) status = "waiting_for_them";
    else status = "closed";

    return {
      id: conn.id,
      rank: conn.rank,
      score: conn.score,
      sochReason: conn.sochReason,
      otherUserId: otherUserId(conn, userId),
      myAnswer,
      status,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
      windowEndsAt: conn.windowEndsAt?.toISOString() ?? null,
      matchId: conn.matchId,
    };
  });
}
