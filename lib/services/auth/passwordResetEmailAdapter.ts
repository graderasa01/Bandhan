import "server-only";

/**
 * Password-reset email delivery via Resend's HTTP API.
 *
 * Deliberately its own adapter rather than a shared "send transactional
 * email" helper — same reasoning as `emailOtpAdapter.ts`, which this mirrors:
 * it reads the same core-auth `RESEND_API_KEY`/`AUTH_EMAIL_FROM` pair (not the
 * admin-configurable outreach key), so a partner-outreach config change can
 * never silently affect whether someone can recover their account.
 */

export type ResetEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export interface PasswordResetEmailAdapter {
  send(to: string, resetUrl: string): Promise<ResetEmailResult>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function resetEmailHtml(resetUrl: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
<p style="margin:0 0 14px">Aapne BandhanTak account ka password reset karne ki request ki hai.</p>
<p style="margin:0 0 18px">
  <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#c9a96e;color:#1f2937;font-weight:700;text-decoration:none;border-radius:9999px">Naya password set karein</a>
</p>
<p style="margin:0 0 14px;color:#6b7280;font-size:13px">Ye link 30 minute me expire ho jayega. Agar aapne ye request nahi ki, is email ko ignore karein — aapka password waisa hi rahega.</p>
</div>`;
}

export const livePasswordResetEmailAdapter: PasswordResetEmailAdapter = {
  async send(to, resetUrl) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.AUTH_EMAIL_FROM;
    if (!apiKey || !from) {
      return { ok: false, reason: "not_configured", message: "Password reset email abhi configure nahi hai." };
    }

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject: "BandhanTak — Password reset karein",
          text: `Aapne BandhanTak account ka password reset karne ki request ki hai.\n\nYe link 30 minute me expire ho jayega: ${resetUrl}\n\nAgar aapne ye request nahi ki, is email ko ignore karein.`,
          html: resetEmailHtml(resetUrl),
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
