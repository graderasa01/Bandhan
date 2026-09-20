import "./_env";

/**
 * Twilio Verify, for real — the one thing a mock cannot tell you.
 *
 * `scripts/contact-verification-check.ts` proves the *app's* rules (expiry,
 * cooldown, attempt caps) against a mocked Twilio. This probe proves the
 * other half: that the three `TWILIO_*` values in .env.local actually open
 * an account, that the Verify Service SID belongs to it, and — on a trial
 * account — that the number you are about to text is one Twilio will agree
 * to text at all.
 *
 * Run (read-only, sends nothing, costs nothing):
 *   npx tsx scripts/twilio-live-probe.ts
 *
 * Run (sends ONE real SMS to that number):
 *   npx tsx scripts/twilio-live-probe.ts 9876543210
 *
 * Run (confirms the code that arrived):
 *   npx tsx scripts/twilio-live-probe.ts 9876543210 123456
 *
 * The send/check calls go through `liveTwilioVerifyAdapter` — the same module
 * `/login` and `/bolo` call — so a PASS here is a statement about the app's
 * own code path, not about a curl this script invented.
 */

import {
  getTwilioCredentials,
  liveTwilioVerifyAdapter,
  toE164Indian,
} from "../lib/services/verification/contactVerification/twilioVerifyAdapter";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function basic(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

async function main() {
  const [rawNumber, code] = process.argv.slice(2);

  console.log("\n— Credentials (.env.local) —");
  const present = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ?? "",
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "",
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID ?? "",
  };
  for (const [key, value] of Object.entries(present)) {
    check(key, value.length > 0, value ? `${value.slice(0, 6)}… (${value.length} chars)` : "missing");
  }
  check(
    "TWILIO_ACCOUNT_SID looks like an Account SID",
    present.TWILIO_ACCOUNT_SID.startsWith("AC"),
    present.TWILIO_ACCOUNT_SID ? "starts with AC" : "",
  );
  check(
    "TWILIO_VERIFY_SERVICE_SID looks like a Verify Service SID",
    present.TWILIO_VERIFY_SERVICE_SID.startsWith("VA"),
    present.TWILIO_VERIFY_SERVICE_SID
      ? "starts with VA (an AC… or SK… here is the wrong SID)"
      : "",
  );

  const creds = getTwilioCredentials();
  if (!creds) {
    console.log(
      "\nFAIL — with any of the three empty, the app reports \"Mobile verification abhi configure nahi hai\"" +
        "\n       and login falls back to password. Nothing else was attempted.\n",
    );
    process.exit(1);
  }

  const auth = { Authorization: basic(creds.accountSid, creds.authToken) };

  console.log("\n— Account —");
  const accountRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}.json`, {
    headers: auth,
  });
  const account = (await accountRes.json().catch(() => null)) as
    | { friendly_name?: string; status?: string; type?: string; message?: string }
    | null;
  check(
    "credentials open the account",
    accountRes.ok,
    accountRes.ok
      ? `${account?.friendly_name ?? "?"} · status ${account?.status ?? "?"} · type ${account?.type ?? "?"}`
      : `HTTP ${accountRes.status} — ${account?.message ?? "auth rejected"}`,
  );
  const isTrial = (account?.type ?? "").toLowerCase() === "trial";
  if (accountRes.ok && isTrial) {
    console.log("       trial account: SMS only goes to numbers verified in the console,");
    console.log("       and every message carries Twilio's trial prefix.");
  }

  console.log("\n— Verify service —");
  const serviceRes = await fetch(`https://verify.twilio.com/v2/Services/${creds.verifyServiceSid}`, {
    headers: auth,
  });
  const service = (await serviceRes.json().catch(() => null)) as
    | { friendly_name?: string; code_length?: number; message?: string }
    | null;
  check(
    "Verify service exists on this account",
    serviceRes.ok,
    serviceRes.ok
      ? `${service?.friendly_name ?? "?"} · ${service?.code_length ?? "?"}-digit codes`
      : `HTTP ${serviceRes.status} — ${service?.message ?? "not found"}`,
  );
  check(
    "code length is 6",
    !serviceRes.ok || service?.code_length === 6,
    service?.code_length === 6
      ? ""
      : `service sends ${service?.code_length}-digit codes, but the app only accepts 6 (contactOtpService MAX check)`,
  );

  {
    console.log("\n— Verified caller IDs (the numbers Twilio will text today) —");
    const callerRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/OutgoingCallerIds.json?PageSize=50`,
      { headers: auth },
    );
    const callers = (await callerRes.json().catch(() => null)) as
      | { outgoing_caller_ids?: { phone_number?: string; friendly_name?: string }[] }
      | null;
    const numbers = (callers?.outgoing_caller_ids ?? []).map((c) => c.phone_number ?? "").filter(Boolean);
    if (!callerRes.ok) console.log(`  (could not read the list — HTTP ${callerRes.status})`);
    else if (numbers.length === 0) console.log("  (none yet — add one under Phone Numbers → Verified Caller IDs)");
    else numbers.forEach((n) => console.log(`  ${n}`));
    if (rawNumber) {
      const e164 = toE164Indian(rawNumber);
      check(
        `${e164} is a verified caller ID`,
        !callerRes.ok || numbers.includes(e164),
        numbers.includes(e164)
          ? ""
          : "not on the list — Twilio refuses unverified recipients until this account's Primary Compliance Profile is approved",
      );
    }
  }

  if (!rawNumber) {
    console.log(
      `\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`} (read-only — no SMS sent)` +
        "\nPass a number to send one: npx tsx scripts/twilio-live-probe.ts 9876543210\n",
    );
    process.exit(failures === 0 ? 0 : 1);
  }

  const e164 = toE164Indian(rawNumber);

  if (!code) {
    console.log(`\n— Sending a real code to ${e164} —`);
    const sent = await liveTwilioVerifyAdapter.startVerification(e164);
    if (sent.ok) {
      check("startVerification", true, `sid ${sent.sid}`);
      console.log(`\n  Code aaye to: npx tsx scripts/twilio-live-probe.ts ${rawNumber} <code>`);
      console.log("  (Twilio's own expiry is 10 minutes, same as the app's OTP_EXPIRY_MS.)");
    } else {
      check("startVerification", false, `${sent.reason} — ${sent.message}`);
    }
  } else {
    console.log(`\n— Checking ${code} against ${e164} —`);
    const result = await liveTwilioVerifyAdapter.checkVerification(e164, code);
    if (!result.ok) {
      check("checkVerification", false, `${result.reason} — ${result.message}`);
    } else {
      check("code approved", result.approved, result.approved ? "" : "Twilio says this code is wrong or expired");
    }
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
