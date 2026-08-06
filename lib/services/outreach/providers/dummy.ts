import type { OutreachPayload, OutreachProvider, OutreachSendResult } from "../types";

/**
 * The development provider: logs what would have gone out and reports success.
 *
 * Same role the dummy payment gateway plays — the whole flow (button, outbox
 * row, dedupe, history, error states) is exercisable end to end before a
 * single real API key exists, and swapping in the real one is a `.env` change
 * rather than a code change.
 *
 * It logs the recipient's address *masked*. A full phone number in a server
 * log is the same leak as a full phone number on the client, just somewhere
 * quieter, and dev logs get pasted into issues.
 */

function mask(value: string | null): string {
  if (!value) return "—";
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

export const dummyProvider: OutreachProvider = {
  name: "dummy",

  async send(payload: OutreachPayload): Promise<OutreachSendResult> {
    const address = payload.channel === "EMAIL" ? payload.recipient.email : payload.recipient.mobile;

    // Still enforced here even though nothing is really sent: "no address" is
    // a real outcome the UI has to render, and if only the live providers
    // produced it, it would first be seen in production.
    if (!address) {
      return {
        ok: false,
        provider: "dummy",
        kind: "no_address",
        message:
          payload.channel === "EMAIL"
            ? "Is lead ka email nahi hai — WhatsApp se bhejein."
            : "Is lead ka mobile number nahi hai — email se bhejein.",
      };
    }

    console.info(
      `[outreach:dummy] ${payload.channel} → ${mask(address)}` +
        (payload.subject ? ` | subject: ${payload.subject}` : "") +
        `\n${payload.body}`,
    );

    return { ok: true, provider: "dummy", providerRef: `dummy_${Date.now().toString(36)}` };
  },
};
