import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import {
  ENQUIRY_REDACTION_NOTE,
  MAX_ENQUIRY_MESSAGE_CHARS,
  redactContactDetails,
} from "./servicePolicy";
import type { EnquiryAuthor } from "@prisma/client";

/**
 * Pre-booking conversation — the thing that lets a buyer ask "can you actually
 * help me?" without either side handing over a phone number.
 *
 * ## Why this exists at all
 *
 * The plan's rule is blunt: *do not show a raw phone directory; before booking,
 * communication stays through the platform.* Removing the phone field from the
 * partner card only satisfies the letter of that. A marketplace where the first
 * message is "9876543210 par call karo" is a directory you have to ask for one
 * row at a time. So messages are scrubbed at write time
 * (`redactContactDetails`), and what is stored is what may be read — no reader
 * change can un-redact anything later.
 *
 * The scrubber is deliberately not clever (see its own note). It removes the
 * easy path and makes the attempt visible via `redacted`; it is not trying to
 * beat somebody spelling digits out in words, and pretending otherwise would
 * be the more dangerous design because it would invite trusting the output.
 *
 * ## One thread per pair
 *
 * `@@unique([partnerId, userId])`. A second thread would split the history that
 * makes a later dispute answerable, and would let a partner answer politely in
 * one and rudely in another.
 *
 * ## Rate limiting
 *
 * A partner is a small business with a phone in their pocket. Twenty messages
 * in a minute from one member is not a conversation, so a member gets a cap per
 * thread per hour — enough to have a real exchange, not enough to be a channel.
 */

const MAX_MESSAGES_PER_HOUR = 15;
const HOUR_MS = 60 * 60 * 1000;

export type EnquiryResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status = 422) {
  return { ok: false as const, error, message, status };
}

export { ENQUIRY_REDACTION_NOTE };

/* ------------------------------------------------------------------ */
/* Open / send                                                         */
/* ------------------------------------------------------------------ */

