import "./_env";
import { createHash } from "crypto";
import { prisma } from "../lib/db/prisma";
import {
  WEB_HANDOFF_ROUTE,
  handoffTarget,
  mintWebHandoff,
  redeemWebHandoff,
} from "../lib/services/auth/webHandoffService";

/**
 * App → website checkout handoff — every rule `webHandoffService` promises,
 * checked against the service itself.
 *
 * Writes only to the LOCAL database (refuses to start anywhere else) and never
 * reaches a gateway: the payments below are rows with made-up order ids, which
 * is all the handoff looks at. The route layer (cookie, redirect, native-only
 * mint) is exercised against a running local server, not here.
 *
 * Run: `npx tsx scripts/web-handoff-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const createdUserIds: string[] = [];

async function makeUser(name: string) {
  const user = await prisma.user.create({
    data: {
      fullName: name,
      email: `web-handoff-${name.toLowerCase()}-${stamp}@local.test`,
      passwordHash: "x",
      status: "ACTIVE",
      role: "USER",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makePayment(userId: string, status: "CREATED" | "CAPTURED" = "CREATED") {
  const orderId = `dummy_order_${Math.random().toString(16).slice(2, 18)}`;
  await prisma.payment.create({
    data: { userId, kind: "ITEM", planCode: null, itemCode: "CHAT_UNLOCK", amountPaise: 9900, status, externalOrderId: orderId, isTest: true },
  });
  return orderId;
}

function codeOf(url: string): string {
  return new URL(url, "http://x.invalid").searchParams.get("code") ?? "";
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://unset").host;
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    throw new Error(`Refusing to write test rows to ${host} — this check runs against the local database only.`);
  }
  console.log(`DB ${host}\n`);

  console.log("Only BandhanTak's own checkout pages, rebuilt canonically");
  const canonical = handoffTarget("/checkout/razorpay?order=order_ABC123&key=publishable-key-id&next=https://evil.test");
  check("a Razorpay checkout keeps only its order", canonical?.path === "/checkout/razorpay?order=order_ABC123", JSON.stringify(canonical));
  check("the dummy checkout is allowed", handoffTarget("/checkout/dummy?order=dummy_order_1&amount=9900&receipt=r")?.path === "/checkout/dummy?order=dummy_order_1");
  for (const bad of [
    "https://evil.test/checkout/razorpay?order=order_1",
    "//evil.test/checkout/razorpay?order=order_1",
    "/\\evil.test/checkout/razorpay?order=order_1",
    "/user/messages?order=order_1",
    "/checkout/razorpay",
    "/checkout/razorpay?order=",
    "/checkout/razorpay?order=../../admin",
    "/checkout/razorpay/../../user/messages?order=order_1",
    "/%2F%2Fevil.test/checkout/razorpay?order=order_1",
    "checkout/razorpay?order=order_1",
    `/checkout/razorpay?order=${"a".repeat(600)}`,
  ]) {
    check(`refuses ${bad.length > 60 ? `${bad.slice(0, 40)}…` : bad}`, handoffTarget(bad) === null);
  }

  const asha = await makeUser("Asha");
  const vikram = await makeUser("Vikram");
  const ashaOrder = await makePayment(asha.id);
  const vikramOrder = await makePayment(vikram.id);
  const paidOrder = await makePayment(asha.id, "CAPTURED");

  console.log("\nMinting is bound to the member's own unpaid checkout");
  const minted = await mintWebHandoff(asha.id, `/checkout/dummy?order=${ashaOrder}&amount=9900`);
  check("own pending order → a code", minted.ok);
  if (!minted.ok) throw new Error("cannot continue without a minted code");
  check("the URL is relative, on the handoff route", minted.url.startsWith(`${WEB_HANDOFF_ROUTE}?code=`), minted.url);
  const code = codeOf(minted.url);
  check("32 random bytes, base64url", /^[A-Za-z0-9_-]{43}$/.test(code));
  check("expires in about two minutes", Math.abs(minted.expiresAt.getTime() - Date.now() - 120_000) < 10_000);
  const stored = await prisma.webHandoffToken.findUnique({ where: { tokenHash: createHash("sha256").update(code).digest("hex") } });
  check("stored as a hash with the canonical path", stored?.path === `/checkout/dummy?order=${ashaOrder}` && stored.userId === asha.id);
  check("the raw code is nowhere in the table", (await prisma.webHandoffToken.count({ where: { tokenHash: code } })) === 0);

  const others = await mintWebHandoff(asha.id, `/checkout/dummy?order=${vikramOrder}`);
  check("somebody else's order → refused", !others.ok && others.status === 404);
  const paid = await mintWebHandoff(asha.id, `/checkout/dummy?order=${paidOrder}`);
  check("an already-paid order → refused", !paid.ok && paid.status === 404);
  const page = await mintWebHandoff(asha.id, "/user/dashboard");
  check("any other page → refused", !page.ok && page.status === 422);

  console.log("\nRedemption: once, in time, and only where it was minted for");
  const first = await redeemWebHandoff(code);
  check("first use → the member and the stored path", first.ok && first.userId === asha.id && first.path === `/checkout/dummy?order=${ashaOrder}`);
  check("second use → nothing", !(await redeemWebHandoff(code)).ok);
  check("malformed code → nothing", !(await redeemWebHandoff("not-a-code")).ok);
  check("well-formed unknown code → nothing", !(await redeemWebHandoff("A".repeat(43))).ok);

  const late = await mintWebHandoff(asha.id, `/checkout/dummy?order=${ashaOrder}`);
  if (!late.ok) throw new Error("mint failed");
  await prisma.webHandoffToken.updateMany({ where: { userId: asha.id, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check("expired code → nothing", !(await redeemWebHandoff(codeOf(late.url))).ok);

  const raced = await mintWebHandoff(vikram.id, `/checkout/dummy?order=${vikramOrder}`);
  if (!raced.ok) throw new Error("mint failed");
  const both = await Promise.all([redeemWebHandoff(codeOf(raced.url)), redeemWebHandoff(codeOf(raced.url))]);
  check("two tabs racing one code → exactly one wins", both.filter((r) => r.ok).length === 1);

  const tampered = await mintWebHandoff(vikram.id, `/checkout/dummy?order=${vikramOrder}`);
  if (!tampered.ok) throw new Error("mint failed");
  await prisma.webHandoffToken.updateMany({
    where: { userId: vikram.id, consumedAt: null },
    data: { path: "https://evil.test/checkout/dummy?order=x" },
  });
  check("a row whose path was changed after minting → refused", !(await redeemWebHandoff(codeOf(tampered.url))).ok);

  console.log("\nHousekeeping without a cron");
  const expiredBefore = await prisma.webHandoffToken.count({ where: { userId: asha.id, expiresAt: { lt: new Date() } } });
  await mintWebHandoff(asha.id, `/checkout/dummy?order=${ashaOrder}`);
  const expiredAfter = await prisma.webHandoffToken.count({ where: { userId: asha.id, expiresAt: { lt: new Date() } } });
  check("minting sweeps the member's expired codes", expiredBefore > 0 && expiredAfter === 0, `${expiredBefore} → ${expiredAfter}`);

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    // Handoff codes cascade with their user; payments do not.
    await prisma.payment.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    for (const id of createdUserIds) await prisma.user.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
