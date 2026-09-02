import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPaymentGateway, isTestGateway } from "@/lib/services/payments/gateway";
import { createNotice } from "@/lib/services/notice/noticeService";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { getRishtaSummary } from "@/lib/services/rishta/journeyService";
import { getVerificationFee } from "@/lib/services/marketplace/pricingControl";
import {
  MAX_DECLINE_REASON_CHARS,
  MAX_REQUEST_MESSAGE_CHARS,
  REQUEST_EXPIRY_DAYS,
  catalogFor,
  isRequestable,
  splitFee,
} from "./verificationCatalog";
import type { Payment, Prisma, VerificationKind, VerificationPayer, VerificationRequest } from "@prisma/client";

/**
 * One member asking another to prove one thing, and the money that pays for it.
 *
 * ## The rule the whole file is arranged around
 *
 * **Paying does not change the result.** Every function here writes
 * `VerificationRequest.status` and nothing else; `VerificationCheck.outcome` is
 * written in exactly one place, `humanVerificationQueue.recordResult`, which
 * never reads a payment. A capture can move a request to ACCEPTED and create an
 * *empty* check. It cannot fill one in.
 *
 * ## Who may ask whom
 *
 * Only somebody the subject already has a rishta with — the same
 * `getRishtaSummary` gate the Rishta Room uses. Verification is a conversation
 * between two people who are considering each other, and an endpoint that let
 * any account demand proof of identity from any other would be a harassment
 * tool with a payment form attached.
 *
 * Once per kind, ever, per pair: `@@unique([requesterUserId, subjectUserId,
 * kind])`. Somebody who said no does not get asked again next week.
 *
 * ## Refunds
 *
 * A declined, cancelled or unfinishable check returns the money. The row is
 * marked REFUNDED here and the gateway call is not made from this codebase —
 * the same thing `refundBooking` does, deliberately mirrored rather than
 * invented, so both money paths reconcile the same way for whoever settles them.
 */

export type RequestResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status: number): RequestResult<never> {
  return { ok: false, error, message, status };
}

export interface CreateRequestInput {
  requesterUserId: string;
  subjectUserId: string;
  kind: VerificationKind;
  payer: VerificationPayer;
  message?: string | null;
}

/**
 * Raise the ask. Returns a checkout when the requester owes a share, and
 * nothing to pay when they do not — the subject is told in both cases, but only
 * after the requester's money is actually in (see `VerificationRequestStatus`).
 */
