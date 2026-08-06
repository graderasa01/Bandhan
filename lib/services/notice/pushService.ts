import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPushConfigured, sendPush, type PushPayload } from "./webPush";

/**
 * The bridge between the app's one inbox and the user's lock screen.
 *
 * ## One wiring point, not nine
 *
 * `createNotice` is already the single funnel every feature uses to tell a user
 * something happened — voice notes, questions, matches, quests, rewards,
 * matchmaker updates. Hooking push in *there* rather than at each call site
 * means every existing notice kind became a push notification the day this
 * landed, and every future one arrives wired. The alternative — a
 * `sendPush(...)` next to each `createNotice(...)` — is nine places to forget.
 *
 * ## Fan-out is per device, and pruning is opportunistic
 *
 * A user may hold several subscriptions (phone browser, installed PWA, laptop).
 * All of them get the notification; the service worker's `tag` collapses
 * duplicates within a device, not across them, which is what a user expects —
 * the phone buzzing and the laptop showing a banner is correct.
 *
 * A push service answers 404/410 for an endpoint the browser has discarded.
 * That is the only reliable liveness signal in the protocol, so it is also the
 * only garbage collection this table gets: prune on the failure, never on a
 * timer.
 *
 * ## Never blocks, never throws
 *
 * Every function resolves. A push is downstream of a database write that has
 * already committed; if the push service is down, the notice is still in the
 * inbox and the bell still counts it. Losing the buzz is a degraded
 * notification, not a lost one.
 */

export async function saveSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: params.endpoint },
    // A re-subscribe from a different account on a shared device must move the
    // endpoint, not duplicate it — otherwise the previous user keeps getting
    // this browser's notifications.
    update: {
      userId: params.userId,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    },
    create: {
      userId: params.userId,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    },
  });
}

/** Scoped by userId as well as endpoint — an endpoint alone must not address someone else's row. */
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function countSubscriptions(userId: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { userId } });
}

/**
 * Delivers one payload to every device this user has registered.
 *
 * Returns the number actually delivered, which callers are free to ignore —
 * it exists so the settings screen can say "3 devices par on hai" truthfully
 * after a test push, rather than claiming success it never verified.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const results = await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPush(
        sub.endpoint,
        { p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );
      if (result === "expired") {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        return false;
      }
      if (result === "sent") {
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastSentAt: new Date() } })
          .catch(() => {});
        return true;
      }
      return false;
    }),
  );

  return results.filter(Boolean).length;
}
