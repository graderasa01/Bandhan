import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { inviteEmail, inviteWhatsApp } from "@/lib/partner/inviteTemplates";
import { appOrigin, providerFor } from "./outreachService";
import type { InviteStatus, OutreachChannel, PartnerInvite } from "@prisma/client";

/**
 * Partner-created invites: a partner types in someone they have personally
 * spoken to, and either shares the link themselves or has BandhanTak send it.
 *
 * ## The brakes, and why each one is here
 *
 * This is the only place in the app that messages a person who never gave us
 * their contact details. Everything else — lead nudges, notices, push —
 * reaches someone with an account. So:
 *
 * - **The attestation is mandatory.** `consentAttestedAt` is non-null in the
 *   schema; there is no path that creates an invite without the partner
 *   confirming they spoke to this person. It is the only opt-in record that
 *   will ever exist for this contact.
 * - **A daily cap per partner.** A referral programme is people a partner
 *   knows. Somebody sending 200 invites a day is working from a purchased
 *   list, and that is the behaviour that gets a WhatsApp sender banned.
 * - **One invite per contact.** Re-inviting the same number is how a helpful
 *   nudge becomes harassment, and the partner gets a clear "already invited"
 *   instead of a silent second send.
 * - **No automated follow-up, ever.** `outreachJob` only walks
 *   `PartnerReferral` rows — people with accounts. An invite that goes
 *   unanswered stays unanswered unless the partner personally acts.
 */

/** Enough entropy that the link is the credential; base64url so it is URL-clean. */
function newToken(): string {
  return randomBytes(16).toString("base64url");
}

export const MAX_INVITES_PER_DAY = 20;

export type CreateInviteParams = {
  partnerId: string;
  partnerName: string;
  fullName: string;
  mobile: string | null;
  email: string | null;
  /** Null means the partner will share the link themselves. */
  channel: OutreachChannel | null;
};

export type CreateInviteResult =
  | {
      ok: true;
      invite: PartnerInvite;
      inviteUrl: string;
      /** Pre-rendered copy for the self-send path — the partner pastes this. */
      shareText: string;
      /** Set when we tried to send and the provider refused. The invite still exists. */
      sendError: string | null;
    }
  | { ok: false; error: "DAILY_CAP" | "DUPLICATE" | "NO_CONTACT"; message: string };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function createInvite(params: CreateInviteParams): Promise<CreateInviteResult> {
  const { partnerId, partnerName, fullName, mobile, email, channel } = params;

  if (!mobile && !email) {
    return { ok: false, error: "NO_CONTACT", message: "Mobile ya email me se ek to daaliye." };
  }
  if (channel === "WHATSAPP" && !mobile) {
    return { ok: false, error: "NO_CONTACT", message: "WhatsApp bhejne ke liye mobile number chahiye." };
  }
  if (channel === "EMAIL" && !email) {
    return { ok: false, error: "NO_CONTACT", message: "Email bhejne ke liye email address chahiye." };
  }

  const sentToday = await prisma.partnerInvite.count({
    where: { partnerId, createdAt: { gte: startOfToday() } },
  });
  if (sentToday >= MAX_INVITES_PER_DAY) {
    return {
      ok: false,
      error: "DAILY_CAP",
      message: `Ek din me ${MAX_INVITES_PER_DAY} invite hi bhej sakte hain. Kal dobara try karein.`,
    };
  }

  // Scoped to this partner: two partners genuinely knowing the same family is
  // an attribution question for an admin, not a reason to block a send.
  const duplicate = await prisma.partnerInvite.findFirst({
    where: {
      partnerId,
      OR: [mobile ? { mobile } : undefined, email ? { email } : undefined].filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      ),
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "DUPLICATE", message: "Inhe aap pehle hi invite bhej chuke hain." };
  }

  const invite = await prisma.partnerInvite.create({
    data: {
      partnerId,
      fullName,
      mobile,
      email,
      token: newToken(),
      channel,
      status: "PENDING",
      consentAttestedAt: new Date(),
    },
  });

  const inviteUrl = `${appOrigin()}/j/${invite.token}`;
  const ctx = { fullName, partnerName, inviteUrl };
  const shareText = inviteWhatsApp(ctx);

  // Self-send: nothing goes out from us, the row stays PENDING, and the
  // partner gets the text to paste. This is the lowest-risk path and the UI
  // presents it first.
  if (!channel) {
    return { ok: true, invite, inviteUrl, shareText, sendError: null };
  }

  const rendered = channel === "EMAIL" ? inviteEmail(ctx) : { subject: null, body: shareText };
  const provider = providerFor(channel);

  let status: InviteStatus = "SENT";
  let sendError: string | null = null;
  let sendProvider: string | null = null;
  let sendRef: string | null = null;

  try {
    const result = await provider.send({
      channel,
      recipient: { mobile, email, firstName: fullName },
      subject: rendered.subject,
      body: rendered.body,
    });
    sendProvider = result.provider;
    if (result.ok) {
      sendRef = result.providerRef;
    } else {
      status = "FAILED";
      sendError = result.message;
    }
  } catch (err) {
    status = "FAILED";
    sendError = err instanceof Error ? err.message : "Bhejne me dikkat aayi.";
  }

  // A failed send leaves a FAILED row rather than deleting the invite: the
  // link is already valid and the partner can still share it by hand, which is
  // a better outcome than losing the record of who they meant to invite.
  const updated = await prisma.partnerInvite.update({
    where: { id: invite.id },
    data: {
      status,
      sendProvider,
      sendRef,
      failureReason: sendError,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });

  return { ok: true, invite: updated, inviteUrl, shareText, sendError };
}

export type PartnerInviteRow = {
  id: string;
  fullName: string;
  /** Masked — the partner typed it, but it need not be re-displayed in full. */
  contactHint: string;
  status: InviteStatus;
  channel: OutreachChannel | null;
  failureReason: string | null;
  createdAt: string;
};

function maskContact(mobile: string | null, email: string | null): string {
  if (mobile) return `${mobile.slice(0, 3)}•••${mobile.slice(-2)}`;
  if (email) {
    const [name, domain] = email.split("@");
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  return "—";
}

export async function listPartnerInvites(partnerId: string, limit = 30): Promise<PartnerInviteRow[]> {
  const rows = await prisma.partnerInvite.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    contactHint: maskContact(r.mobile, r.email),
    status: r.status,
    channel: r.channel,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  }));
}

