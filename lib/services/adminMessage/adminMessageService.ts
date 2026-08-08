import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { grantOverride, type CapabilityKey, type CapabilityValue } from "@/lib/services/plans/entitlementOverrides";
import { resendEmailProvider } from "@/lib/services/outreach/providers/resendEmail";
import { whatsappCloudProvider } from "@/lib/services/outreach/providers/whatsappCloud";
import { isSegmentKey, resolveAll, resolveSegment, type SegmentKey } from "./segments";
import type {
  AdminMessageAudience,
  AdminMessageChannel,
  AdminMessageTarget,
  Role,
} from "@prisma/client";
import type { PlanCode } from "@/lib/constants/plans";

/**
 * Admin → people messaging: offers, announcements, and one-off notes.
 *
 * Three brakes, all load-bearing — see the schema comment for why:
 *
 *   • **Dry run before send.** `previewAdminMessage` returns the exact
 *     recipient count from the exact same resolver `sendAdminMessage` uses, so
 *     nobody presses send on a number they haven't seen.
 *   • **Daily cap on ALL.** A message to everyone is a once-a-day-at-most act.
 *   • **Per-recipient dedupe.** `AdminMessageDelivery`'s unique key means a
 *     retry after a partial failure resumes rather than re-buzzing everyone.
 *
 * An offer can also *do* something: `offerGrant` runs through the existing
 * `grantOverride()`, which means the unlock is raise-only, audited, expiring,
 * and visible on the user's own subscription card as a grant rather than a
 * purchase. Marketing copy and the entitlement it promises stay in one place.
 */

const MAX_BROADCASTS_PER_DAY = 3;
/** Beyond this an admin is doing a campaign, not sending a note — lifecycle owns that. */
const MAX_RECIPIENTS = 5_000;

export type OfferGrant = {
  planCode?: PlanCode;
  capabilityKey?: CapabilityKey;
  value?: CapabilityValue;
  /** Null = never expires. */
  days?: number | null;
};

export type AdminMessageInput = {
  audience: AdminMessageAudience;
  target: AdminMessageTarget;
  targetUserId?: string | null;
  segmentKey?: string | null;
  title: string;
  body: string;
  href?: string | null;
  channels: AdminMessageChannel[];
  offerGrant?: OfferGrant | null;
};

export type AdminMessageResult =
  | { ok: true; messageId: string; recipientCount: number; sentCount: number; failedCount: number }
  | { ok: false; error: string; message: string; status: number };

export type PreviewResult =
  | { ok: true; recipientCount: number; withEmail: number; withMobile: number }
  | { ok: false; error: string; message: string; status: number };

/** The one place recipients are decided — preview and send must never diverge. */
async function resolveRecipientIds(input: AdminMessageInput): Promise<string[] | { error: string }> {
  if (input.target === "SINGLE") {
    if (!input.targetUserId) return { error: "Kis user ko bhejna hai, wo chuniye." };
    const user = await prisma.user.findFirst({
      where: { id: input.targetUserId, deletedAt: null, status: { in: ["ACTIVE", "INCOMPLETE"] } },
      select: { id: true },
    });
    return user ? [user.id] : { error: "Ye user nahi mila (ya block/delete ho chuka hai)." };
  }

  if (input.target === "SEGMENT") {
    if (!input.segmentKey || !isSegmentKey(input.segmentKey)) {
      return { error: "Segment chuniye." };
    }
    return resolveSegment(input.segmentKey as SegmentKey);
  }

  return resolveAll(input.audience);
}

export async function previewAdminMessage(input: AdminMessageInput): Promise<PreviewResult> {
  const ids = await resolveRecipientIds(input);
  if (!Array.isArray(ids)) {
    return { ok: false, error: "VALIDATION_FAILED", message: ids.error, status: 422 };
  }

  // Reachability per channel, so "500 log" doesn't quietly mean "500 log,
  // 90 of whom have no email".
  const contacts = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { email: true, mobile: true },
  });

  return {
    ok: true,
    recipientCount: ids.length,
    withEmail: contacts.filter((c) => c.email).length,
    withMobile: contacts.filter((c) => c.mobile).length,
  };
}