export async function createVerificationRequest(
  input: CreateRequestInput,
): Promise<RequestResult<{ requestId: string; checkoutUrl: string | null; isTest: boolean }>> {
  if (input.requesterUserId === input.subjectUserId) {
    return fail("SELF_REQUEST", "Apne aap se verification nahi maang sakte.", 422);
  }
  if (!isRequestable(input.kind)) {
    return fail("NOT_REQUESTABLE", "Ye check kisi aur se nahi mangwaya ja sakta.", 422);
  }

  const [rishta, blocked] = await Promise.all([
    getRishtaSummary(input.requesterUserId, input.subjectUserId),
    isBlockedEitherWay(input.requesterUserId, input.subjectUserId),
  ]);
  if (!rishta || blocked) {
    // Same 404 for "no relationship" and "blocked": neither answer is one this
    // endpoint should be able to tell apart for a caller who has neither.
    return fail("NO_RISHTA", "Is insaan se abhi koi rishta nahi hai.", 404);
  }

  const existing = await prisma.verificationRequest.findUnique({
    where: {
      requesterUserId_subjectUserId_kind: {
        requesterUserId: input.requesterUserId,
        subjectUserId: input.subjectUserId,
        kind: input.kind,
      },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return fail(
      "ALREADY_ASKED",
      existing.status === "DECLINED"
        ? "Ye ek baar maanga ja chuka hai aur unhone mana kiya tha. Dobara maangna ab baat-cheet ka kaam hai, button ka nahi."
        : "Ye check pehle se maanga hua hai.",
      409,
    );
  }

  const catalog = catalogFor(input.kind);
  // The fee an admin has set, falling back to the catalog's. Zero is legal and
  // means this check is free to ask for.
  const feePaise = await getVerificationFee(input.kind);
  const { requesterPaise, subjectPaise } = splitFee(feePaise, input.payer);
  const expiresAt = new Date(Date.now() + REQUEST_EXPIRY_DAYS * 86_400_000);

  const request = await prisma.verificationRequest.create({
    data: {
      requesterUserId: input.requesterUserId,
      subjectUserId: input.subjectUserId,
      kind: input.kind,
      payer: input.payer,
      feePaise,
      requesterPaise,
      subjectPaise,
      message: input.message?.trim().slice(0, MAX_REQUEST_MESSAGE_CHARS) || null,
      status: requesterPaise > 0 ? "AWAITING_PAYMENT" : "AWAITING_SUBJECT",
      expiresAt,
    },
  });

  if (requesterPaise === 0) {
    await notifySubjectOfAsk(request);
    return { ok: true, requestId: request.id, checkoutUrl: null, isTest: isTestGateway() };
  }

  const checkout = await startShare(request.id, input.requesterUserId, requesterPaise, "requester");
  if (!checkout.ok) {
    // The request row is useless without its funding, and leaving it would
    // burn this pair's one allowed ask on a checkout that never opened.
    await prisma.verificationRequest.delete({ where: { id: request.id } }).catch(() => {});
    return checkout;
  }
  return { ok: true, requestId: request.id, checkoutUrl: checkout.checkoutUrl, isTest: isTestGateway() };
}

/** Creates one side's Payment row and its gateway order. */
async function startShare(
  requestId: string,
  userId: string,
  amountPaise: number,
  side: "requester" | "subject",
): Promise<RequestResult<{ checkoutUrl: string }>> {
  const payment = await prisma.payment.create({
    data: {
      userId,
      kind: "VERIFICATION",
      planCode: null,
      amountPaise,
      status: "CREATED",
      isTest: isTestGateway(),
    },
  });

  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: side === "requester" ? { requesterPaymentId: payment.id } : { subjectPaymentId: payment.id },
  });

  try {
    const order = await getPaymentGateway().createOrder({
      amountPaise,
      receipt: payment.id,
      notes: { userId, verificationRequestId: requestId },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { externalOrderId: order.orderId } });
    return { ok: true, checkoutUrl: order.checkoutUrl };
  } catch (err) {
    console.error("[verification] order creation failed:", err instanceof Error ? err.message : String(err));
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Order banane me dikkat aayi." },
    });
    return fail("CHECKOUT_FAILED", "Payment shuru nahi ho payi — thodi der me dobara try karein.", 502);
  }
}

async function notifySubjectOfAsk(request: VerificationRequest): Promise<void> {
  const catalog = catalogFor(request.kind);
  await createNotice({
    userId: request.subjectUserId,
    kind: "VERIFICATION_UPDATE",
    // Names the ask, not the asker: a lock screen is read by whoever is holding
    // the phone, and "X ne aapse pehchaan ka proof maanga" says who somebody is
    // talking to. Masking rule, applied to verification.
    title: "Aapse ek verification maanga gaya hai",
    body: `${catalog.label} — aap haan ya na keh sakte hain.`,
    href: "/user/verification",
    relatedId: request.id,
    actorMasked: true,
  });
}

/* ------------------------------------------------------------------ */
/* Capture (called from handleGatewayEvent)                            */
/* ------------------------------------------------------------------ */

export interface VerificationFulfilment {
  requestId: string;
  kind: VerificationKind;
  requesterUserId: string;
  subjectUserId: string;
  /** Which share landed. */
  side: "requester" | "subject";
  /** True when this capture created the check — i.e. the work now starts. */
  checkStarted: boolean;
}

/**
 * A captured verification share.
 *
 * Note what it cannot do: there is no branch here that writes an outcome, a
 * scope sentence or an expiry. It moves a status and, when both shares are in,
 * creates an **empty** check for a human to fill.
 */
export async function fulfilVerificationPayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
  now: Date,
): Promise<VerificationFulfilment> {
  const request = await tx.verificationRequest.findFirst({
    where: { OR: [{ requesterPaymentId: payment.id }, { subjectPaymentId: payment.id }] },
  });
  if (!request) throw new Error(`verification payment ${payment.id} has no request`);

  const side: "requester" | "subject" = request.requesterPaymentId === payment.id ? "requester" : "subject";

  if (side === "requester") {
    await tx.verificationRequest.update({
      where: { id: request.id },
      data: { status: "AWAITING_SUBJECT" },
    });
    return {
      requestId: request.id,
      kind: request.kind,
      requesterUserId: request.requesterUserId,
      subjectUserId: request.subjectUserId,
      side,
      checkStarted: false,
    };
  }

  const check = await tx.verificationCheck.create({
    data: { subjectUserId: request.subjectUserId, kind: request.kind },
    select: { id: true },
  });
  await tx.verificationRequest.update({
    where: { id: request.id },
    data: { status: "ACCEPTED", subjectDecidedAt: request.subjectDecidedAt ?? now, checkId: check.id },
  });

  return {
    requestId: request.id,
    kind: request.kind,
    requesterUserId: request.requesterUserId,
    subjectUserId: request.subjectUserId,
    side,
    checkStarted: true,
  };
}

