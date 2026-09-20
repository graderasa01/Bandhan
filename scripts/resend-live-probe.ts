import "./_env";

/**
 * Email OTP, for real — the Resend half of `scripts/twilio-live-probe.ts`.
 *
 * Run (read-only, sends nothing):
 *   npx tsx scripts/resend-live-probe.ts
 *
 * Run (sends ONE real code to that address):
 *   npx tsx scripts/resend-live-probe.ts someone@example.com
 *
 * The send goes through `liveEmailOtpAdapter` — the same module `/login`,
 * `/bolo` and `/user/verify-contact` call — so a PASS is a statement about
 * the app's own path.
 *
 * Note which env pair this reads: `RESEND_API_KEY` + `AUTH_EMAIL_FROM`,
 * straight from `process.env`. The Resend key saved at /admin/ai-settings is a
 * *different* setting — it belongs to partner outreach and admin messages, and
 * account verification deliberately does not read it (see the adapter's
 * header comment). For OTP the key has to be in the env file.
 */

import {
  isEmailOtpConfigured,
  liveEmailOtpAdapter,
} from "../lib/services/verification/contactVerification/emailOtpAdapter";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** "BandhanTak <no-reply@bandhantak.com>" and "no-reply@bandhantak.com" both yield the domain. */
function fromDomain(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  const address = (match ? match[1] : from).trim();
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

async function main() {
  const [to] = process.argv.slice(2);

  console.log("\n— Credentials (.env.local) —");
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.AUTH_EMAIL_FROM ?? "";
  check("RESEND_API_KEY", apiKey.length > 0, apiKey ? `${apiKey.slice(0, 6)}… (${apiKey.length} chars)` : "missing");
  check("AUTH_EMAIL_FROM", from.length > 0, from || "missing");
  check(
    "RESEND_API_KEY looks like a Resend key",
    !apiKey || apiKey.startsWith("re_"),
    apiKey && !apiKey.startsWith("re_") ? "Resend keys start with re_" : "",
  );

  if (!isEmailOtpConfigured()) {
    console.log(
      "\nFAIL — with either value empty the app reports \"Email verification abhi configure nahi hai\"." +
        "\n       Nothing else was attempted.\n",
    );
    process.exit(1);
  }

  console.log("\n— Domains on this Resend account —");
  const domainsRes = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const domainsJson = (await domainsRes.json().catch(() => null)) as
    | { data?: { name?: string; status?: string; region?: string }[]; message?: string }
    | null;

  // A key created with "Sending access" cannot read the domain list. That is
  // the narrower key and the better one to run the app on — so it is a note
  // here, not a failure. The send below is what proves the domain anyway:
  // Resend refuses an unverified from-address with a 403.
  const sendOnlyKey = domainsRes.status === 401 && /restricted/i.test(domainsJson?.message ?? "");
  let domainsReadable = domainsRes.ok;

  if (sendOnlyKey) {
    console.log("  (this key has Sending access only, so the list is not readable —");
    console.log("   that is fine, and it is the safer key for the app to carry)");
    domainsReadable = false;
  } else {
    check(
      "key opens the account",
      domainsRes.ok,
      domainsRes.ok ? "" : `HTTP ${domainsRes.status} — ${domainsJson?.message ?? "rejected"}`,
    );
  }

  const domains = domainsJson?.data ?? [];
  if (domainsReadable && domains.length === 0) {
    console.log("  (no domain added yet — until one is verified, Resend only accepts");
    console.log("   from onboarding@resend.dev, and only to your own signup address)");
  }
  domains.forEach((d) => console.log(`  ${d.name ?? "?"} — ${d.status ?? "?"}${d.region ? ` (${d.region})` : ""}`));

  const domain = fromDomain(from);
  const isTestSender = domain === "resend.dev";
  if (domainsReadable && !isTestSender) {
    const row = domains.find((d) => (d.name ?? "").toLowerCase() === domain);
    check(
      `AUTH_EMAIL_FROM domain (${domain}) is verified`,
      row?.status === "verified",
      row
        ? row.status === "verified"
          ? ""
          : `status is "${row.status}" — add Resend's DNS records and hit Verify`
        : "that domain is not on this account — add it under Domains, or send from onboarding@resend.dev while testing",
    );
  } else if (isTestSender) {
    console.log("  from-address is Resend's test sender — it only delivers to your own signup address");
  }

  if (!to) {
    console.log(
      `\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`} (read-only — no email sent)` +
        (sendOnlyKey ? "\nThe domain can only be proven by sending — pass an address:" : "\nPass an address to send one:") +
        " npx tsx scripts/resend-live-probe.ts you@example.com\n",
    );
    process.exit(failures === 0 ? 0 : 1);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`\n— Sending code ${code} to ${to} —`);
  const sent = await liveEmailOtpAdapter.sendOtp(to, code);
  if (sent.ok) {
    check("sendOtp", true, "Resend accepted it — check the inbox, and the spam folder");
  } else {
    check("sendOtp", false, `${sent.reason} — ${sent.message}`);
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
