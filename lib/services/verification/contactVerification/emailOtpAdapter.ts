import "server-only";

/**
 * Email OTP delivery via Resend's HTTP API — the same `fetch`-only approach
 * `lib/services/outreach/providers/resendEmail.ts` uses, but deliberately not
 * that module: this is a transactional security code, not a lead message, and
 * it reads its own env pair (`RESEND_API_KEY`, `AUTH_EMAIL_FROM`) rather than
 * the admin-configurable outreach key and the outreach from-address, so a
 * partner-outreach config change can never silently affect account
 * verification.
 *
 * Injectable for the same reason as the Twilio adapter: automated checks pass
 * a mock and never make a live call.
 */

export type EmailSendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export interface EmailOtpAdapter {
  sendOtp(to: string, code: string): Promise<EmailSendResult>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function otpEmailHtml(code: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
<p style="margin:0 0 14px">Aapka BandhanTak email verification code:</p>
<p style="margin:0 0 14px;font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
<p style="margin:0;color:#6b7280;font-size:13px">Ye code 10 minute me expire ho jayega. Agar aapne ye request nahi kiya, is email ko ignore karein.</p>
</div>`;
}

export const liveEmailOtpAdapter: EmailOtpAdapter = {
  async sendOtp(to, code) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.AUTH_EMAIL_FROM;
    if (!apiKey || !from) {
      return { ok: false, reason: "not_configured", message: "Email verification abhi configure nahi hai." };
    }

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject: "BandhanTak — Aapka verification code",
          text: `Aapka BandhanTak email verification code: ${code}\n\nYe code 10 minute me expire ho jayega.`,
          html: otpEmailHtml(code),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        return { ok: false, reason: "provider_error", message: json?.message ?? `Resend error (${res.status})` };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: "provider_error",
        message: err instanceof Error ? err.message : "Email service tak pahunch nahi paye.",
      };
    }
  },
};

export function isEmailOtpConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}