/** A share that never landed cancels the ask, so nothing looks merely pending. */
export async function cancelRequestForFailedPayment(paymentId: string): Promise<void> {
  const request = await prisma.verificationRequest.findFirst({
    where: {
      OR: [{ requesterPaymentId: paymentId }, { subjectPaymentId: paymentId }],
      status: { in: ["AWAITING_PAYMENT", "AWAITING_SUBJECT"] },
    },
    select: { id: true, requesterPaymentId: true },
  });
  if (!request) return;

  await prisma.verificationRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED" },
  });
}

/* ------------------------------------------------------------------ */
/* The subject's answer                                                */
/* ------------------------------------------------------------------ */

export async function subjectDecide(
  subjectUserId: string,
  requestId: string,
  input: { accept: boolean; declineReason?: string | null },
): Promise<RequestResult<{ checkoutUrl: string | null }>> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
  if (!request || request.subjectUserId !== subjectUserId) {
    return fail("NOT_FOUND", "Ye request nahi mili.", 404);
  }
  if (request.status !== "AWAITING_SUBJECT") {
    return fail("BAD_STATE", "Is par jawaab pehle hi ja chuka hai.", 409);
  }

  const now = new Date();

  if (!input.accept) {
    await prisma.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: "DECLINED",
        subjectDecidedAt: now,
        declineReason: input.declineReason?.trim().slice(0, MAX_DECLINE_REASON_CHARS) || null,
      },
    });
    await refundRequest(requestId, now);

    await createNotice({
      userId: request.requesterUserId,
      kind: "VERIFICATION_UPDATE",
      title: "Verification par jawaab aa gaya",
      body: `${catalogFor(request.kind).label} — unhone mana kiya. Aapka paisa wapas kar diya gaya hai.`,
      href: "/user/verification",
      relatedId: request.id,
      actorMasked: true,
    });
    return { ok: true, checkoutUrl: null };
  }

  // Accepting when you owe a share means paying it; the request stays with the
  // subject until that lands, so a half-funded check never reaches the queue.
  if (request.subjectPaise > 0 && !request.subjectPaymentId) {
    const checkout = await startShare(request.id, subjectUserId, request.subjectPaise, "subject");
    if (!checkout.ok) return checkout;
    return { ok: true, checkoutUrl: checkout.checkoutUrl };
  }

  const check = await prisma.verificationCheck.create({
    data: { subjectUserId, kind: request.kind },
    select: { id: true },
  });
  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: { status: "ACCEPTED", subjectDecidedAt: now, checkId: check.id },
  });

  await createNotice({
    userId: request.requesterUserId,
    kind: "VERIFICATION_UPDATE",
    title: "Verification shuru ho gaya",
    body: `${catalogFor(request.kind).label} — unhone haan kar di. Team check kar rahi hai.`,
    href: "/user/verification",
    relatedId: request.id,
    actorMasked: true,
  });
  return { ok: true, checkoutUrl: null };
}

export async function cancelRequest(requesterUserId: string, requestId: string): Promise<RequestResult> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
  if (!request || request.requesterUserId !== requesterUserId) {
    return fail("NOT_FOUND", "Ye request nahi mili.", 404);
  }
  if (!["AWAITING_PAYMENT", "AWAITING_SUBJECT"].includes(request.status)) {
    return fail("BAD_STATE", "Ab ise wapas nahi liya ja sakta.", 409);
  }

  const now = new Date();
  await prisma.verificationRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  await refundRequest(requestId, now);
  return { ok: true };
}

/**
 * Marks both shares refunded.
 *
 * The gateway call is not made from here — `refundBooking` does the same and
 * for the same reason: one place settles money with the provider, and two
 * half-implementations of that would be worse than one honest ledger entry.
 */
