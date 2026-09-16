import "./_env";
import { prisma } from "../lib/db/prisma";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import {
  CHAT_UNLOCK_ITEM_CODE,
  NO_REPLY_CREDIT_CAP,
  ensurePartnerWelcomeCredit,
  getChatAccess,
  quoteChatUnlock,
  settleNoReplyGuarantees,
  unlockWithCredit,
} from "../lib/services/chat/chatUnlockService";
import { createItemCheckout } from "../lib/services/items/itemPurchaseService";
import { getItemCatalog, itemOf } from "../lib/services/items/itemCatalog";
import { agreeToShareContact } from "../lib/services/match/contactShare";
import { canChatInMatch } from "../lib/services/circle/connectionService";
import { NO_REPLY_GUARANTEE_HOURS } from "../lib/contracts/chatUnlock";

/**
 * Chat Unlock (D-90) — every promise the unlock card makes, checked against
 * the code that has to keep it.
 *
 * Never reaches a gateway. `createItemCheckout` is only called for purchases
 * that must be refused (it returns before any order is created), and the paid
 * path is exercised the way items-check.ts does it: a Payment row written
 * straight into the local DB, handed to `handleGatewayEvent`. This machine's
 * env carries live Razorpay keys, so that distinction is not academic.
 *
 * Run: `npx tsx scripts/chat-unlock-check.ts`
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
const HOUR_MS = 3_600_000;
const createdUserIds: string[] = [];

async function makeUser(name: string, role: "USER" | "PARTNER" = "USER") {
  const user = await prisma.user.create({
    data: {
      fullName: name,
      email: `chat-unlock-${name.toLowerCase()}-${stamp}@local.test`,
      passwordHash: "x",
      status: "ACTIVE",
      role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeMatch(aId: string, bId: string) {
  return prisma.match.create({ data: { userAId: aId, userBId: bId } });
}

async function payForUnlock(userId: string, matchId: string, pricePaise: number) {
  const orderId = `test_chat_unlock_${userId.slice(0, 6)}_${Math.random().toString(36).slice(2, 8)}`;
  const payment = await prisma.payment.create({
    data: {
      userId,
      kind: "ITEM",
      planCode: null,
      itemCode: CHAT_UNLOCK_ITEM_CODE,
      itemRefId: matchId,
      amountPaise: pricePaise,
      status: "CREATED",
      externalOrderId: orderId,
      isTest: true,
    },
  });
  const outcome = await handleGatewayEvent({
    orderId,
    paymentId: `pay_${orderId}`,
    status: "CAPTURED",
    amountPaise: pricePaise,
  });
  return { payment, orderId, outcome };
}

async function main() {
  const item = itemOf(await getItemCatalog(), CHAT_UNLOCK_ITEM_CODE);
  check("CHAT_UNLOCK is in the live catalog", item !== null && item.kind === "CHAT_UNLOCK");
  if (!item) throw new Error("no CHAT_UNLOCK item — nothing else can be checked");
  const price = item.priceInPaise;

  console.log("\nA fresh match between two FREE members is closed");

  const asha = await makeUser("Asha");
  const bharat = await makeUser("Bharat");
  const outsider = await makeUser("Outsider");
  const m1 = await makeMatch(asha.id, bharat.id);

  check("closed for Asha", (await getChatAccess(asha.id, m1.id)).open === false);
  check("closed for Bharat", (await getChatAccess(bharat.id, m1.id)).open === false);
  check("the message gate agrees", (await canChatInMatch(bharat.id, m1.id)).allowed === false);
  check("an outsider reads it as closed, never as a probe", (await getChatAccess(outsider.id, m1.id)).open === false);

  const quote = await quoteChatUnlock(asha.id, m1.id);
  check("the quote asks for the catalog price", quote.state === "pay" && quote.pricePaise === price, JSON.stringify(quote));

  console.log("\nNumbers cannot be swapped before the chat opens");

  const share = await agreeToShareContact(m1.id, asha.id);
  check("contact share is refused", share.ok === false && share.error === "CHAT_LOCKED", JSON.stringify(share));

  console.log("\nCheckout refuses what it must — before any gateway");

  const notMine = await createItemCheckout(outsider.id, CHAT_UNLOCK_ITEM_CODE, { matchId: m1.id });
  check("someone outside the match cannot buy it", notMine.ok === false);
  const noMatch = await createItemCheckout(asha.id, CHAT_UNLOCK_ITEM_CODE, {});
  check("an unlock with no match chosen is refused", noMatch.ok === false);
  check(
    "and neither created a payment row",
    (await prisma.payment.count({ where: { userId: { in: [outsider.id, asha.id] } } })) === 0,
  );

  console.log("\nA captured payment opens the chat — for both");

  const first = await payForUnlock(asha.id, m1.id, price);
  check("the capture is handled", first.outcome.handled === true && first.outcome.action === "captured");
  const unlock = await prisma.chatUnlock.findUnique({ where: { matchId: m1.id } });
  check("one unlock row, from the payment", unlock?.source === "PAYMENT" && unlock.paymentId === first.payment.id);
  check("open for Asha", (await getChatAccess(asha.id, m1.id)).open === true);
  check("open for Bharat, who paid nothing", (await getChatAccess(bharat.id, m1.id)).open === true);
  check("the message gate agrees for Bharat", (await canChatInMatch(bharat.id, m1.id)).allowed === true);
  const captured = await prisma.payment.findUnique({ where: { id: first.payment.id } });
  check("the payment still names the match", captured?.status === "CAPTURED" && captured.itemRefId === m1.id);
  const notice = await prisma.notice.findFirst({ where: { userId: asha.id, relatedId: first.payment.id } });
  check("Asha is told, with a link to the thread", notice?.href === `/user/messages/${m1.id}`);
  check("no commission without a referral", (await prisma.partnerCommission.count({ where: { userId: asha.id } })) === 0);

  const replay = await handleGatewayEvent({
    orderId: first.orderId,
    paymentId: `pay_${first.orderId}`,
    status: "CAPTURED",
    amountPaise: price,
  });
  check("a redelivered webhook is a duplicate", replay.handled && replay.action === "duplicate");

  console.log("\nPaying for a chat that is already open becomes a credit, not a second row");

  const second = await payForUnlock(bharat.id, m1.id, price);
  check("handled", second.outcome.handled === true);
  check("still exactly one unlock", (await prisma.chatUnlock.count({ where: { matchId: m1.id } })) === 1);
  const alreadyOpen = await prisma.chatUnlockCredit.findMany({ where: { userId: bharat.id, consumedAt: null } });
  check(
    "Bharat holds one ALREADY_OPEN credit",
    alreadyOpen.length === 1 && alreadyOpen[0]?.reason === "ALREADY_OPEN" && alreadyOpen[0]?.sourceRef === second.payment.id,
  );

  console.log("\nCheckout is refused for an open chat, and for a member holding a credit");

  const openAgain = await createItemCheckout(asha.id, CHAT_UNLOCK_ITEM_CODE, { matchId: m1.id });
  check("an open chat cannot be bought again", openAgain.ok === false && openAgain.message.includes("pehle se"));

  const chitra = await makeUser("Chitra");
  const m2 = await makeMatch(bharat.id, chitra.id);
  const pastCredit = await createItemCheckout(bharat.id, CHAT_UNLOCK_ITEM_CODE, { matchId: m2.id });
  check(
    "a member with a free unlock is not charged past it",
    pastCredit.ok === false && pastCredit.message.includes("free unlock"),
  );

  console.log("\nA credit opens a chat");

  const creditQuote = await quoteChatUnlock(bharat.id, m2.id);
  check("the quote offers the credit", creditQuote.state === "credit" && creditQuote.credits === 1, JSON.stringify(creditQuote));
  const spent = await unlockWithCredit(bharat.id, m2.id);
  check("unlocking with it works", spent.ok === true && spent.alreadyOpen === false, JSON.stringify(spent));
  const creditUnlock = await prisma.chatUnlock.findUnique({ where: { matchId: m2.id } });
  check("the unlock is marked as credit-funded", creditUnlock?.source === "CREDIT");
  const consumed = await prisma.chatUnlockCredit.findFirst({ where: { userId: bharat.id } });
  check("the credit is spent on exactly that unlock", consumed?.consumedAt !== null && consumed?.consumedUnlockId === creditUnlock?.id);
  check("open for Chitra too", (await getChatAccess(chitra.id, m2.id)).open === true);
  const noneLeft = await unlockWithCredit(bharat.id, (await makeMatch(bharat.id, outsider.id)).id);
  check("with no credit left, nothing is opened for free", noneLeft.ok === false);

  console.log("\nA partner's family gets the first chat free — once, and only from a partner in good standing");

  const partnerUser = await makeUser("PanditJi", "PARTNER");
  const partner = await prisma.partner.create({
    data: {
      userId: partnerUser.id,
      fullName: "Pandit Ji Check",
      mobileNumber: `90${String(stamp).slice(-8)}`,
      city: "Jaipur",
      state: "Rajasthan",
      partnerType: "PANDIT",
      status: "APPROVED",
    },
  });
  const dev = await makeUser("Dev");
  await prisma.partnerReferral.create({ data: { userId: dev.id, partnerId: partner.id, codeUsed: "CHECK" } });
  await ensurePartnerWelcomeCredit(dev.id);
  await ensurePartnerWelcomeCredit(dev.id);
  const welcome = await prisma.chatUnlockCredit.findMany({ where: { userId: dev.id } });
  check("exactly one welcome credit", welcome.length === 1 && welcome[0]?.reason === "PARTNER_WELCOME");
  const esha = await makeUser("Esha");
  const m3 = await makeMatch(dev.id, esha.id);
  const welcomeQuote = await quoteChatUnlock(dev.id, m3.id);
  check("the quote names it as the partner's gift", welcomeQuote.state === "credit" && welcomeQuote.welcome === true);

  const suspendedUser = await makeUser("SuspendedPartner", "PARTNER");
  const suspended = await prisma.partner.create({
    data: {
      userId: suspendedUser.id,
      fullName: "Suspended Check",
      mobileNumber: `91${String(stamp).slice(-8)}`,
      city: "Jaipur",
      state: "Rajasthan",
      partnerType: "PANDIT",
      status: "SUSPENDED",
    },
  });
  const farah = await makeUser("Farah");
  await prisma.partnerReferral.create({ data: { userId: farah.id, partnerId: suspended.id, codeUsed: "CHECK2" } });
  await ensurePartnerWelcomeCredit(farah.id);
  check("a suspended partner's referral gives nothing", (await prisma.chatUnlockCredit.count({ where: { userId: farah.id } })) === 0);

  console.log("\nA referred member's paid unlock earns the partner their share");

  const gopal = await makeUser("Gopal");
  const m4 = await makeMatch(farah.id, gopal.id);
  await prisma.partnerReferral.update({ where: { userId: farah.id }, data: { partnerId: partner.id } });
  const referredPay = await payForUnlock(farah.id, m4.id, price);
  check("handled", referredPay.outcome.handled === true);
  const commission = await prisma.partnerCommission.findUnique({ where: { paymentId: referredPay.payment.id } });
  check(
    "a commission row for the approved partner, on what was captured",
    commission?.partnerId === partner.id && commission.basePaise === price && commission.amountPaise > 0,
    JSON.stringify(commission),
  );

  console.log(`\nThe ${NO_REPLY_GUARANTEE_HOURS}-hour promise`);

  const now = new Date();
  const past = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);

  const hari = await makeUser("Hari");
  const indu = await makeUser("Indu");
  const m5 = await makeMatch(hari.id, indu.id);
  const owed = await prisma.chatUnlock.create({
    data: { matchId: m5.id, unlockedByUserId: hari.id, source: "PAYMENT", createdAt: past(80) },
  });
  await prisma.message.create({ data: { matchId: m5.id, senderId: hari.id, body: "Namaste", createdAt: past(79) } });
  check("a member who wrote and heard nothing gets one credit", (await settleNoReplyGuarantees(hari.id, now)) === 1);
  const refund = await prisma.chatUnlockCredit.findFirst({ where: { userId: hari.id, reason: "NO_REPLY" } });
  check("the credit names the unlock it refunds", refund?.sourceRef === owed.id);
  check("the unlock is marked settled", (await prisma.chatUnlock.findUnique({ where: { id: owed.id } }))?.guaranteeSettledAt !== null);
  check("settling again pays nothing twice", (await settleNoReplyGuarantees(hari.id, now)) === 0);

  const jai = await makeUser("Jai");
  const kavya = await makeUser("Kavya");
  const m6 = await makeMatch(jai.id, kavya.id);
  const silent = await prisma.chatUnlock.create({
    data: { matchId: m6.id, unlockedByUserId: jai.id, source: "PAYMENT", createdAt: past(80) },
  });
  check("no credit when the buyer never wrote", (await settleNoReplyGuarantees(jai.id, now)) === 0);
  check("but the unlock is settled for good", (await prisma.chatUnlock.findUnique({ where: { id: silent.id } }))?.guaranteeSettledAt !== null);

  const lata = await makeUser("Lata");
  const mohan = await makeUser("Mohan");
  const m7 = await makeMatch(lata.id, mohan.id);
  await prisma.chatUnlock.create({ data: { matchId: m7.id, unlockedByUserId: lata.id, source: "PAYMENT", createdAt: past(80) } });
  await prisma.message.create({ data: { matchId: m7.id, senderId: lata.id, body: "Hello", createdAt: past(79) } });
  await prisma.message.create({ data: { matchId: m7.id, senderId: mohan.id, body: "Namaste ji", createdAt: past(70) } });
  check("no credit when the other side wrote back in time", (await settleNoReplyGuarantees(lata.id, now)) === 0);

  const neha = await makeUser("Neha");
  const om = await makeUser("Om");
  const m8 = await makeMatch(neha.id, om.id);
  const early = await prisma.chatUnlock.create({
    data: { matchId: m8.id, unlockedByUserId: neha.id, source: "PAYMENT", createdAt: past(10) },
  });
  await prisma.message.create({ data: { matchId: m8.id, senderId: neha.id, body: "Hi", createdAt: past(9) } });
  check(`nothing is decided before ${NO_REPLY_GUARANTEE_HOURS} hours`, (await settleNoReplyGuarantees(neha.id, now)) === 0);
  check("and the unlock is left unsettled", (await prisma.chatUnlock.findUnique({ where: { id: early.id } }))?.guaranteeSettledAt === null);

  const pooja = await makeUser("Pooja");
  const ravi = await makeUser("Ravi");
  for (let i = 0; i < NO_REPLY_CREDIT_CAP; i++) {
    await prisma.chatUnlockCredit.create({ data: { userId: pooja.id, reason: "NO_REPLY", sourceRef: `earlier-${i}` } });
  }
  const m9 = await makeMatch(pooja.id, ravi.id);
  const overCap = await prisma.chatUnlock.create({
    data: { matchId: m9.id, unlockedByUserId: pooja.id, source: "PAYMENT", createdAt: past(80) },
  });
  await prisma.message.create({ data: { matchId: m9.id, senderId: pooja.id, body: "Namaste", createdAt: past(79) } });
  check(`the month's ${NO_REPLY_CREDIT_CAP}-refund cap holds`, (await settleNoReplyGuarantees(pooja.id, now)) === 0);
  check(
    "and the owed unlock waits, unsettled, instead of being lost",
    (await prisma.chatUnlock.findUnique({ where: { id: overCap.id } }))?.guaranteeSettledAt === null,
  );

  console.log("\nA Rishta Pass holder's matches can answer them");

  const sagar = await makeUser("Sagar");
  const tara = await makeUser("Tara");
  await prisma.subscription.create({
    data: { userId: sagar.id, planCode: "PASS", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 30 * 24 * HOUR_MS) },
  });
  const m10 = await makeMatch(sagar.id, tara.id);
  const passAccess = await getChatAccess(tara.id, m10.id);
  check("open for the FREE side, through the Pass holder's plan", passAccess.open === true && passAccess.via === "plan");
  check("and the quote says there is nothing to pay", (await quoteChatUnlock(tara.id, m10.id)).state === "open");

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    // Commissions reference payments, and payments reference users — clear the
    // money rows first so deleting the test users cannot be blocked by them.
    await prisma.partnerCommission.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    for (const id of createdUserIds) await prisma.user.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