export async function sendAdminMessage(
  input: AdminMessageInput,
  actor: { id: string; role: Role },
): Promise<AdminMessageResult> {
  if (!input.title.trim() || !input.body.trim()) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Title aur message dono likhna zaroori hai.", status: 422 };
  }
  if (input.channels.length === 0) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Kam se kam ek channel chuniye.", status: 422 };
  }

  if (input.target === "ALL") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.adminMessage.count({
      where: { target: "ALL", status: "SENT", sentAt: { gt: since } },
    });
    if (recent >= MAX_BROADCASTS_PER_DAY) {
      return {
        ok: false,
        error: "RATE_LIMITED",
        message: `Aaj ${MAX_BROADCASTS_PER_DAY} broadcast ho chuke hain. Sabko roz-roz message bhejna hi wo cheez hai jisse log notifications band kar dete hain.`,
        status: 429,
      };
    }
  }

  const ids = await resolveRecipientIds(input);
  if (!Array.isArray(ids)) {
    return { ok: false, error: "VALIDATION_FAILED", message: ids.error, status: 422 };
  }
  if (ids.length === 0) {
    return { ok: false, error: "EMPTY_AUDIENCE", message: "Is audience me abhi koi nahi hai.", status: 422 };
  }
  if (ids.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      error: "TOO_MANY",
      message: `${ids.length} log bahut zyada hain (limit ${MAX_RECIPIENTS}). Chhota segment chuniye.`,
      status: 422,
    };
  }

  const message = await prisma.adminMessage.create({
    data: {
      audience: input.audience,
      target: input.target,
      targetUserId: input.target === "SINGLE" ? input.targetUserId : null,
      segmentKey: input.target === "SEGMENT" ? input.segmentKey : null,
      title: input.title.trim(),
      body: input.body.trim(),
      href: input.href?.trim() || null,
      channels: input.channels,
      offerGrant: input.offerGrant ? (input.offerGrant as object) : undefined,
      status: "SENDING",
      recipientCount: ids.length,
      createdBy: actor.id,
    },
  });

  const recipients = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, email: true, mobile: true },
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    // The entitlement first: if the offer text says a feature is open, it must
    // already be open by the time the notification lands.
    if (input.offerGrant) {
      await applyOffer(input.offerGrant, r.id, message.title, actor);
    }

    for (const channel of input.channels) {
      const outcome = await deliverOne({ channel, message, recipient: r });
      if (outcome === "SENT") sentCount++;
      else if (outcome === "FAILED") failedCount++;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.adminMessage.update({
      where: { id: message.id },
      data: { status: failedCount > 0 && sentCount === 0 ? "FAILED" : "SENT", sentAt: new Date(), sentCount, failedCount },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actionType: "ADMIN_MESSAGE_SENT",
        targetType: "admin_message",
        targetId: message.id,
        newValue: `${input.audience}/${input.target}${input.segmentKey ? `:${input.segmentKey}` : ""} → ${ids.length} log, ${input.channels.join("+")}`,
        reason: input.title.trim(),
      },
    });
  });

  return { ok: true, messageId: message.id, recipientCount: ids.length, sentCount, failedCount };
}

async function applyOffer(
  offer: OfferGrant,
  userId: string,
  title: string,
  actor: { id: string; role: Role },
): Promise<void> {
  if (!offer.planCode && !offer.capabilityKey) return;
  const expiresAt =
    offer.days == null ? null : new Date(Date.now() + offer.days * 24 * 60 * 60 * 1000);

  // grantOverride sends its own PLAN_GRANTED notice, which is the right
  // behaviour for a hand-issued grant but redundant next to the offer message
  // this is attached to. It stays: two notices about the same good news is a
  // far smaller problem than a user whose features changed with no explanation
  // if the offer channel happens to be email-only.
  await grantOverride({
    userId,
    planCode: offer.planCode ?? null,
    capabilityKey: offer.capabilityKey ?? null,
    value: offer.value,
    reason: `Offer: ${title}`,
    expiresAt,
    actorId: actor.id,
    actorRole: actor.role,
  });
}

type DeliveryOutcome = "SENT" | "SKIPPED" | "FAILED";

async function deliverOne(params: {
  channel: AdminMessageChannel;
  message: { id: string; title: string; body: string; href: string | null };
  recipient: { id: string; fullName: string; email: string | null; mobile: string | null };
}): Promise<DeliveryOutcome> {
  const { channel, message, recipient } = params;

  // The dedupe. A retried send finds the row already there and stops.
  const already = await prisma.adminMessageDelivery.findUnique({
    where: { messageId_userId_channel: { messageId: message.id, userId: recipient.id, channel } },
  });
  if (already) return "SKIPPED";

  let status: DeliveryOutcome = "SENT";
  let providerRef: string | null = null;
  let failureReason: string | null = null;

  try {
    if (channel === "APP") {
      // The inbox + push path every other feature already uses.
      await createNotice({
        userId: recipient.id,
        kind: "ANNOUNCEMENT",
        title: message.title,
        body: message.body,
        href: message.href ?? "/user/inbox",
        relatedId: message.id,
      });
    } else {
      const provider = channel === "EMAIL" ? resendEmailProvider : whatsappCloudProvider;
      const result = await provider.send({
        channel: channel === "EMAIL" ? "EMAIL" : "WHATSAPP",
        recipient: {
          email: recipient.email,
          mobile: recipient.mobile,
          firstName: recipient.fullName.trim().split(/\s+/)[0] ?? "",
        },
        subject: channel === "EMAIL" ? message.title : null,
        body: message.body,
      });
      if (result.ok) {
        providerRef = result.providerRef;
      } else {
        // "This person has no email" is not a failure of the send — it is a
        // fact about the recipient, and counting it as failed would make a
        // healthy broadcast look broken.
        status = result.kind === "no_address" ? "SKIPPED" : "FAILED";
        failureReason = result.message;
      }
    }
  } catch (err) {
    status = "FAILED";
    failureReason = err instanceof Error ? err.message : String(err);
  }

  await prisma.adminMessageDelivery.create({
    data: {
      messageId: message.id,
      userId: recipient.id,
      channel,
      status,
      providerRef,
      failureReason,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });

  return status;
}

export type AdminMessageRow = {
  id: string;
  title: string;
  audience: AdminMessageAudience;
  target: AdminMessageTarget;
  segmentKey: string | null;
  channels: AdminMessageChannel[];
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  hasOffer: boolean;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
};

export async function listAdminMessages(limit = 25): Promise<AdminMessageRow[]> {
  const rows = await prisma.adminMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    audience: r.audience,
    target: r.target,
    segmentKey: r.segmentKey,
    channels: r.channels,
    recipientCount: r.recipientCount,
    sentCount: r.sentCount,
    failedCount: r.failedCount,
    hasOffer: r.offerGrant !== null,
    status: r.status,
    sentAt: r.sentAt,
    createdAt: r.createdAt,
  }));
}
