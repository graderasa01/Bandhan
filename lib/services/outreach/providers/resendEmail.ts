import type { OutreachPayload, OutreachProvider, OutreachSendResult } from "../types";

/**
 * Email via Resend's HTTP API.
 *
 * Chosen over SMTP because it is a plain `fetch` — no new dependency, nothing
 * to keep a connection pool for, and it works unchanged on Railway where
 * outbound SMTP ports are commonly blocked.
 *
 * Env: RESEND_API_KEY, OUTREACH_EMAIL_FROM (e.g. "BandhanTak
 * <rishtey@bandhantak.com>" — the domain must be verified in Resend), and
 * optionally OUTREACH_EMAIL_REPLY_TO.
 *
 * Bodies come in as plain text from lib/partner/leadTemplates.ts and are sent
 * as both text and a minimally-wrapped HTML part. HTML-only mail scores badly
 * with spam filters and is unreadable in text clients; text-only loses the
 * clickable link that is the entire point of the message.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → paragraphs, with bare URLs made clickable. Deliberately minimal. */
function toHtml(body: string): string {
  const linked = escapeHtml(body).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#7c2d4a">$1</a>',
  );
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${paragraphs}</div>`;
}

export const resendEmailProvider: OutreachProvider = {
  name: "resend",

  async send(payload: OutreachPayload): Promise<OutreachSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.OUTREACH_EMAIL_FROM;

    if (!apiKey || !from) {
      return {
        ok: false,
        provider: "resend",
        kind: "not_configured",
        message: "Email abhi configure nahi hua hai.",
      };
    }
    if (!payload.recipient.email) {
      return {
        ok: false,
        provider: "resend",
        kind: "no_address",
        message: "Is lead ka email nahi hai — WhatsApp se bhejein.",
      };
    }

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [payload.recipient.email],
          subject: payload.subject ?? "BandhanTak",
          text: payload.body,
          html: toHtml(payload.body),
          ...(process.env.OUTREACH_EMAIL_REPLY_TO && {
            reply_to: process.env.OUTREACH_EMAIL_REPLY_TO,
          }),
        }),
      });

      const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;

      if (!res.ok) {
        return {
          ok: false,
          provider: "resend",
          kind: res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limited" : "rejected",
          message: json?.message ?? `Email bhejne me dikkat aayi (${res.status}).`,
        };
      }

      return { ok: true, provider: "resend", providerRef: json?.id ?? null };
    } catch (err) {
      return {
        ok: false,
        provider: "resend",
        kind: "connection",
        message: err instanceof Error ? err.message : "Email service tak pahunch nahi paye.",
      };
    }
  },
};
