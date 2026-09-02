import "./_env";
import { prisma } from "../lib/db/prisma";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import { blockUser } from "../lib/services/safety/blockService";
import {
  createVerificationRequest,
  getPairVerification,
  listVerificationRequests,
  subjectDecide,
} from "../lib/services/verification/verificationRequestService";
import { listVerificationBadges } from "../lib/services/verification/verificationBadgeService";
import { getVerificationQueue, recordResult } from "../lib/services/verification/humanVerificationQueue";
import { catalogFor } from "../lib/services/verification/verificationCatalog";
import type { User } from "@prisma/client";

/**
 * Verification services — Phase 5.
 *
 * Run: `npx tsx scripts/verification-check.ts`
 *
 * Three acceptance rules, and this script exists because all three are the kind
 * that stay true right up until the day somebody adds a helpful shortcut:
 *
 *   1. **Paying does not change the result.** The money path is exercised end
 *      to end — a real order, a real capture through `handleGatewayEvent` — and
 *      the check that comes out the other side is asserted to be *empty*. Only
 *      an admin recording evidence fills it in.
 *
 *   2. **Raw evidence never reaches a member.** Every member-facing payload is
 *      serialised and searched for the evidence string. Not "the UI hides it" —
 *      the bytes are not there.
 *
 *   3. **Every badge names its scope and date, and an expired one asserts
 *      nothing.** Including after the catalog's wording has moved on: the badge
 *      shows what was frozen onto the check, not today's sentence.
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
const userIds: string[] = [];

async function makeUser(name: string, role: "USER" | "ADMIN" = "USER"): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: `${name} Verifykumar`,
      email: `verify-${name}-${stamp}@local.test`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function cleanup() {
  await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/** Drives one share through the real gateway path, exactly as production would. */
async function captureShare(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  await handleGatewayEvent({
    orderId: payment.externalOrderId!,
    paymentId: `pay_${stamp}_${paymentId.slice(0, 8)}`,
    status: "CAPTURED",
    amountPaise: payment.amountPaise,
  });
}

