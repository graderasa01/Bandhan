import "server-only";
import { prisma } from "@/lib/db/prisma";
import { templateForStatus, type LeadTemplate } from "@/lib/partner/leadTemplates";
import type { LeadStatus } from "@/lib/contracts/partner";
import { dummyProvider } from "./providers/dummy";
import { whatsappCloudProvider } from "./providers/whatsappCloud";
import { resendEmailProvider } from "./providers/resendEmail";
import type { OutreachProvider, OutreachSendResult } from "./types";
import type { OutreachChannel, OutreachTrigger, Prisma } from "@prisma/client";

/**
 * Sending a message to a lead on a partner's behalf — the one place it
 * happens, for both the manual button and the automated nudge job.
 *
 * ## Why this exists at all
 *
 * A partner already had a way to nudge a lead: a `wa.me` link that opened
 * their own WhatsApp with the text pre-filled. That link is still there and is
 * still the better option when the partner is willing — it arrives from a
 * person the family knows. But it needs the partner to have the lead's number
 * in their phone and to actually do it, and plenty of partners won't. This is
 * the fallback: BandhanTak sends the identical copy, signed with the partner's
 * name.
 *
 * ## The privacy boundary is *tighter* here, not looser
 *
 * lib/partner/visibility.ts is emphatic that a partner never sees a lead's
 * contact details. Nothing here weakens that. The partner sends a lead id; the
 * number and email are read server-side, handed straight to a provider, and
 * never appear in a response, a log line, or the outbox row. The partner
 * supplies the decision to send and nothing else.
 *
 * ## Provider selection
 *
 * Mirrors `callAi()` in lib/ai/providers/index.ts: call sites name a channel,
 * this module resolves the provider. Unset env means the dummy provider, so
 * the whole flow is exercisable before any real API key exists — the same
 * thing the dummy payment gateway does for checkout.
 */

export type OutreachSendOutcome =
  | { ok: true; messageId: string; channel: OutreachChannel; templateKey: string }
  | { ok: false; reason: "cooldown" | "opted_out" | "send_failed" | "no_contact"; message: string };

/** Exported so `inviteService` sends through the same providers without duplicating the env logic. */
export function providerFor(channel: OutreachChannel): OutreachProvider {
  if (channel === "EMAIL") {
    return process.env.RESEND_API_KEY ? resendEmailProvider : dummyProvider;
  }
  return process.env.WHATSAPP_ACCESS_TOKEN ? whatsappCloudProvider : dummyProvider;
}

export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://bandhantak.com"
  ).replace(/\/$/, "");
}

/**
 * Has this exact template already gone to this lead inside its own cooldown?
 *
 * Keyed on the lead + template, deliberately not on the partner: a lead has
 * exactly one attributed partner, and the thing being rate-limited is how
 * often *the person* is messaged, not how often the partner presses a button.
 * Only successful sends count — a failed attempt must not lock the template
 * for a month.
 */
async function withinCooldown(userId: string, template: LeadTemplate): Promise<boolean> {
  if (template.cooldownDays <= 0) return false;
  const since = new Date(Date.now() - template.cooldownDays * 86_400_000);
  const recent = await prisma.partnerOutreachMessage.findFirst({
    where: { userId, templateKey: template.key, status: "SENT", createdAt: { gte: since } },
    select: { id: true },
  });
  return recent !== null;
}

export type SendToLeadParams = {
  partnerId: string;
  partnerName: string;
  userId: string;
  leadStatus: LeadStatus;
  channel: OutreachChannel;
  trigger: OutreachTrigger;
  /** Manual sends bypass the cooldown — a partner who deliberately pressed send outranks a schedule. */
  ignoreCooldown?: boolean;
};

export async function sendToLead(params: SendToLeadParams): Promise<OutreachSendOutcome> {
  const { partnerId, partnerName, userId, leadStatus, channel, trigger } = params;
  const template = templateForStatus(leadStatus);

  if (trigger === "AUTOMATED" && !template.automated) {
    return { ok: false, reason: "opted_out", message: "Ye message sirf partner khud bhej sakta hai." };
  }

  const ignoreCooldown = params.ignoreCooldown ?? trigger === "MANUAL";
  if (!ignoreCooldown && (await withinCooldown(userId, template))) {
    return {
      ok: false,
      reason: "cooldown",
      message: `Ye message pichhle ${template.cooldownDays} din me already ja chuka hai.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, mobile: true, email: true, profile: { select: { displayName: true } } },
  });
  if (!user) return { ok: false, reason: "no_contact", message: "Lead nahi mila." };

  const firstName = (user.profile?.displayName?.trim() || user.fullName.trim()).split(/\s+/)[0] ?? "ji";
  const ctx = { firstName, partnerName, appUrl: appOrigin() };
  const rendered =
    channel === "EMAIL"
      ? template.email(ctx)
      : { subject: null as string | null, body: template.whatsapp(ctx) };

  // The row is written before the send, not after: a provider call that hangs
  // or crashes the process must still leave a trace that something was
  // attempted. A row stuck at QUEUED is a visible problem; a send with no row
  // at all is an invisible one.
  const row = await prisma.partnerOutreachMessage.create({
    data: {
      partnerId,
      userId,
      channel,
      trigger,
      templateKey: template.key,
      leadStatusAtSend: leadStatus,
      subject: rendered.subject,
      body: rendered.body,
      status: "QUEUED",
    },
    select: { id: true },
  });

  const provider = providerFor(channel);
  let result: OutreachSendResult;
  try {
    result = await provider.send({
      channel,
      recipient: { mobile: user.mobile, email: user.email, firstName },
      subject: rendered.subject,
      body: rendered.body,
    });
  } catch (err) {
    result = {
      ok: false,
      provider: provider.name,
      kind: "connection",
      message: err instanceof Error ? err.message : "Bhejne me dikkat aayi.",
    };
  }

  await prisma.partnerOutreachMessage.update({
    where: { id: row.id },
    data: result.ok
      ? { status: "SENT", provider: result.provider, providerRef: result.providerRef, sentAt: new Date() }
      : { status: "FAILED", provider: result.provider, failureReason: result.message },
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.kind === "no_address" ? "no_contact" : "send_failed",
      message: result.message,
    };
  }

  return { ok: true, messageId: row.id, channel, templateKey: template.key };
}

export type OutreachHistoryRow = {
  id: string;
  channel: OutreachChannel;
  trigger: OutreachTrigger;
  templateKey: string;
  status: string;
  failureReason: string | null;
  sentAt: string | null;
  createdAt: string;
};

/**
 * The partner's own send history for one lead. Includes the rendered `body`
 * nowhere — the partner already knows what the template says, and the outbox
 * doesn't need to become another surface where lead-specific text leaks.
 */
export async function getOutreachHistory(
  db: Prisma.TransactionClient | typeof prisma,
  partnerId: string,
  userId: string,
  limit = 20,
): Promise<OutreachHistoryRow[]> {
  const rows = await db.partnerOutreachMessage.findMany({
    where: { partnerId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    trigger: r.trigger,
    templateKey: r.templateKey,
    status: r.status,
    failureReason: r.failureReason,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
