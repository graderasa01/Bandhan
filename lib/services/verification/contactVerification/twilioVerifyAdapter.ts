import "server-only";

/**
 * Twilio Verify, via plain `fetch` — no SDK, per the brief. Twilio owns the
 * code (generation, storage, expiry) on its own side; this app only ever
 * asks it to start a check and to confirm one. That is why
 * `ContactVerificationChallenge.codeHash` is null for PHONE rows — there is
 * no code here to hash.
 *
 * Injectable so automated checks never make a live call: `contactVerificationService.ts`
 * calls through the `TwilioVerifyAdapter` interface, never this module
 * directly, and a test supplies a mock that implements the same two
 * functions without touching `process.env` at all.
 */

export type TwilioSendResult =
  | { ok: true; sid: string }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export type TwilioCheckResult =
  | { ok: true; approved: boolean }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export interface TwilioVerifyCredentials {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
}

export interface TwilioVerifyAdapter {
  startVerification(e164: string): Promise<TwilioSendResult>;
  checkVerification(e164: string, code: string): Promise<TwilioCheckResult>;
}

function authHeader(creds: TwilioVerifyCredentials): string {
  return `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`;
}

/**
 * The real adapter — reads its own credentials from `process.env` on every
 * call rather than taking them as a parameter, the same way
 * `liveEmailOtpAdapter.sendOtp` reads `RESEND_API_KEY` internally. That is
 * what keeps `contactVerificationService.ts` able to call
 * `adapters.twilio.startVerification(e164)` uniformly whether it was handed
 * this adapter or a test's mock — a mock has no reason to need real Twilio
 * credentials to exist.
 */
export const liveTwilioVerifyAdapter: TwilioVerifyAdapter = {
  async startVerification(e164) {
    const creds = getTwilioCredentials();
    if (!creds) return { ok: false, reason: "not_configured", message: "Mobile verification abhi configure nahi hai." };
    try {
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${creds.verifyServiceSid}/Verifications`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader(creds),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: e164, Channel: "sms" }),
        },
      );
      const json = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
      if (!res.ok || !json?.sid) {
        return { ok: false, reason: "provider_error", message: json?.message ?? `Twilio error (${res.status})` };
      }
      return { ok: true, sid: json.sid };
    } catch (err) {
      return {
        ok: false,
        reason: "provider_error",
        message: err instanceof Error ? err.message : "Twilio tak pahunch nahi paye.",
      };
    }
  },

  async checkVerification(e164, code) {
    const creds = getTwilioCredentials();
    if (!creds) return { ok: false, reason: "not_configured", message: "Mobile verification abhi configure nahi hai." };
    try {
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${creds.verifyServiceSid}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader(creds),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: e164, Code: code }),
        },
      );
      const json = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
      if (!res.ok) {
        // Twilio returns 404 for "no pending verification" — that is a normal
        // "wrong/expired code" outcome, not a provider failure, so it reads as
        // approved: false rather than an error the caller has to special-case.
        if (res.status === 404) return { ok: true, approved: false };
        return { ok: false, reason: "provider_error", message: json?.message ?? `Twilio error (${res.status})` };
      }
      return { ok: true, approved: json?.status === "approved" };
    } catch (err) {
      return {
        ok: false,
        reason: "provider_error",
        message: err instanceof Error ? err.message : "Twilio tak pahunch nahi paye.",
      };
    }
  },
};

/** Normalizes a stored 10-digit Indian mobile (see register's regex) to E.164. Already-E.164 input passes through. */
export function toE164Indian(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (mobile.startsWith("+")) return mobile;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+91${digits}`;
}

export function getTwilioCredentials(): TwilioVerifyCredentials | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !verifyServiceSid) return null;
  return { accountSid, authToken, verifyServiceSid };
}
