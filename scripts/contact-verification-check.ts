import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  sendCode,
  confirmCode,
  getVerificationStatus,
  maskEmail,
  maskPhone,
  OTP_EXPIRY_MINUTES,
  MAX_CONFIRM_ATTEMPTS,
  type VerificationAdapters,
} from "../lib/services/verification/contactVerification/contactVerificationService";
import { toE164Indian } from "../lib/services/verification/contactVerification/twilioVerifyAdapter";
import type { TwilioVerifyAdapter } from "../lib/services/verification/contactVerification/twilioVerifyAdapter";
import type { EmailOtpAdapter } from "../lib/services/verification/contactVerification/emailOtpAdapter";

/**
 * Phone/email verification — OTP expiry, resend cooldown, attempt limits, and
 * the transactional update of the correct `mobileVerifiedAt`/`emailVerifiedAt`.
 *
 * Run: `npx tsx scripts/contact-verification-check.ts`
 *
 * Every Twilio/Resend call is mocked — see `VerificationAdapters`. Nothing
 * here ever reaches a live provider, per the brief.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Captures the last code "sent" so confirm-path tests can use the real value. */
function mockAdapters(): VerificationAdapters & { lastEmailCode: string | null; approvePhone: boolean } {
  const state = { lastEmailCode: null as string | null, approvePhone: true };
  const twilio: TwilioVerifyAdapter = {
    async startVerification() {
      return { ok: true, sid: "VE_mock" };
    },
    async checkVerification(_to, code) {
      return { ok: true, approved: state.approvePhone && code === "111111" };
    },
  };
  const email: EmailOtpAdapter = {
    async sendOtp(_to, code) {
      state.lastEmailCode = code;
      return { ok: true };
    },
  };
  // `state` is the object returned (not spread into a copy) so that later
  // reads of `.lastEmailCode` see the same mutations `sendOtp`'s closure made
  // — spreading `state` into a fresh object would freeze its fields at
  // Object.assign time and never reflect the closure's later writes.
  return Object.assign(state, { twilio, email });
}

