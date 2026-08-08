import { getProviderKey } from "@/lib/ai/credentials";
import type { OutreachPayload, OutreachProvider, OutreachSendResult } from "../types";

/**
 * Meta's WhatsApp Cloud API.
 *
 * ## The 24-hour window, which decides everything about this file
 *
 * WhatsApp will only deliver a *free-form* message to someone who messaged the
 * business in the last 24 hours. Our leads have not — they were referred by a
 * partner and have never messaged BandhanTak — so in production these sends
 * must go out as a **pre-approved template**, not as free text. Meta rejects
 * free-form sends outside the window with error 131047, which is not a bug to
 * debug when it appears.
 *
 * So the provider works in two modes:
 *
 * - `WHATSAPP_TEMPLATE_NAME` set → template mode. The rendered body is passed
 *   as a single `{{1}}` body parameter, so one approved template covers every
 *   template in lib/partner/leadTemplates.ts and adding new copy needs no new
 *   Meta approval. Register a template whose body is exactly `{{1}}` (plus any
 *   fixed header/footer you want).
 * - unset → free-form text mode, which is useful only for testing against a
 *   number that has just messaged the business.
 *
 * Env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, optionally
 * WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANG (default "hi"), and
 * WHATSAPP_API_VERSION (default "v21.0").
 */

const GRAPH_HOST = "https://graph.facebook.com";

/** Meta wants digits only, country code included, no `+`. */
function toWaId(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  // A bare 10-digit Indian number is what our own User.mobile stores (the
  // register route validates exactly that), so it needs the country code back.
  return digits.length === 10 ? `91${digits}` : digits;
}

export const whatsappCloudProvider: OutreachProvider = {
  name: "whatsapp_cloud",

  async send(payload: OutreachPayload): Promise<OutreachSendResult> {
    // Token resolves through /admin/ai-settings first (lib/ai/credentials.ts) —
    // Meta's access tokens expire and rotating one shouldn't need a redeploy.
    // The phone-number id stays env-only: it identifies the WhatsApp Business
    // number itself, not a secret, and it doesn't rotate.
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = await getProviderKey("WHATSAPP");

    if (!phoneNumberId || !token) {
      return {
        ok: false,
        provider: "whatsapp_cloud",
        kind: "not_configured",
        message: "WhatsApp abhi configure nahi hua hai.",
      };
    }
    if (!payload.recipient.mobile) {
      return {
        ok: false,
        provider: "whatsapp_cloud",
        kind: "no_address",
        message: "Is lead ka mobile number nahi hai — email se bhejein.",
      };
    }

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
    const to = toWaId(payload.recipient.mobile);

    const message = templateName
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "hi" },
            components: [
              { type: "body", parameters: [{ type: "text", text: payload.body }] },
            ],
          },
        }
      : {
          messaging_product: "whatsapp",
          to,
          type: "text",
          // Our bodies carry a link; without this WhatsApp shows it as bare text.
          text: { preview_url: true, body: payload.body },
        };

    try {
      const res = await fetch(`${GRAPH_HOST}/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const json = (await res.json().catch(() => null)) as
        | { messages?: { id: string }[]; error?: { message?: string; code?: number } }
        | null;

      if (!res.ok) {
        const code = json?.error?.code;
        const kind = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limited" : "rejected";
        return {
          ok: false,
          provider: "whatsapp_cloud",
          kind,
          // 131047 is the 24-hour-window rejection specifically. Naming it
          // beats "message failed" — it tells whoever reads the outbox that
          // the fix is a template, not a retry.
          message:
            code === 131047
              ? "WhatsApp ne rok diya — 24-ghante ke bahar approved template zaroori hai."
              : (json?.error?.message ?? `WhatsApp ne message reject kar diya (${res.status}).`),
        };
      }

      return {
        ok: true,
        provider: "whatsapp_cloud",
        providerRef: json?.messages?.[0]?.id ?? null,
      };
    } catch (err) {
      return {
        ok: false,
        provider: "whatsapp_cloud",
        kind: "connection",
        message: err instanceof Error ? err.message : "WhatsApp tak pahunch nahi paye.",
      };
    }
  },
};
