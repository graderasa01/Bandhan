import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * The native app handing one signed-in member to the website, for one page.
 *
 * ## Why it exists
 *
 * A Chat Unlock started in the app ends on a checkout page (`/checkout/razorpay`,
 * or `/checkout/dummy` under the test gateway) opened in the phone's browser.
 * That page knows who is paying only from the website's httpOnly `bt_session`
 * cookie; the app's session lives in its keychain and travels only as a bearer
 * header, which a browser never sends. And the browser may be signed in as
 * nobody — iOS's in-app Safari never shares Safari's cookies — or as somebody
 * else on a shared phone.
 *
 * The bearer token itself must not make the trip: in a URL it would live on in
 * browser history, proxy logs and analytics for its whole 180-day life. So the
 * app trades it, over its own authenticated API, for a code that is worth one
 * page view: single-use, dead in two minutes, bound to the member who asked and
 * to the one checkout path they asked for.
 *
 * ## The rules the code carries
 *
 *  - **Hash only in the table**, the `PasswordResetToken` way: a database dump
 *    replays nothing.
 *  - **The landing path is fixed at mint time.** Redemption redirects to the
 *    stored path and never reads a destination from its own URL, so there is
 *    nothing to turn into an open redirect.
 *  - **Only a checkout the member can actually pay.** The path must be one of
 *    the two checkout pages and its order must be this member's own, still
 *    unpaid — the same row the page will look up.
 *  - **One redemption.** `consumedAt` is claimed by a conditional update whose
 *    count is checked, so a replay — or two tabs racing — gets nothing.
 */

/** Long enough for a phone to open its browser on a slow network; far too short to be worth stealing. */
export const WEB_HANDOFF_TTL_MS = 2 * 60 * 1000;

/** Where the app's browser lands with the code (app/api/auth/handoff). */
export const WEB_HANDOFF_ROUTE = "/api/auth/handoff";

/**
 * The pages a handoff may open: the two a gateway's `checkoutUrl` names
 * (`lib/services/payments/gateway.ts`). Both read only `order` from their query
 * and look the payment up by it for the signed-in member, so the target is
 * rebuilt as exactly that and anything else in the requested path is dropped.
 */
const CHECKOUT_PAGES = new Set(["/checkout/razorpay", "/checkout/dummy"]);

/** Razorpay's `order_…` and the dummy gateway's `dummy_order_…` ids. */
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** 32 random bytes as base64url — always exactly this long. */
const CODE = /^[A-Za-z0-9_-]{43}$/;

const PLACEHOLDER_ORIGIN = "http://handoff.invalid";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * The checkout page a relative path names, rebuilt canonically — or null for
 * anything a handoff may not open: an absolute or protocol-relative URL, any
 * other page, or a checkout without an order.
 */
export function handoffTarget(path: string): { path: string; orderId: string } | null {
  if (path.length > 512 || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(path, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || !CHECKOUT_PAGES.has(url.pathname)) return null;

  const orderId = url.searchParams.get("order");
  if (!orderId || !ORDER_ID.test(orderId)) return null;

  return { path: `${url.pathname}?order=${orderId}`, orderId };
}

export type MintWebHandoffResult =
  | { ok: true; url: string; expiresAt: Date }
  | { ok: false; status: number; message: string };

/**
 * A fresh code for `userId` to open `path` in a browser. The returned `url` is
 * relative — the app resolves it against the origin it already talks to.
 */
export async function mintWebHandoff(userId: string, path: string): Promise<MintWebHandoffResult> {
  const target = handoffTarget(path);
  if (!target) return { ok: false, status: 422, message: "Ye page app se browser me nahi khul sakta." };

  const payment = await prisma.payment.findFirst({
    where: { externalOrderId: target.orderId, userId, status: { in: ["CREATED", "AUTHORIZED"] } },
    select: { id: true },
  });
  if (!payment) {
    return { ok: false, status: 404, message: "Ye payment ab pending nahi hai — chat ka haal dobara check karein." };
  }

  const now = new Date();
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + WEB_HANDOFF_TTL_MS);

  // A dead code is useless to everybody, so this member's are swept on the way
  // in rather than by a cron — the table only ever holds the last few minutes.
  await prisma.$transaction([
    prisma.webHandoffToken.deleteMany({ where: { userId, expiresAt: { lt: now } } }),
    prisma.webHandoffToken.create({
      data: { userId, tokenHash: hashCode(code), path: target.path, expiresAt },
    }),
  ]);

  return { ok: true, url: `${WEB_HANDOFF_ROUTE}?code=${code}`, expiresAt };
}

export type RedeemWebHandoffResult = { ok: true; userId: string; path: string } | { ok: false };

/**
 * Spends a code. Unknown, expired and already-spent codes all answer the same
 * `{ ok: false }` — the caller has nothing different to do about any of them.
 */
export async function redeemWebHandoff(code: string): Promise<RedeemWebHandoffResult> {
  if (!CODE.test(code)) return { ok: false };

  const row = await prisma.webHandoffToken.findUnique({ where: { tokenHash: hashCode(code) } });
  if (!row) return { ok: false };

  const now = new Date();
  const claimed = await prisma.webHandoffToken.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) return { ok: false };

  // Re-checked on the way out, not only on the way in: the stored path is about
  // to become a redirect, and this is the last line before it is followed.
  const target = handoffTarget(row.path);
  if (!target || target.path !== row.path) return { ok: false };

  return { ok: true, userId: row.userId, path: target.path };
}