async function main() {
  console.log("\nMasking never leaks the raw contact");
  check("email mask keeps the domain, hides most of the local part", maskEmail("puneet@gmail.com") === "p***@gmail.com");
  check("phone mask keeps only the last 3 digits", maskPhone("+919876543210").endsWith("210") && !maskPhone("+919876543210").includes("98765432"));
  check("normalization: 10-digit Indian mobile → E.164", toE164Indian("9876543210") === "+919876543210");

  const user = await prisma.user.create({
    data: {
      fullName: "Contact Verification Check",
      mobile: "9876500001",
      email: `contact-verify+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      status: "ACTIVE",
    },
  });

  try {
    console.log("\nStatus reflects what is actually on the account");
    const status0 = await getVerificationStatus(user.id);
    check("phone available, not verified", status0.phone.available && !status0.phone.verified);
    check("email available, not verified", status0.email.available && !status0.email.verified);

    console.log("\nEMAIL: send → wrong code fails generically → right code verifies → sets emailVerifiedAt only");
    const adapters = mockAdapters();
    const sent = await sendCode(user.id, "EMAIL", adapters);
    check("send succeeds", sent.ok, sent.ok ? "" : sent.message);
    check("a code was actually generated and handed to the adapter", adapters.lastEmailCode !== null && /^\d{6}$/.test(adapters.lastEmailCode ?? ""));

    const wrong = await confirmCode(user.id, "EMAIL", "000000", adapters);
    check("wrong code is rejected", !wrong.ok);
    check("...with a generic message (no 'wrong' vs 'expired' distinction)", !wrong.ok && wrong.error === "invalid_or_expired");

    const right = await confirmCode(user.id, "EMAIL", adapters.lastEmailCode!, adapters);
    check("the real code verifies", right.ok, right.ok ? "" : right.message);

    const afterEmail = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true, mobileVerifiedAt: true } });
    check("emailVerifiedAt is now set", afterEmail?.emailVerifiedAt != null);
    check("mobileVerifiedAt is untouched — confirming one channel never touches the other", afterEmail?.mobileVerifiedAt == null);

    console.log("\nA second confirm after success is a harmless no-op, not an error");
    const again = await confirmCode(user.id, "EMAIL", "999999", adapters);
    check("idempotent: already-verified short-circuits to ok:true", again.ok);

    console.log("\nAttempt limit — 5 wrong guesses lock the challenge");
    const adapters2 = mockAdapters();
    await sendCode(user.id, "PHONE", adapters2);
    adapters2.approvePhone = false;
    let lastResult: Awaited<ReturnType<typeof confirmCode>> | null = null;
    for (let i = 0; i < MAX_CONFIRM_ATTEMPTS; i++) {
      lastResult = await confirmCode(user.id, "PHONE", "222222", adapters2);
    }
    check(`after ${MAX_CONFIRM_ATTEMPTS} wrong attempts, still generically rejected`, lastResult !== null && !lastResult.ok);
    const oneMore = await confirmCode(user.id, "PHONE", "222222", adapters2);
    check("one attempt past the limit is rejected specifically as too_many_attempts", !oneMore.ok && oneMore.error === "too_many_attempts");
    adapters2.approvePhone = true;
    const tooLateEvenIfCorrect = await confirmCode(user.id, "PHONE", "111111", adapters2);
    check("...and the correct code no longer works once the limit is hit", !tooLateEvenIfCorrect.ok);

    console.log("\nResend cooldown");
    const adapters3 = mockAdapters();
    // PHONE's own challenge from the attempt-limit test above already exists
    // for this user — clear it first so this section starts clean.
    await prisma.contactVerificationChallenge.deleteMany({ where: { userId: user.id, channel: "PHONE" } });
    const cleanSend = await sendCode(user.id, "PHONE", adapters3);
    check("first send after a clean slate succeeds", cleanSend.ok);
    const immediateResend = await sendCode(user.id, "PHONE", adapters3);
    check(
      "an immediate resend is blocked by the 60s cooldown",
      !immediateResend.ok && (immediateResend as { error?: string }).error === "cooldown",
    );

    console.log("\nExpiry — a code past its window is rejected the same generic way");
    const adapters4 = mockAdapters();
    await prisma.contactVerificationChallenge.deleteMany({ where: { userId: user.id, channel: "PHONE" } });
    await sendCode(user.id, "PHONE", adapters4);
    // Backdate the challenge past its expiry rather than sleeping real time.
    await prisma.contactVerificationChallenge.updateMany({
      where: { userId: user.id, channel: "PHONE" },
      data: { expiresAt: new Date(Date.now() - 1000), lastSentAt: new Date(Date.now() - (OTP_EXPIRY_MINUTES + 5) * 60_000) },
    });
    const expired = await confirmCode(user.id, "PHONE", "111111", adapters4);
    check("an expired challenge is rejected even with the right code", !expired.ok && expired.error === "invalid_or_expired");

    console.log("\nOnly the contact currently stored on the signed-in user can ever be verified");
    // The service takes no destination from the caller at all — structural,
    // not a runtime check. Confirm neither route ever reads a body-supplied
    // destination (mobile/email/phone/destination) by re-reading the source.
    const fs = await import("node:fs/promises");
    const sendRouteSrc = await fs.readFile("app/api/verify-contact/send/route.ts", "utf8");
    const confirmRouteSrc = await fs.readFile("app/api/verify-contact/confirm/route.ts", "utf8");
    check(
      "the send route's schema declares only { channel } — a client cannot supply a destination",
      /BodySchema = z\.object\(\{\s*channel:\s*z\.enum/.test(sendRouteSrc),
    );
    check(
      "the confirm route's schema declares only { channel, code } — same rule",
      /BodySchema = z\.object\(\{\s*channel:\s*z\.enum/.test(confirmRouteSrc) && /code:/.test(confirmRouteSrc),
    );
    check(
      "neither route ever reads parsed.data.mobile / .email / .phone / .destination",
      !/parsed\.data\.(mobile|email|phone|destination)/.test(sendRouteSrc + confirmRouteSrc),
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    await prisma.contactVerificationChallenge.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