async function main() {
  console.log("\nVerification services — Phase 5\n");

  const asker = await makeUser("Asker");
  const subject = await makeUser("Subject");
  const stranger = await makeUser("Stranger");
  const admin = await makeUser("Admin", "ADMIN");

  await prisma.interest.create({ data: { fromUserId: asker.id, toUserId: subject.id, status: "PENDING" } });

  /* ---------------------------------------------------------------- */
  console.log("Who may ask whom");
  /* ---------------------------------------------------------------- */

  const noRishta = await createVerificationRequest({
    requesterUserId: asker.id,
    subjectUserId: stranger.id,
    kind: "IDENTITY",
    payer: "REQUESTER",
  });
  check("a stranger cannot be asked for proof", !noRishta.ok && noRishta.error === "NO_RISHTA");

  const notRequestable = await createVerificationRequest({
    requesterUserId: asker.id,
    subjectUserId: subject.id,
    // A self-serve kind: nobody may demand it of somebody else.
    kind: "CONTACT_PHONE",
    payer: "REQUESTER",
  });
  check("a self-serve check cannot be demanded", !notRequestable.ok && notRequestable.error === "NOT_REQUESTABLE");

  const asked = await createVerificationRequest({
    requesterUserId: asker.id,
    subjectUserId: subject.id,
    kind: "IDENTITY",
    payer: "REQUESTER",
    message: "Shaadi ki baat aage badhane se pehle pakka kar lena chahta hoon.",
  });
  check("somebody in a real rishta can ask", asked.ok);
  if (!asked.ok) throw new Error("cannot continue without a request");
  check("and is sent to pay for it", Boolean(asked.checkoutUrl));

  const again = await createVerificationRequest({
    requesterUserId: asker.id,
    subjectUserId: subject.id,
    kind: "IDENTITY",
    payer: "SPLIT",
  });
  check("the same thing cannot be asked twice", !again.ok && again.error === "ALREADY_ASKED");

  /* ---------------------------------------------------------------- */
  console.log("\nAn unfunded ask does not reach anybody");
  /* ---------------------------------------------------------------- */

  let subjectInbox = await listVerificationRequests(subject.id);
  check("before payment the subject has not been told", subjectInbox.incoming.length === 0);

  const request = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: asked.requestId } });
  await captureShare(request.requesterPaymentId!);

  subjectInbox = await listVerificationRequests(subject.id);
  check("after payment it is in front of them", subjectInbox.incoming.length === 1);
  check(
    "with the asker's reason attached",
    subjectInbox.incoming[0]?.message?.includes("pakka kar lena") === true,
  );
  check("and nothing for them to pay", subjectInbox.incoming[0]?.yourSharePaise === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nPaying does not change the result");
  /* ---------------------------------------------------------------- */

  const notMine = await subjectDecide(asker.id, asked.requestId, { accept: true });
  check("the person who asked cannot answer for the subject", !notMine.ok && notMine.error === "NOT_FOUND");

  const accepted = await subjectDecide(subject.id, asked.requestId, { accept: true });
  check("the subject accepts", accepted.ok);

  const checkRow = await prisma.verificationCheck.findFirstOrThrow({ where: { subjectUserId: subject.id } });
  check("a check now exists", Boolean(checkRow.id));
  check("and it is empty — money bought the checking, not the answer", checkRow.outcome === null);
  check("with no scope sentence yet", checkRow.scopeText === "");

  let badges = await listVerificationBadges(subject.id, { viewerUserId: asker.id });
  const identity = badges.find((b) => b.kind === "IDENTITY")!;
  check("so the badge still says nothing was checked", identity.state === "NOT_CHECKED", identity.state);

  /* ---------------------------------------------------------------- */
  console.log("\nOnly a recorded result is a result");
  /* ---------------------------------------------------------------- */

  const EVIDENCE = "Aadhaar video call par dekha, naam aur DOB profile se mile. Card number kahin save nahi kiya.";

  const thin = await recordResult({
    checkId: checkRow.id,
    adminUserId: admin.id,
    outcome: "MATCHED",
    evidenceNote: "ok",
  });
  check("a result with no reasoning is refused", !thin.ok && thin.error === "NO_EVIDENCE");

  const recorded = await recordResult({
    checkId: checkRow.id,
    adminUserId: admin.id,
    outcome: "MATCHED",
    evidenceNote: EVIDENCE,
    resultNote: "Naam aur janm-tareekh mel khaye.",
  });
  check("an admin records the result", recorded.ok);

  const twice = await recordResult({
    checkId: checkRow.id,
    adminUserId: admin.id,
    outcome: "MISMATCH",
    evidenceNote: EVIDENCE,
  });
  check("and cannot overwrite it later", !twice.ok && twice.error === "ALREADY_DECIDED");

  const audited = await prisma.adminAuditLog.count({
    where: { targetType: "VerificationCheck", targetId: checkRow.id },
  });
  check("the decision is in the admin audit log", audited === 1);

  /* ---------------------------------------------------------------- */
  console.log("\nEvery badge names its scope and its date");
  /* ---------------------------------------------------------------- */

  badges = await listVerificationBadges(subject.id, { viewerUserId: asker.id });
  const done = badges.find((b) => b.kind === "IDENTITY")!;
  check("the badge now says it matched", done.state === "MATCHED");
  check("it names what was checked", done.scope.length > 20);
  check("it names when", Boolean(done.checkedAt));
  check("it says when it lapses", Boolean(done.expiresAt));
  check("it says out loud what it does not mean", done.notMeaning.length > 20);
  check(
    "the person who paid for it reads the result note",
    done.resultNote === "Naam aur janm-tareekh mel khaye.",
  );

  const asStranger = await listVerificationBadges(subject.id, { viewerUserId: stranger.id });
  check(
    "somebody who did not ask sees the state but not the note",
    asStranger.find((b) => b.kind === "IDENTITY")?.state === "MATCHED" &&
      asStranger.find((b) => b.kind === "IDENTITY")?.resultNote === null,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nRaw evidence never reaches a member");
  /* ---------------------------------------------------------------- */

  const memberFacing = JSON.stringify([
    badges,
    asStranger,
    await listVerificationBadges(subject.id, { viewerUserId: subject.id }),
    await listVerificationRequests(asker.id),
    await listVerificationRequests(subject.id),
    await getPairVerification(asker.id, subject.id),
    await getPairVerification(subject.id, asker.id),
  ]);
  check("no member-facing payload carries the evidence", !memberFacing.includes("Aadhaar"));
  check("not even for the subject themselves", !memberFacing.includes("kahin save nahi kiya"));

  const queue = await getVerificationQueue();
  check(
    "while the admin queue does carry it",
    JSON.stringify(queue).includes("Aadhaar"),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nA badge keeps meaning what it meant");
  /* ---------------------------------------------------------------- */

  const FROZEN = "Purani wording jo us waqt likhi gayi thi.";
  await prisma.verificationCheck.update({ where: { id: checkRow.id }, data: { scopeText: FROZEN } });
  badges = await listVerificationBadges(subject.id, { viewerUserId: asker.id });
  check(
    "the frozen sentence wins over today's catalog wording",
    badges.find((b) => b.kind === "IDENTITY")?.scope === FROZEN,
  );
  check(
    "and today's catalog says something else",
    catalogFor("IDENTITY").scope !== FROZEN,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nAn expired badge asserts nothing");
  /* ---------------------------------------------------------------- */

  await prisma.verificationCheck.update({
    where: { id: checkRow.id },
    data: { expiresAt: new Date(Date.now() - 86_400_000) },
  });
  badges = await listVerificationBadges(subject.id, { viewerUserId: asker.id });
  const lapsed = badges.find((b) => b.kind === "IDENTITY")!;
  check("it reads as expired, not as matched", lapsed.state === "EXPIRED", lapsed.state);
  check("and says it needs doing again", lapsed.stateLine.includes("dobara"));

  /* ---------------------------------------------------------------- */
  console.log("\nSaying no, and getting the money back");
  /* ---------------------------------------------------------------- */

  const second = await createVerificationRequest({
    requesterUserId: asker.id,
    subjectUserId: subject.id,
    kind: "EDUCATION",
    payer: "REQUESTER",
  });
  check("a different check can be asked for", second.ok);
  if (!second.ok) throw new Error("cannot continue");

  const secondRow = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: second.requestId } });
  await captureShare(secondRow.requesterPaymentId!);

  const declined = await subjectDecide(subject.id, second.requestId, { accept: false });
  check("the subject can simply say no", declined.ok);

  const afterDecline = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: second.requestId } });
  check("the request is declined", afterDecline.status === "DECLINED");
  check("with no reason required", afterDecline.declineReason === null);
  check("and the money is marked back", Boolean(afterDecline.refundedAt));
  check(
    "on the payment row too",
    (await prisma.payment.findUniqueOrThrow({ where: { id: secondRow.requesterPaymentId! } })).status === "REFUNDED",
  );
  check(
    "no check was ever opened for it",
    (await prisma.verificationCheck.count({ where: { subjectUserId: subject.id, kind: "EDUCATION" } })) === 0,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nA check that could not be finished refunds too");
  /* ---------------------------------------------------------------- */

  const third = await createVerificationRequest({
    requesterUserId: asker.id,
    subjectUserId: subject.id,
    kind: "EMPLOYMENT",
    payer: "REQUESTER",
  });
  if (!third.ok) throw new Error("cannot continue");
  const thirdRow = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: third.requestId } });
  await captureShare(thirdRow.requesterPaymentId!);
  await subjectDecide(subject.id, third.requestId, { accept: true });

  const empCheck = await prisma.verificationCheck.findFirstOrThrow({
    where: { subjectUserId: subject.id, kind: "EMPLOYMENT" },
  });
  await recordResult({
    checkId: empCheck.id,
    adminUserId: admin.id,
    outcome: "COULD_NOT_COMPLETE",
    evidenceNote: "Company HR se do baar sampark kiya, jawaab nahi aaya.",
  });

  check(
    "an unfinished check gives the money back",
    Boolean((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: third.requestId } })).refundedAt),
  );
  badges = await listVerificationBadges(subject.id, { viewerUserId: asker.id });
  check(
    "and its badge says so plainly",
    badges.find((b) => b.kind === "EMPLOYMENT")?.state === "COULD_NOT_COMPLETE",
  );

  /* ---------------------------------------------------------------- */
  console.log("\nBlocking closes the door");
  /* ---------------------------------------------------------------- */

  await prisma.interest.create({ data: { fromUserId: stranger.id, toUserId: subject.id, status: "PENDING" } });
  await blockUser({ blockerUserId: subject.id, blockedUserId: stranger.id });
  const blocked = await createVerificationRequest({
    requesterUserId: stranger.id,
    subjectUserId: subject.id,
    kind: "IDENTITY",
    payer: "REQUESTER",
  });
  check("a blocked account cannot demand proof", !blocked.ok && blocked.error === "NO_RISHTA");

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
