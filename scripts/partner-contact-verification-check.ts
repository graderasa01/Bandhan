import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  sendCode,
  confirmCode,
  getVerificationStatus,
  type VerificationAdapters,
} from "../lib/services/verification/contactVerification/contactVerificationService";
import { getPartnerContactGate, getPartnerBalance, savePayoutAccount } from "../lib/services/payouts/payoutService";
import type { TwilioVerifyAdapter } from "../lib/services/verification/contactVerification/twilioVerifyAdapter";
import type { EmailOtpAdapter } from "../lib/services/verification/contactVerification/emailOtpAdapter";

/**
 * PARTNER-scope contact verification, and the payout gate that reads it.
 *
 * Run: `npx tsx scripts/partner-contact-verification-check.ts`
 *
 * The interesting property is that PARTNER scope proves a *different pair of
 * columns* than USER scope, on a partner whose two contacts deliberately
 * disagree — so a bug that quietly fell back to `User.mobile` would show up
 * here as the wrong number being verified.
 *
 * Twilio/Resend are mocked throughout; nothing reaches a live provider. The
 * gate's provider-awareness is exercised by toggling the env vars directly,
 * since that is exactly what `verificationProviderStatus()` reads.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Same shape (and same "return `state`, never a spread copy" rule) as scripts/contact-verification-check.ts. */
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
  // Returned, not spread — a spread would freeze `lastEmailCode` at null and
  // never see `sendOtp`'s later write.
  return Object.assign(state, { twilio, email });
}

