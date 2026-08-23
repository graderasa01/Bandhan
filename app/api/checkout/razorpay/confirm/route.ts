import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { confirmRazorpayCheckout, isTestGateway } from "@/lib/services/payments/gateway";
import { handleGatewayEvent } from "@/lib/services/payments/subscriptionService";

export const runtime = "nodejs";

/**
 * What Razorpay Checkout's browser success callback reports back to us.
 *
 * ## This is not "the client says it paid"
 *
 * The client supplies three strings and is believed about none of them.
 * `confirmRazorpayCheckout` re-derives the signature with our key secret and
 * then asks Razorpay's API directly what became of the payment — see its
 * header comment. Only that answer reaches `handleGatewayEvent`, which is the
 * same function the webhook calls and the same one that decides whether a
 * Subscription moves.
 *
 * ## Why not just wait for the webhook
 *
 * Because on localhost the webhook never arrives (Razorpay cannot reach a
 * private address), and in production it routinely arrives a few seconds after
 * the user is already staring at their subscription page. The webhook is still
 * the guarantee — it fires even if the tab is closed mid-payment — this route
 * just removes the wait when the tab is still open. `handleGatewayEvent` is
 * idempotent, so whichever arrives second is a no-op.
 */

const BodySchema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  if (isTestGateway()) {
    return NextResponse.json({ ok: false, message: "Razorpay checkout active nahi hai." }, { status: 403 });
  }

  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;

  // Ownership first, before spending a Razorpay API call on it: the order has
  // to be one we created *for this user*. Everything after this point is about
  // whether money moved, not about who is asking.
  const payment = await prisma.payment.findFirst({
    where: { externalOrderId: orderId, userId: user.id },
  });
  if (!payment) {
    return NextResponse.json({ ok: false, message: "Order not found." }, { status: 404 });
  }

  // Already settled by the webhook while the modal was closing — common, and
  // not worth a second round trip to Razorpay.
  if (payment.status === "CAPTURED" || payment.status === "REFUNDED") {
    return NextResponse.json({ ok: true, status: "captured" });
  }

  const confirmation = await confirmRazorpayCheckout({ orderId, paymentId, signature });

  if (confirmation.kind === "rejected") {
    console.error(`[checkout:razorpay] confirm rejected for ${payment.id}: ${confirmation.reason}`);
    return NextResponse.json({ ok: false, message: confirmation.reason }, { status: 400 });
  }

  if (confirmation.kind === "pending") {
    // Authorised, not captured. Recorded so the row stops looking untouched,
    // but no entitlement moves — the webhook will finish this when Razorpay
    // captures.
    if (payment.status === "CREATED") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "AUTHORIZED", externalPaymentId: paymentId },
      });
    }
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const outcome = await handleGatewayEvent(confirmation.event);
  if (!outcome.handled) {
    console.error(`[checkout:razorpay] unhandled event for ${payment.id}: ${outcome.reason}`);
    return NextResponse.json({ ok: false, message: "Payment confirm nahi ho payi." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: outcome.action === "failed" ? "failed" : "captured",
  });
}
