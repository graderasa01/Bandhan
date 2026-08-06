import type { OutreachChannel } from "@prisma/client";

/**
 * The contract every outreach provider implements. Kept in its own file (same
 * shape as lib/ai/providers/types.ts) so a provider module can be imported for
 * its types without dragging in its SDK.
 */

export type OutreachRecipient = {
  /** E.164 without the +, e.g. "919876543210". Never leaves the server. */
  mobile: string | null;
  email: string | null;
  firstName: string;
};

export type OutreachPayload = {
  channel: OutreachChannel;
  recipient: OutreachRecipient;
  /** WhatsApp ignores this; email requires it. */
  subject: string | null;
  body: string;
};

export type OutreachSendResult =
  | { ok: true; provider: string; providerRef: string | null }
  | { ok: false; provider: string; kind: OutreachErrorKind; message: string };

export type OutreachErrorKind =
  /** No API key/config for this channel — the deployment hasn't wired it yet. */
  | "not_configured"
  /** The lead has no number (or no email) to send to. */
  | "no_address"
  | "auth"
  | "rate_limited"
  | "rejected"
  | "connection";

export type OutreachProvider = {
  name: string;
  send(payload: OutreachPayload): Promise<OutreachSendResult>;
};
