import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { isTestGateway, signDummyPayload } from "@/lib/services/payments/gateway";

export const runtime = "nodejs";

/**
 * What the dummy checkout page's "Pay" / "Simulate failure" buttons call.
 *
 * This route does not grant anything itself — its only job is to build the
 * same JSON body a real gateway's webhook call would carry, sign it with the
 * dummy secret, and POST it to `/api/webhooks/payments`. That keeps the code
 * path that actually matters (signature check → parse → `handleGatewayEvent`)
 * identical to what will run in production; the only thing this route does
 * that Razorpay wouldn't is decide CAPTURED vs FAILED, which in real life is
 * the user's bank deciding it.
 */

const BodySchema = z.object({
  orderId: z.string().min(1),
  outcome: z.enum(["success", "failure"]),
});

export async function POST(req: Request) {
  if (!isTestGateway()) {
    return NextResponse.json({ ok: false, message: "Dummy checkout is not active." }, { status: 403 });
  }

  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }
  const { orderId, outcome } = parsed.data;

  const payment = await prisma.payment.findFirst({
    where: { externalOrderId: orderId, userId: user.id },
  });
  if (!payment) {
    return NextResponse.json({ ok: false, message: "Order not found." }, { status: 404 });
  }

  const eventBody = JSON.stringify({
    orderId,
    paymentId: `dummy_pay_${payment.id.slice(0, 12)}`,
    status: outcome === "success" ? "CAPTURED" : "FAILED",
    amountPaise: payment.amountPaise,
    failureReason: outcome === "failure" ? "Card declined (simulated)." : undefined,
  });

  const signature = signDummyPayload(eventBody);
  const webhookUrl = new URL("/api/webhooks/payments", req.url);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dummy-signature": signature },
    body: eventBody,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[checkout:dummy] webhook call failed:", res.status, text);
    return NextResponse.json({ ok: false, message: "Payment could not be confirmed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, outcome });
}