export type ResolvedInvite =
  | { status: "not_found" }
  | { status: "already_joined"; fullName: string; partnerName: string }
  | { status: "open"; fullName: string; partnerName: string; referralCode: string | null };

/**
 * Resolves a `/j/<token>` link. Records the open as a side effect — the first
 * time only, so a page refresh doesn't rewrite the timestamp and lose when
 * they actually looked at it.
 */
export async function resolveInvite(token: string): Promise<ResolvedInvite> {
  const invite = await prisma.partnerInvite.findUnique({
    where: { token },
    include: {
      partner: {
        select: {
          fullName: true,
          status: true,
          referralCodes: { where: { active: true }, select: { code: true }, take: 1 },
        },
      },
    },
  });
  if (!invite) return { status: "not_found" };

  if (invite.status === "JOINED") {
    return { status: "already_joined", fullName: invite.fullName, partnerName: invite.partner.fullName };
  }

  if (!invite.openedAt) {
    await prisma.partnerInvite.update({
      where: { id: invite.id },
      data: { openedAt: new Date(), status: "OPENED" },
    });
  }

  // A suspended partner's already-sent links keep working, but they stop
  // earning: no code means no attribution. The person on the other end did
  // nothing wrong and should still be able to join.
  const partnerActive = invite.partner.status === "APPROVED" || invite.partner.status === "ACTIVE";

  return {
    status: "open",
    fullName: invite.fullName,
    partnerName: invite.partner.fullName,
    referralCode: partnerActive ? (invite.partner.referralCodes[0]?.code ?? null) : null,
  };
}

/**
 * Called from registration once the account exists. Best-effort by design:
 * failing to close the loop on an invite must never cost somebody their
 * account, so this swallows its own errors the same way `createNotice` does.
 */
export async function markInviteJoined(token: string, userId: string): Promise<void> {
  try {
    await prisma.partnerInvite.updateMany({
      where: { token, convertedUserId: null },
      data: { status: "JOINED", joinedAt: new Date(), convertedUserId: userId },
    });
  } catch (err) {
    console.error("[invite] conversion write failed:", err instanceof Error ? err.message : String(err));
  }
}
