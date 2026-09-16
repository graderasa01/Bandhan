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
 *      a live profile with a session — but only with a password of their own,
 *      and without one nothing is created; the same number a second time is
 *      refused; a verified proof for an existing account logs in and fills
 *      only what was empty. Then `completeMemberProfile`: a signed-in member's
 *      confirmed card completes the profile they already have, keeps the
 *      provenance of what did not change, and re-signs the session.
 *   4. No client component value-imports a server-only module.
 *   5. The two briefs: the member tool list has no contact tools, and a typed
 *      name cannot break out of the page's own bracketed note.
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

  // The two spoken preferences: a plain hyphen, "to", "se" all land on the
  // catalog's en-dash range; cities are matched one by one, case-insensitively.
  const { acceptPreferences, missingPreferences, BOLO_PREFERENCE_KEYS } = await import("../lib/bolo/draft");
  assert.deepEqual([...BOLO_PREFERENCE_KEYS], ["partnerAgeRange", "partnerCityPreference"]);
  assert.equal(normalizeAnswer("partnerAgeRange", "25-29"), "25–29");
  assert.equal(normalizeAnswer("partnerAgeRange", "25 to 29"), "25–29");
  assert.equal(normalizeAnswer("partnerAgeRange", "25 se 29 saal"), "25–29");
  assert.equal(normalizeAnswer("partnerAgeRange", "35 plus"), "35+");
  assert.equal(normalizeAnswer("partnerAgeRange", "35 se upar"), "35+");
  assert.equal(normalizeAnswer("partnerAgeRange", "25–29"), "25–29");
  assert.equal(normalizeAnswer("partnerCityPreference", "jaipur, delhi ncr"), "Jaipur, Delhi NCR");
  assert.equal(normalizeAnswer("partnerCityPreference", "Jaipur aur Mumbai"), "Jaipur, Mumbai");
  assert.equal(normalizeAnswer("partnerCityPreference", "kahin bhi"), "Kahin bhi");

  const prefs = acceptPreferences({ fullName: "Rahul Sharma" }, { partnerAgeRange: "25-29", partnerCityPreference: "Jaipur", education: "MBA" });
  assert.deepEqual(prefs.saved.sort(), ["partnerAgeRange", "partnerCityPreference"]);
  assert.deepEqual(prefs.ignored, ["education"], "only the two preference keys get through");
  assert.equal(prefs.values.education, undefined);
  assert.equal(prefs.values.fullName, "Rahul Sharma");
  assert.deepEqual(prefs.missing, []);
  // A city outside the catalog is refused with the real options, and nothing
  // the user did not mention is touched — the age range stays as it was.
  const badCity = acceptPreferences(prefs.values, { partnerCityPreference: "Kota" });
  assert.deepEqual(badCity.saved, []);
  assert.equal(badCity.rejected[0]?.field, "partnerCityPreference");
  assert.ok((badCity.rejected[0]?.options ?? []).includes("Jaipur"));
  assert.equal(badCity.values.partnerAgeRange, "25–29");
  assert.equal(badCity.values.partnerCityPreference, "Jaipur");
  // "21-24" is not a range the catalog offers → rejected, not stored.
  const badAge = acceptPreferences({}, { partnerAgeRange: "21-24" });
  assert.deepEqual(badAge.saved, []);
  assert.equal(badAge.rejected[0]?.reason, "invalid");
  assert.deepEqual(missingPreferences({}), ["partnerAgeRange", "partnerCityPreference"]);
  assert.deepEqual(missingPreferences({ partnerAgeRange: "25–29" }), ["partnerCityPreference"]);
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
  const { completeGuestProfile, completeMemberProfile, loadBoloMember, BOLO_LIVE_LANDING } = await import(
    "../lib/services/bolo/completeService"
  );
  const { isActivatedOnServer } = await import("../lib/services/profile/readinessService");
  const { resetCookieJar, cookies } = await import("./_stubs/nextHeaders");
  const { verifyPassword } = await import("../lib/auth/password");

  const suffix = String(Date.now()).slice(-9);
  const guestMobile = `9${suffix}`;
  const created: string[] = [];
  const jar = { get: () => undefined };
  const TEST_PASSWORD = "bolo-check-pass-1";

  try {
    // 3a. eight fields, no provider configured → account + live + session —
    // and only with a password the person typed. Without one (or with one too
    // short) nothing is created: an account no code verified and no password
    // opens could never be logged back into once this session ends.
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
    for (const password of [undefined, "short"]) {
      const refused = await completeGuestProfile({
        fillingFor: "daughter",
        values: full,
        accountName: "Sunita Devi",
        contact: { kind: "mobile", value: guestMobile },
        password,
        jar,
      });
      assert.equal(refused.ok, false);
      if (!refused.ok) assert.equal(refused.error, "PASSWORD_REQUIRED");
    }
    assert.equal(await prisma.user.count({ where: { mobile: guestMobile } }), 0);

    const live = await completeGuestProfile({
      fillingFor: "daughter",
      values: full,
      accountName: "Sunita Devi",
      contact: { kind: "mobile", value: guestMobile },
      password: TEST_PASSWORD,
      jar,
      ipAddress: "127.0.0.1",
    });
    assert.equal(live.ok, true);
    if (!live.ok) throw new Error("unreachable");
    assert.equal(live.live, true);
    assert.equal(live.landing, BOLO_LIVE_LANDING);
    assert.equal(live.verified, false);
    assert.equal(live.hasPassword, true);
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile: guestMobile }, include: { profile: true } });
    created.push(user.id);
    assert.equal(user.fullName, "Sunita Devi");
    assert.ok(
      user.passwordHash && (await verifyPassword(TEST_PASSWORD, user.passwordHash)),
      "the account's password is the one the person typed, hashed",
    );
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
      password: TEST_PASSWORD,
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
      password: TEST_PASSWORD,
      jar,
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error, "VALIDATION_FAILED");
    assert.equal(await prisma.user.count({ where: { mobile: badMobile } }), 0);

    // 3d. a partial draft → account created, not live, and the rest is
    // finished on /bolo as a signed-in member.
    const draftMobile = `7${suffix}`;
    const partial = await completeGuestProfile({
      fillingFor: "self",
      values: { fullName: "Draft Guest", currentCity: "Pune" },
      contact: { kind: "mobile", value: draftMobile },
      password: TEST_PASSWORD,
      jar,
    });
    assert.equal(partial.ok, true);
    if (partial.ok) {
      assert.equal(partial.live, false);
      assert.equal(partial.landing, "/bolo");
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
      assert.equal(returning.hasPassword, true);
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

    // 3f. with a provider configured, an unproven contact is refused — a
    // password is no substitute for a code that could have been sent.
    const strictMobile = `6${suffix}`;
    const strict = await completeGuestProfile({
      fillingFor: "self",
      values: full,
      contact: { kind: "mobile", value: strictMobile },
      password: TEST_PASSWORD,
      jar,
    });
    assert.equal(strict.ok, false);
    if (!strict.ok) assert.equal(strict.error, "VERIFICATION_REQUIRED");

    // 3g. the two spoken preferences ride in the same `finish` payload and
    // land on the partner-preference row — no second call, no second account.
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    const prefMobile = `9${String(Date.now() + 7).slice(-9)}`;
    const withPrefs = await completeGuestProfile({
      fillingFor: "self",
      values: { ...full, partnerAgeRange: "25-29", partnerCityPreference: "jaipur, delhi ncr" },
      contact: { kind: "mobile", value: prefMobile },
      password: TEST_PASSWORD,
      jar,
    });
    assert.equal(withPrefs.ok, true);
    if (withPrefs.ok) assert.equal(withPrefs.live, true);
    const prefUser = await prisma.user.findUniqueOrThrow({
      where: { mobile: prefMobile },
      include: { profile: { include: { partnerPreferences: true, fieldProvenance: true } } },
    });
    created.push(prefUser.id);
    assert.equal(prefUser.profile?.partnerPreferences?.minAge, 25);
    assert.equal(prefUser.profile?.partnerPreferences?.maxAge, 29);
    assert.deepEqual(prefUser.profile?.partnerPreferences?.preferredCities, ["Jaipur", "Delhi NCR"]);
    assert.ok(
      prefUser.profile?.fieldProvenance.some((p) => p.fieldKey === "partnerAgeRange" && p.confirmed),
      "a spoken, read-back, confirmed preference is user-confirmed provenance",
    );

    // 3h. a signed-in member with a half-built profile — what a registration,
    // a Google sign-in or an OTP login leaves behind. The confirmed card is
    // written onto the profile they already have; only what changed is
    // re-labelled as theirs; going live re-signs the session cookie.
    const { landingPathForRole } = await import("../lib/auth/landingPath");
    assert.equal(landingPathForRole("USER", "INCOMPLETE"), "/bolo", "an unfinished profile is finished on /bolo");
    assert.equal(landingPathForRole("USER", "ACTIVE"), "/user/dashboard");
    const { createMemberAccount } = await import("../lib/services/auth/accountCreation");
    const { saveDraft } = await import("../lib/services/profile/draftService");
    const { saveFieldProvenance, getFieldProvenance } = await import("../lib/services/profile/provenanceService");

    resetCookieJar();
    const memberUser = await createMemberAccount({
      fullName: "Meera Member Test",
      email: `bolo-member+${suffix}@local.test`,
      passwordHash: null,
      jar,
    });
    created.push(memberUser.id);
    const halfBuilt = await saveDraft(memberUser.id, {
      fullName: "Meera Member Test",
      gender: "Ladki",
      dateOfBirth: "14/02/1997",
      currentCity: "Pune",
    });
    await saveFieldProvenance(
      halfBuilt.id,
      {
        fullName: { source: "user", confirmed: true },
        gender: { source: "user", confirmed: true },
        dateOfBirth: { source: "ai", confirmed: false },
        currentCity: { source: "user", confirmed: true },
      },
      "SELF",
    );
    const nameRow = () =>
      prisma.profileFieldProvenance.findUniqueOrThrow({
        where: { profileId_fieldKey: { profileId: halfBuilt.id, fieldKey: "fullName" } },
      });
    const nameBefore = await nameRow();

    const member = await loadBoloMember(memberUser);
    assert.equal(member.firstName, "Meera");
    assert.equal(member.hasPassword, false);
    assert.equal(member.fillingFor, "self");
    assert.match(member.values.dateOfBirth ?? "", /^\d{2}\/\d{2}\/1997$/, "a stored date comes back in the draft's own spelling");
    assert.equal(member.values.currentCity, "Pune");
    assert.equal(member.values.height, undefined);
    assert.deepEqual(member.needsReview, ["dateOfBirth"]);

    const badMember = await completeMemberProfile({
      user: memberUser,
      fillingFor: "self",
      values: { ...member.values, height: "5.13" },
    });
    assert.equal(badMember.ok, false);
    if (!badMember.ok) assert.equal(badMember.error, "VALIDATION_FAILED");

    const finished = await completeMemberProfile({
      user: memberUser,
      fillingFor: "self",
      values: {
        ...member.values,
        currentCity: "mumbai",
        height: "5 feet 3",
        maritalStatus: "never married",
        education: "MBA",
        profession: "Architect",
        // Never on the card: ignored — not validated, not written.
        annualIncome: "not on the card",
      },
    });
    assert.equal(finished.ok, true);
    if (!finished.ok) throw new Error("unreachable");
    assert.equal(finished.live, true);
    assert.equal(finished.landing, BOLO_LIVE_LANDING);
    assert.equal(finished.existingAccount, true);
    assert.equal(finished.hasPassword, false);
    const memberAfter = await prisma.user.findUniqueOrThrow({ where: { id: memberUser.id }, include: { profile: true } });
    assert.equal(memberAfter.status, "ACTIVE");
    assert.ok(memberAfter.profile && isActivatedOnServer(memberAfter.profile));
    assert.equal(memberAfter.profile?.currentCity, "Mumbai", "a value corrected on the card replaces the old one");
    assert.ok((await cookies()).get("bt_session")?.value, "going live re-signs the session cookie");
    const provenance = await getFieldProvenance(halfBuilt.id);
    assert.equal(provenance.get("dateOfBirth")?.confirmed, true, "the unconfirmed reading is vouched for now");
    assert.equal(provenance.has("annualIncome"), false);
    const nameAfter = await nameRow();
    assert.equal(
      nameAfter.confirmedAt?.getTime(),
      nameBefore.confirmedAt?.getTime(),
      "an unchanged, already-confirmed answer keeps the provenance it had",
    );
    console.log("3. complete guest + member profile ✓");
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
    "components/bolo/SetPasswordCard.tsx",
    "components/bolo/AnswerBubble.tsx",
    "components/bolo/AnswerChips.tsx",
    "components/bolo/AnswerComposer.tsx",
    "components/bolo/BoloHeader.tsx",
    "components/bolo/GrioQuestion.tsx",
    "components/bolo/LiveVoiceBar.tsx",
    "components/bolo/ProfileSheet.tsx",
    "components/bolo/Waveform.tsx",
    "components/auth/PasswordInput.tsx",
    "components/auth/OtpLoginForm.tsx",
    "components/auth/LoginPageView.tsx",
    "components/auth/RegisterPageView.tsx",
    "lib/bolo/liveClient.ts",
  ]);
  assert.deepEqual(leaks, [], `client component reaches server-only: ${leaks.join("; ")}`);
  console.log("4. no client module value-imports a server-only module ✓");

  /* --------------------------- 5. two briefs ---------------------------- */
  const agent = await import("../lib/bolo/agent");
  const guestTools = agent.boloToolDeclarations("guest").map((d) => d.name);
  const memberTools = agent.boloToolDeclarations("member").map((d) => d.name);
  assert.ok(guestTools.includes("request_otp") && guestTools.includes("verify_otp"));
  assert.ok(!memberTools.includes("request_otp") && !memberTools.includes("verify_otp"), "a member brief cannot ask for a number");
  assert.deepEqual(
    agent.boloLiveConfig("Kore", "member").tools[0].functionDeclarations.map((d) => d.name),
    memberTools,
  );
  assert.ok(!agent.BOLO_MEMBER_SYSTEM_INSTRUCTION.includes("request_otp"));
  assert.ok(agent.BOLO_SYSTEM_INSTRUCTION.includes("password bana lijiye"), "the guest brief knows the no-OTP password path");
  const kickoff = agent.boloMemberKickoff({
    firstName: "Meera]",
    fillingFor: null,
    missing: ["height", "education"],
    needsReview: ["dateOfBirth"],
    values: { fullName: "Meera Sharma", currentCity: "Jai]pur" },
  });
  assert.match(kickoff, /pata nahi — pehle poochho/);
  assert.match(kickoff, /Baaki: height/);
  assert.ok(!kickoff.includes("Meera]"), "a typed name cannot close the page's own bracketed note");

  // One question at a time, and a restarted session that still knows the name.
  // Both briefs read the screen's own ladder, so neither can drift back into
  // asking three things while the page holds up one.
  const { BOLO_ASK_ORDER } = await import("../lib/bolo/questions");
  const { FIELD_BY_KEY } = await import("../lib/profile/fields");
  const { MINIMUM_LIVE_KEYS } = await import("../lib/profile/readiness");
  const ladder = BOLO_ASK_ORDER.filter((k) => k !== "fillingFor")
    .map((k) => FIELD_BY_KEY[k]?.label ?? k)
    .join(" → ");
  for (const [who, brief] of [
    ["guest", agent.BOLO_SYSTEM_INSTRUCTION],
    ["member", agent.BOLO_MEMBER_SYSTEM_INSTRUCTION],
  ] as const) {
    assert.ok(brief.includes("EK TURN ME EK HI SAWAAL"), `${who}: one question per turn`);
    assert.ok(brief.includes(ladder), `${who}: the brief asks in the screen's own order`);
    assert.ok(!/2-3 ke chhote batch|teen chhote batch/.test(brief), `${who}: no batching of two or three fields`);
    assert.ok(brief.includes('"filled"'), `${who}: the brief is told where its memory lives`);
  }
  assert.ok(
    kickoff.includes('fullName (Full Name) = "Meera Sharma"'),
    "a kickoff carries the answers themselves, so a restarted session does not re-ask the name",
  );
  assert.ok(!kickoff.includes("Jai]pur"), "a typed value cannot close the page's own bracketed note either");
  assert.ok(kickoff.includes('currentCity (Current City) = "Jaipur"'));
  const guestKickoff = agent.boloGuestKickoff({
    fillingFor: "self",
    missing: ["education"],
    values: { fullName: "Rahul Sharma" },
  });
  assert.ok(guestKickoff.includes('fullName (Full Name) = "Rahul Sharma"'));
  assert.equal(
    agent.boloGuestKickoff({ fillingFor: null, missing: [...MINIMUM_LIVE_KEYS], values: {} }),
    agent.BOLO_KICKOFF_TEXT,
    "a visitor who has answered nothing still gets the plain opening",
  );
  const { isAcceptablePassword } = await import("../lib/auth/passwordPolicy");
  assert.equal(isAcceptablePassword("1234567"), false);
  assert.equal(isAcceptablePassword("12345678"), true);
  console.log("5. guest and member briefs, password rule ✓");

  console.log("\nbolo-check: all green");
}

main().catch((err) => {
  console.error("bolo-check FAILED:", err);
  process.exit(1);
});