export async function sendEnquiryMessage(params: {
  partnerId: string;
  userId: string;
  author: EnquiryAuthor;
  body: string;
  serviceId?: string | null;
  requestCall?: boolean;
}): Promise<EnquiryResult<{ enquiryId: string; redacted: boolean }>> {
  const raw = params.body.trim();
  if (raw.length === 0) return fail("EMPTY", "Kuch likhiye.");
  if (raw.length > MAX_ENQUIRY_MESSAGE_CHARS) {
    return fail("TOO_LONG", `Message ${MAX_ENQUIRY_MESSAGE_CHARS} characters se chhota rakhiye.`);
  }

  // A member may only start a thread with a partner who is actually listed —
  // otherwise this becomes a way to message any partner account by id.
  const listing = await prisma.partnerMarketplaceProfile.findFirst({
    where: {
      partnerId: params.partnerId,
      isListed: true,
      approvedAt: { not: null },
      partner: { status: { in: ["APPROVED", "ACTIVE"] } },
    },
    select: { partnerId: true, partner: { select: { userId: true, fullName: true } } },
  });
  if (!listing) return fail("NOT_FOUND", "Ye partner abhi available nahi hai.", 404);
  if (listing.partner.userId === params.userId) {
    return fail("SELF", "Apne aap ko message nahi bhej sakte.", 403);
  }

  const { body, redacted } = redactContactDetails(raw);
  const now = new Date();

  const existing = await prisma.partnerEnquiry.findUnique({
    where: { partnerId_userId: { partnerId: params.partnerId, userId: params.userId } },
    select: { id: true, status: true },
  });

  if (existing) {
    const recent = await prisma.partnerEnquiryMessage.count({
      where: { enquiryId: existing.id, author: params.author, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
    });
    if (recent >= MAX_MESSAGES_PER_HOUR) {
      return fail("RATE_LIMITED", "Ek ghante me itne messages kaafi hain. Thodi der baad likhiye.", 429);
    }
  }

  const enquiry = await prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.partnerEnquiry.update({
          where: { id: existing.id },
          data: {
            lastMessageAt: now,
            status: params.author === "PARTNER" ? "ANSWERED" : "OPEN",
            ...(params.serviceId ? { serviceId: params.serviceId } : {}),
            ...(params.requestCall ? { callRequested: true, callRequestedAt: now } : {}),
            ...(params.author === "USER"
              ? { partnerUnreadCount: { increment: 1 } }
              : { userUnreadCount: { increment: 1 } }),
          },
        })
      : await tx.partnerEnquiry.create({
          data: {
            partnerId: params.partnerId,
            userId: params.userId,
            serviceId: params.serviceId ?? null,
            status: params.author === "PARTNER" ? "ANSWERED" : "OPEN",
            callRequested: Boolean(params.requestCall),
            callRequestedAt: params.requestCall ? now : null,
            lastMessageAt: now,
            partnerUnreadCount: params.author === "USER" ? 1 : 0,
            userUnreadCount: params.author === "PARTNER" ? 1 : 0,
          },
        });

    await tx.partnerEnquiryMessage.create({
      data: { enquiryId: row.id, author: params.author, body, redacted },
    });

    return row;
  });

  // The notice carries no message text. A partner enquiry can contain anything
  // a member typed, and a push notification is read off a lock screen by
  // whoever is holding the phone — the same masking rule `createNotice`'s own
  // header sets out.
  await createNotice({
    userId: params.author === "USER" ? listing.partner.userId : params.userId,
    kind: "SERVICE_UPDATE",
    title: params.author === "USER" ? "Ek naya sawaal aaya hai" : "Partner ne jawaab diya hai",
    body: params.requestCall
      ? "Call ki request ke saath. Platform par jaakar dekh lijiye."
      : "Platform par jaakar padh lijiye.",
    href: params.author === "USER" ? "/partner/enquiries" : "/user/services",
    relatedId: enquiry.id,
  });

  return { ok: true, enquiryId: enquiry.id, redacted };
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function getThreadForUser(userId: string, partnerId: string) {
  const row = await prisma.partnerEnquiry.findUnique({
    where: { partnerId_userId: { partnerId, userId } },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
      partner: { select: { fullName: true, organizationName: true } },
      service: { select: { name: true } },
    },
  });
  if (!row) return null;
  if (row.userUnreadCount > 0) {
    await prisma.partnerEnquiry.update({ where: { id: row.id }, data: { userUnreadCount: 0 } });
  }
  return row;
}

export async function listThreadsForUser(userId: string) {
  return prisma.partnerEnquiry.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      partner: { select: { id: true, fullName: true, organizationName: true } },
      service: { select: { name: true } },
    },
  });
}

export async function listThreadsForPartner(partnerId: string) {
  return prisma.partnerEnquiry.findMany({
    where: { partnerId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      user: { select: { fullName: true } },
      service: { select: { name: true } },
    },
  });
}

export async function getThreadForPartner(partnerId: string, enquiryId: string) {
  const row = await prisma.partnerEnquiry.findUnique({
    where: { id: enquiryId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
      // First name only. A partner answering a pre-booking question has no
      // business holding the member's full identity, and nothing on this
      // screen needs it.
      user: { select: { fullName: true } },
      service: { select: { name: true } },
    },
  });
  if (!row || row.partnerId !== partnerId) return null;
  if (row.partnerUnreadCount > 0) {
    await prisma.partnerEnquiry.update({ where: { id: row.id }, data: { partnerUnreadCount: 0 } });
  }
  return { ...row, user: { firstName: row.user.fullName.split(" ")[0] } };
}

/** Marks the thread converted when its buyer books something from this partner. */
export async function markEnquiryConverted(partnerId: string, userId: string): Promise<void> {
  await prisma.partnerEnquiry.updateMany({
    where: { partnerId, userId, status: { in: ["OPEN", "ANSWERED"] } },
    data: { status: "CONVERTED" },
  });
}

export async function closeThread(partnerId: string, enquiryId: string): Promise<EnquiryResult> {
  const updated = await prisma.partnerEnquiry.updateMany({
    where: { id: enquiryId, partnerId },
    data: { status: "CLOSED" },
  });
  if (updated.count === 0) return fail("NOT_FOUND", "Ye baat-cheet nahi mili.", 404);
  return { ok: true };
}