export async function refundRequest(requestId: string, now = new Date()): Promise<void> {
  const request = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    select: { requesterPaymentId: true, subjectPaymentId: true },
  });
  if (!request) return;

  const ids = [request.requesterPaymentId, request.subjectPaymentId].filter((x): x is string => Boolean(x));
  if (ids.length > 0) {
    await prisma.payment.updateMany({
      where: { id: { in: ids }, status: "CAPTURED" },
      data: { status: "REFUNDED", refundedAt: now },
    });
  }
  await prisma.verificationRequest.update({ where: { id: requestId }, data: { refundedAt: now } });
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Expiry without a scheduler — the same write-through `hasDelegatedPermission`
 * and the Rishta Room's request queue both use. An ask nobody answered stops
 * being an open question the first time anybody looks.
 */
async function expireStale(userId: string, now: Date): Promise<void> {
  await prisma.verificationRequest.updateMany({
    where: {
      OR: [{ requesterUserId: userId }, { subjectUserId: userId }],
      status: { in: ["AWAITING_PAYMENT", "AWAITING_SUBJECT"] },
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
}

export interface VerificationRequestView {
  id: string;
  kind: VerificationKind;
  label: string;
  status: VerificationRequest["status"];
  payer: VerificationPayer;
  feePaise: number;
  yourSharePaise: number;
  message: string | null;
  declineReason: string | null;
  outcome: string | null;
  resultNote: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Asks pointed at this user, and asks they made. Never anybody else's. */
export async function listVerificationRequests(
  userId: string,
  now: Date = new Date(),
): Promise<{ incoming: VerificationRequestView[]; outgoing: VerificationRequestView[] }> {
  await expireStale(userId, now);

  const rows = await prisma.verificationRequest.findMany({
    where: { OR: [{ requesterUserId: userId }, { subjectUserId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      // Outcome and the member-safe note only. `evidenceNote` is not selected,
      // here or anywhere else outside the admin queue.
      check: { select: { outcome: true, resultNote: true } },
    },
  });

  const view = (r: (typeof rows)[number], mine: "requester" | "subject"): VerificationRequestView => ({
    id: r.id,
    kind: r.kind,
    label: catalogFor(r.kind).label,
    status: r.status,
    payer: r.payer,
    feePaise: r.feePaise,
    yourSharePaise: mine === "requester" ? r.requesterPaise : r.subjectPaise,
    message: r.message,
    declineReason: r.declineReason,
    outcome: r.check?.outcome ?? null,
    resultNote: r.check?.resultNote ?? null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  });

  return {
    // AWAITING_PAYMENT is filtered out of the *subject's* half, not just kept
    // out of their notifications. An ask nobody has funded yet showing up on
    // their screen is the same free pressure the status was invented to
    // prevent — the difference between "he asked me" and "he asked me and
    // meant it" is the payment. The requester keeps seeing it in `outgoing`,
    // where it is their own unfinished checkout.
    incoming: rows
      .filter((r) => r.subjectUserId === userId && r.status !== "AWAITING_PAYMENT")
      .map((r) => view(r, "subject")),
    outgoing: rows.filter((r) => r.requesterUserId === userId).map((r) => view(r, "requester")),
  };
}

/** One pair's verification state, for the Rishta Room. */
export async function getPairVerification(viewerUserId: string, otherUserId: string, now: Date = new Date()) {
  await expireStale(viewerUserId, now);
  const rows = await prisma.verificationRequest.findMany({
    where: {
      OR: [
        { requesterUserId: viewerUserId, subjectUserId: otherUserId },
        { requesterUserId: otherUserId, subjectUserId: viewerUserId },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { check: { select: { outcome: true, resultNote: true } } },
  });

  return {
    asked: rows
      .filter((r) => r.requesterUserId === viewerUserId)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        label: catalogFor(r.kind).label,
        status: r.status,
        outcome: r.check?.outcome ?? null,
        resultNote: r.check?.resultNote ?? null,
        declineReason: r.declineReason,
      })),
    askedOfMe: rows
      // Same rule as `listVerificationRequests`: an unfunded ask is not yet an
      // ask, on any surface.
      .filter((r) => r.subjectUserId === viewerUserId && r.status !== "AWAITING_PAYMENT")
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        label: catalogFor(r.kind).label,
        status: r.status,
        message: r.message,
        yourSharePaise: r.subjectPaise,
      })),
  };
}
