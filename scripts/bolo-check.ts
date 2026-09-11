import "./_env";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

/**
 * The spoken front door, end to end — everything except the microphone.
 *
 * Run: `npx tsx scripts/bolo-check.ts`
 *
 *   1. Normalisation: what people say → what the catalog stores. "5 foot 8",
 *      "12 May 1995", "B tech", "ladki" all land on a valid value; "5.13" and
 *      "31/02/1990" are refused rather than stored.
 *   2. The OTP service with mocked providers: cooldown, five attempts, a proof
 *      that reads back to the same contact, and a forged proof that does not.
 *   3. `completeGuestProfile` against the real database: a guest with the
 *      eight fields and an unverified number (no provider configured) becomes
 *      a live profile with a session; the same number a second time is
 *      refused; a verified proof for an existing account logs in and fills
 *      only what was empty.
 *
 * `next/headers` is resolved to an in-memory stub (scripts/_stubs) so the
 * session cookie has somewhere to go outside a Next request.
 */

const req = createRequire(import.meta.url);
const Module = req("node:module") as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const stub = req.resolve("./_stubs/nextHeaders.ts");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "next/headers") return stub;
  return resolveFilename.call(this, request, ...rest);
};

async function main() {
  const { acceptAnswers, normalizeAnswer, missingMinimum } = await import("../lib/bolo/draft");

  /* ------------------------------ 1. draft ------------------------------ */
  assert.equal(normalizeAnswer("dateOfBirth", "12 May 1995"), "12/05/1995");
  assert.equal(normalizeAnswer("dateOfBirth", "12 mai 1995"), "12/05/1995");
  assert.equal(normalizeAnswer("dateOfBirth", "1995-05-12"), "12/05/1995");
  assert.equal(normalizeAnswer("dateOfBirth", "12/5/95"), "12/05/1995");
  assert.equal(normalizeAnswer("dateOfBirth", "3rd March, 2001"), "03/03/2001");
  assert.equal(normalizeAnswer("height", "5 foot 8"), `5'8"`);
  assert.equal(normalizeAnswer("height", "5.8"), `5'8"`);
  assert.equal(normalizeAnswer("height", "5 feet 11 inches"), `5'11"`);
  assert.equal(normalizeAnswer("height", `5'8"`), `5'8"`);
  assert.equal(normalizeAnswer("height", "170 cm"), `5'7"`);
  assert.equal(normalizeAnswer("gender", "ladki"), "Ladki");
  assert.equal(normalizeAnswer("gender", "Male"), "Ladka");
  assert.equal(normalizeAnswer("gender", "beta hai"), "Ladka");
  assert.equal(normalizeAnswer("maritalStatus", "unmarried"), "Never Married");
  assert.equal(normalizeAnswer("maritalStatus", "talaq ho gaya"), "Divorced");
  assert.equal(normalizeAnswer("education", "b tech"), "B.Tech");
  assert.equal(normalizeAnswer("education", "btech"), "B.Tech");
  assert.equal(normalizeAnswer("education", "MBA"), "MBA");
  assert.equal(normalizeAnswer("education", "graduation"), "Graduate");
  assert.equal(normalizeAnswer("fullName", "rahul sharma."), "Rahul Sharma");
  assert.equal(normalizeAnswer("currentCity", "jaipur"), "Jaipur");

  const batch = acceptAnswers(
    {},
    {
      fullName: "Rahul Sharma",
      gender: "ladka",
      dateOfBirth: "31/02/1990",
      height: "5.13",
      currentCity: "Jaipur",
      photo: "x",
      maritalStatus: "single",
    },
  );
  assert.deepEqual(batch.saved.sort(), ["currentCity", "fullName", "gender", "maritalStatus"]);
  assert.deepEqual(
    batch.rejected.map((r) => `${r.field}:${r.reason}`).sort(),
    ["dateOfBirth:invalid", "height:invalid", "photo:unknown_field"],
  );
  assert.deepEqual(batch.missing, ["dateOfBirth", "height", "education", "profession"]);
  assert.equal(missingMinimum(batch.values).length, 4);
  console.log("1. draft normalisation ✓");

  /* ------------------------------- 2. otp ------------------------------- */
  const otp = await import("../lib/services/auth/contactOtpService");
  const security = await import("../lib/services/security/requestRateLimit");
  otp.resetContactOtpState();
  security.resetRequestRateLimit();

  assert.deepEqual(otp.parseContact("+91 98765 43210"), { kind: "mobile", value: "9876543210" });
  assert.deepEqual(otp.parseContact("09876543210"), { kind: "mobile", value: "9876543210" });
  assert.deepEqual(otp.parseContact("Rahul@Example.com"), { kind: "email", value: "rahul@example.com" });
  assert.equal(otp.parseContact("12345"), null);
  assert.equal(otp.parseContact("5876543210"), null);

  const sentTo: string[] = [];
  const codes = new Map<string, string>();
  const mockAdapters = {
    twilio: {
      async startVerification(e164: string) {
        sentTo.push(e164);
        codes.set(e164, "246810");
        return { ok: true as const, sid: "VE_mock" };
      },
      async checkVerification(e164: string, code: string) {
        return { ok: true as const, approved: codes.get(e164) === code };
      },
    },
    email: {
      async sendOtp(to: string, code: string) {
        sentTo.push(to);
        codes.set(to, code);
        return { ok: true as const };
      },
    },
  };

  // Providers are not configured in this environment; the service says so
  // before anything is sent. The mock path below is reached only through
  // adapters, exactly as the route would with real keys.
  const unconfigured = await otp.sendContactOtp({ kind: "mobile", value: "9876543210" }, "1.1.1.1", mockAdapters);
  assert.equal(unconfigured.ok, false);
  if (!unconfigured.ok) assert.equal(unconfigured.error, "not_configured");

  // Pretend Twilio and Resend are configured for the rest of this block.
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "tok";
  process.env.TWILIO_VERIFY_SERVICE_SID = "VA_test";
  process.env.RESEND_API_KEY = "re_test";
  process.env.AUTH_EMAIL_FROM = "BandhanTak <otp@example.com>";

  const mobile = { kind: "mobile" as const, value: "9876543210" };
  const first = await otp.sendContactOtp(mobile, "1.1.1.1", mockAdapters);
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.masked, "+91*******210");
  assert.deepEqual(sentTo, ["+919876543210"]);

  const again = await otp.sendContactOtp(mobile, "1.1.1.1", mockAdapters);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.error, "cooldown");

  const wrong = await otp.verifyContactOtp(mobile, "000000", mockAdapters);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.equal(wrong.error, "wrong");
    assert.equal(wrong.attemptsLeft, 4);
  }
  const right = await otp.verifyContactOtp(mobile, "24 68 10", mockAdapters);
  assert.equal(right.ok, true);
  const proof = right.ok ? right.proof : "";
  assert.deepEqual(await otp.readContactProof(proof), mobile);
  assert.equal(await otp.readContactProof(`${proof}x`), null);
  assert.equal(await otp.readContactProof("not-a-jwt"), null);
  // A used code is gone.
  const replay = await otp.verifyContactOtp(mobile, "246810", mockAdapters);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.error, "no_challenge");

  const email = { kind: "email" as const, value: "guest@example.com" };
  const emailSend = await otp.sendContactOtp(email, "1.1.1.2", mockAdapters);
  assert.equal(emailSend.ok, true);
  const emailCode = codes.get(email.value)!;
  assert.match(emailCode, /^\d{6}$/);
  for (let i = 0; i < 4; i++) {
    const r = await otp.verifyContactOtp(email, "111111", mockAdapters);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "wrong");
  }
  const exhausted = await otp.verifyContactOtp(email, "111111", mockAdapters);
  assert.equal(exhausted.ok, false);
  if (!exhausted.ok) assert.equal(exhausted.error, "too_many_attempts");
  // Even the right code is useless now — a fresh send is the only way back.
  const afterExhaust = await otp.verifyContactOtp(email, emailCode, mockAdapters);
  assert.equal(afterExhaust.ok, false);
  if (!afterExhaust.ok) assert.equal(afterExhaust.error, "no_challenge");

  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_VERIFY_SERVICE_SID;
  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_EMAIL_FROM;
  console.log("2. contact OTP service ✓");

  /* ----------------------------- 3. complete ---------------------------- */
  const { prisma } = await import("../lib/db/prisma");
  const { completeGuestProfile, BOLO_LIVE_LANDING } = await import("../lib/services/bolo/completeService");
  const { isActivatedOnServer } = await import("../lib/services/profile/readinessService");
  const { resetCookieJar, cookies } = await import("./_stubs/nextHeaders");

  const suffix = String(Date.now()).slice(-9);
  const guestMobile = `9${suffix}`;
  const created: string[] = [];
  const jar = { get: () => undefined };

  try {
    // 3a. eight fields, no provider configured → account + live + session.
    resetCookieJar();
    const full = {
      fullName: "Bolo Test Guest",
      gender: "Ladki",
      dateOfBirth: "12 May 1996",
      height: "5 feet 4",
      currentCity: "jodhpur",
      maritalStatus: "never married",
      education: "b.sc",
      profession: "Teacher",
    };
    const live = await completeGuestProfile({
      fillingFor: "daughter",
      values: full,
      accountName: "Sunita Devi",
      contact: { kind: "mobile", value: guestMobile },
      jar,
      ipAddress: "127.0.0.1",
    });
    assert.equal(live.ok, true);
    if (!live.ok) throw new Error("unreachable");
    assert.equal(live.live, true);
    assert.equal(live.landing, BOLO_LIVE_LANDING);
    assert.equal(live.verified, false);
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile: guestMobile }, include: { profile: true } });
    created.push(user.id);
    assert.equal(user.fullName, "Sunita Devi");
    assert.equal(user.passwordHash, null);
    assert.equal(user.status, "ACTIVE");
    assert.equal(user.mobileVerifiedAt, null);
    assert.ok(user.profile && isActivatedOnServer(user.profile));
    assert.equal(user.profile?.respondentType, "PARENT");
    const jarNow = await cookies();
    assert.ok(jarNow.get("bt_session")?.value, "a session cookie was set");
    const sessions = await prisma.authSession.count({ where: { userId: user.id } });
    assert.equal(sessions, 1);

    // 3b. the same number again, unverified → refused, nothing created.
    const dup = await completeGuestProfile({
      fillingFor: "self",
      values: full,
      contact: { kind: "mobile", value: guestMobile },
      jar,
    });
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.error, "ALREADY_EXISTS");
    assert.equal(await prisma.user.count({ where: { mobile: guestMobile } }), 1);

    // 3c. an invalid value is refused before anything is created.
    const badMobile = `8${suffix}`;
    const bad = await completeGuestProfile({
      fillingFor: "self",
      values: { ...full, height: "5.13" },
      contact: { kind: "mobile", value: badMobile },
      jar,
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error, "VALIDATION_FAILED");
    assert.equal(await prisma.user.count({ where: { mobile: badMobile } }), 0);

    // 3d. a partial draft → account created, not live, lands on the builder.
    const draftMobile = `7${suffix}`;
    const partial = await completeGuestProfile({
      fillingFor: "self",
      values: { fullName: "Draft Guest", currentCity: "Pune" },
      contact: { kind: "mobile", value: draftMobile },
      jar,
    });
    assert.equal(partial.ok, true);
    if (partial.ok) {
      assert.equal(partial.live, false);
      assert.equal(partial.landing, "/profile/build");
      assert.equal(partial.missing.length, 6);
    }
    const draftUser = await prisma.user.findUniqueOrThrow({ where: { mobile: draftMobile } });
    created.push(draftUser.id);
    assert.equal(draftUser.status, "INCOMPLETE");

    // 3e. a verified proof for that existing draft account → logs in, fills
    // only the empty fields, and goes live.
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA_test";
    otp.resetContactOtpState();
    security.resetRequestRateLimit();
    const draftContact = { kind: "mobile" as const, value: draftMobile };
    const s = await otp.sendContactOtp(draftContact, "2.2.2.2", mockAdapters);
    assert.equal(s.ok, true);
    if (s.ok) assert.equal(s.existingUser, true);
    const v = await otp.verifyContactOtp(draftContact, "246810", mockAdapters);
    assert.equal(v.ok, true);
    const returning = await completeGuestProfile({
      fillingFor: "self",
      values: { ...full, fullName: "Should Not Overwrite", currentCity: "Delhi" },
      contact: draftContact,
      proof: v.ok ? v.proof : undefined,
      jar,
    });
    assert.equal(returning.ok, true);
    if (returning.ok) {
      assert.equal(returning.existingAccount, true);
      assert.equal(returning.verified, true);
      assert.equal(returning.live, true);
    }
    const merged = await prisma.user.findUniqueOrThrow({
      where: { mobile: draftMobile },
      include: { profile: { include: { basicDetails: true } } },
    });
    assert.equal(merged.status, "ACTIVE");
    assert.ok(merged.mobileVerifiedAt === null, "complete stamps nothing on a returning account; login route does");
    // The earlier answers won: the name the draft account gave stays, and the
    // city it already had is not replaced by the spoken "Delhi".
    assert.equal(merged.profile?.displayName, "Draft Guest");
    assert.equal(merged.profile?.currentCity, "Pune");
    assert.equal(await prisma.user.count({ where: { mobile: draftMobile } }), 1);

    // 3f. with a provider configured, an unproven contact is refused.
    const strictMobile = `6${suffix}`;
    const strict = await completeGuestProfile({
      fillingFor: "self",
      values: full,
      contact: { kind: "mobile", value: strictMobile },
      jar,
    });
    assert.equal(strict.ok, false);
    if (!strict.ok) assert.equal(strict.error, "VERIFICATION_REQUIRED");
    console.log("3. complete guest profile ✓");
  } finally {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }

  /* --------------------------- 4. bundle edge --------------------------- */
  const { clientModulesReachingServerOnly } = await import("./_stubs/clientBoundary");
  const leaks = clientModulesReachingServerOnly([
    "components/bolo/BoloExperience.tsx",
    "components/bolo/ProfileFillCard.tsx",
    "components/bolo/ContactStep.tsx",
    "components/bolo/GrioOrb.tsx",
    "components/auth/OtpLoginForm.tsx",
    "components/auth/LoginPageView.tsx",
    "components/auth/RegisterPageView.tsx",
    "lib/bolo/liveClient.ts",
  ]);
  assert.deepEqual(leaks, [], `client component reaches server-only: ${leaks.join("; ")}`);
  console.log("4. no client module value-imports a server-only module ✓");

  console.log("\nbolo-check: all green");
}

main().catch((err) => {
  console.error("bolo-check FAILED:", err);
  process.exit(1);
});