async function main() {
  // A partner whose partner-row contacts differ from their login contacts —
  // the whole reason PARTNER scope exists.
  const user = await prisma.user.create({
    data: {
      fullName: "Scope Check Partner",
      mobile: `90000${Math.floor(10000 + Math.random() * 89999)}`,
      email: `login+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      role: "PARTNER",
      status: "ACTIVE",
    },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      fullName: "Scope Check Partner",
      mobileNumber: `98111${Math.floor(10000 + Math.random() * 89999)}`,
      email: `office+${Date.now()}@local.test`,
      city: "Delhi",
      state: "Delhi",
      partnerType: "PANDIT",
      status: "APPROVED",
    },
  });

  const envBackup = {
    twilioSid: process.env.TWILIO_ACCOUNT_SID,
    twilioToken: process.env.TWILIO_AUTH_TOKEN,
    twilioService: process.env.TWILIO_VERIFY_SERVICE_SID,
    resend: process.env.RESEND_API_KEY,
    from: process.env.AUTH_EMAIL_FROM,
  };

  try {
    console.log("\nPARTNER scope reads the partner row, not the login row");
    const partnerStatus = await getVerificationStatus(user.id, "PARTNER");
    const userStatus = await getVerificationStatus(user.id, "USER");
    check(
      "partner-scope phone is masked from Partner.mobileNumber",
      partnerStatus.phone.masked?.endsWith(partner.mobileNumber.slice(-3)) ?? false,
      `got ${partnerStatus.phone.masked}, partner number ends ${partner.mobileNumber.slice(-3)}`,
    );
    check(
      "user-scope phone is a different number — the two scopes do not collapse",
      partnerStatus.phone.masked !== userStatus.phone.masked,
      `partner=${partnerStatus.phone.masked} user=${userStatus.phone.masked}`,
    );
    check("neither is verified yet", !partnerStatus.phone.verified && !partnerStatus.email.verified);

    console.log("\nConfirming a PARTNER code stamps Partner, never User");
    const adapters = mockAdapters();
    const sent = await sendCode(user.id, "EMAIL", "PARTNER", adapters);
    check("partner-scope send succeeds", sent.ok, sent.ok ? "" : sent.message);
    const confirmed = await confirmCode(user.id, "EMAIL", adapters.lastEmailCode!, "PARTNER", adapters);
    check("partner-scope confirm succeeds", confirmed.ok, confirmed.ok ? "" : confirmed.message);

    const afterPartner = await prisma.partner.findUnique({
      where: { id: partner.id },
      select: { emailVerifiedAt: true, mobileVerifiedAt: true },
    });
    const afterUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerifiedAt: true, mobileVerifiedAt: true },
    });
    check("Partner.emailVerifiedAt is set", afterPartner?.emailVerifiedAt != null);
    check("Partner.mobileVerifiedAt untouched", afterPartner?.mobileVerifiedAt == null);
    check(
      "User.emailVerifiedAt is NOT set — verifying the partner contact never certifies the login contact",
      afterUser?.emailVerifiedAt == null,
    );

    console.log("\nThe two scopes keep separate challenge buckets");
    const adapters2 = mockAdapters();
    // PARTNER email is already verified, so a USER-scope send must still be
    // allowed — a shared bucket would have blocked or reused it.
    const userSend = await sendCode(user.id, "EMAIL", "USER", adapters2);
    check("USER-scope send still works after PARTNER-scope verified", userSend.ok, userSend.ok ? "" : userSend.message);
    const rows = await prisma.contactVerificationChallenge.findMany({
      where: { userId: user.id, channel: "EMAIL" },
      select: { scope: true },
    });
    check("two separate challenge rows exist, one per scope", rows.length === 2, `got ${rows.length}`);
    check(
      "...and they carry different scopes",
      new Set(rows.map((r) => r.scope)).size === 2,
      rows.map((r) => r.scope).join(","),
    );

    console.log("\nThe payout gate only demands channels the server can actually send on");
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_EMAIL_FROM;
    const gateNoProviders = await getPartnerContactGate(partner.id);
    check(
      "no providers configured → gate passes rather than freezing payouts behind an unsendable OTP",
      gateNoProviders.ok && gateNoProviders.missing.length === 0,
      JSON.stringify(gateNoProviders),
    );

    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok_test";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA_test";
    const gatePhoneOnly = await getPartnerContactGate(partner.id);
    check(
      "phone provider configured + partner mobile unverified → gate blocks on PHONE",
      !gatePhoneOnly.ok && gatePhoneOnly.missing.join(",") === "PHONE",
      JSON.stringify(gatePhoneOnly),
    );

    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_EMAIL_FROM = "test@local.test";
    const gateBoth = await getPartnerContactGate(partner.id);
    check(
      "email provider configured too, but partner email IS verified → still only PHONE missing",
      !gateBoth.ok && gateBoth.missing.join(",") === "PHONE",
      JSON.stringify(gateBoth),
    );

    console.log("\nThe gate is enforced where money is at stake");
    const blockedSave = await savePayoutAccount(partner.id, {
      method: "UPI",
      accountHolderName: "Scope Check Partner",
      upiId: "scopecheck@okhdfcbank",
    });
    check(
      "savePayoutAccount refuses while a demanded channel is unverified",
      !blockedSave.ok && blockedSave.error === "CONTACT_UNVERIFIED",
      JSON.stringify(blockedSave),
    );

    const blockedBalance = await getPartnerBalance(partner.id);
    check("balance reports the block", !blockedBalance.canRequest);
    check("...and flags it as a verification problem so the UI can link to the fix", blockedBalance.contactVerificationNeeded);
    check(
      "...with a message naming the channel",
      (blockedBalance.blockedReason ?? "").includes("mobile"),
      blockedBalance.blockedReason ?? "",
    );

    console.log("\nOnce the last channel is verified, the gate opens");
    const adapters3 = mockAdapters();
    await sendCode(user.id, "PHONE", "PARTNER", adapters3);
    const phoneOk = await confirmCode(user.id, "PHONE", "111111", "PARTNER", adapters3);
    check("partner phone verifies", phoneOk.ok, phoneOk.ok ? "" : phoneOk.message);
    const gateOpen = await getPartnerContactGate(partner.id);
    check("gate now passes", gateOpen.ok, JSON.stringify(gateOpen));

    const allowedSave = await savePayoutAccount(partner.id, {
      method: "UPI",
      accountHolderName: "Scope Check Partner",
      upiId: "scopecheck@okhdfcbank",
    });
    check(
      "savePayoutAccount now proceeds (or fails only on the encryption key, never on contact)",
      allowedSave.ok || allowedSave.error === "NOT_CONFIGURED",
      JSON.stringify(allowedSave),
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    Object.assign(process.env, {
      TWILIO_ACCOUNT_SID: envBackup.twilioSid,
      TWILIO_AUTH_TOKEN: envBackup.twilioToken,
      TWILIO_VERIFY_SERVICE_SID: envBackup.twilioService,
      RESEND_API_KEY: envBackup.resend,
      AUTH_EMAIL_FROM: envBackup.from,
    });
    await prisma.contactVerificationChallenge.deleteMany({ where: { userId: user.id } });
    await prisma.partnerPayoutAccount.deleteMany({ where: { partnerId: partner.id } });
    await prisma.partner.delete({ where: { id: partner.id } }).catch(() => {});
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
