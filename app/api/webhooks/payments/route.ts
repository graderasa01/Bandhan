import { NextResponse } from "next/server";
import { getPaymentGateway } from "@/lib/services/payments/gateway";
import { handleGatewayEvent } from "@/lib/services/payments/subscriptionService";

export const runtime = "nodejs";

/**
 * One endpoint for both gateways — dummy and Razorpay alike.
 *
 * This is the only place a Subscription is ever created or extended (see
 * subscriptionService's header comment). No user-facing route may grant plan
 * access; only a verified webhook may.
 *
 * The signature header name differs by provider in real life
 * (`x-razorpay-signature` for Razorpay), so both are checked — the dummy
 * gateway's checkout page sends `x-dummy-signature`, and whichever gateway is
 * actually configured is the only one `verifyWebhook` will accept regardless
 * of which header carried it.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-razorpay-signature") ?? req.headers.get("x-dummy-signature");

  const gateway = getPaymentGateway();
  if (!gateway.verifyWebhook(rawBody, signature)) {
    console.error("[webhook:payments] signature verification failed.");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const event = gateway.parseWebhook(rawBody);
  if (!event) {
    return NextResponse.json({ ok: false, message: "Unrecognised payload." }, { status: 400 });
  }

  const outcome = await handleGatewayEvent(event);
  if (!outcome.handled) {
    console.error(`[webhook:payments] unhandled event: ${outcome.reason}`);
    // 200 anyway — a gateway retries on non-2xx, and retrying an order we
    // don't recognise will never start recognising it. Logged for a human.
    return NextResponse.json({ ok: true, note: outcome.reason });
  }

  return NextResponse.json({ ok: true, action: outcome.action });
}
